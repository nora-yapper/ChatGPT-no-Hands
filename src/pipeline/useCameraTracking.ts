"use client";

import { useCallback, useEffect, useRef } from "react";
import { MediaPipeProvider } from "@/tracking/MediaPipeProvider";
import { requestCamera, stopStream } from "@/tracking/camera";
import { labStore } from "@/store/labStore";
import { pipeline } from "./Pipeline";

/** Owns the camera stream + tracking provider lifecycle and wires frames into the pipeline. */
export function useCameraTracking() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const providerRef = useRef<MediaPipeProvider | null>(null);
  const startingRef = useRef(false);

  const stop = useCallback(() => {
    pipeline.stopReplay();
    providerRef.current?.stop();
    providerRef.current = null;
    pipeline.detachProvider();
    stopStream(streamRef.current);
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    labStore.update({
      camera: { status: "idle", message: null, width: 0, height: 0 },
      tracking: { ...labStore.latest.tracking, status: "idle", fps: 0, message: null },
      frame: null,
      quality: { ...labStore.latest.quality, faceDetected: false, overall: 0, issues: ["Camera stopped"] },
    });
  }, []);

  const start = useCallback(async () => {
    if (startingRef.current) return;
    startingRef.current = true;
    try {
      labStore.update({ camera: { status: "requesting", message: null, width: 0, height: 0 }, sessionStart: performance.now() });
      const cam = await requestCamera();
      if (!cam.stream) {
        labStore.update({ camera: { status: cam.status, message: cam.message, width: 0, height: 0 } });
        return;
      }
      streamRef.current = cam.stream;
      const video = videoRef.current;
      if (!video) throw new Error("video element not mounted");
      video.srcObject = cam.stream;
      await video.play();
      const settings = cam.stream.getVideoTracks()[0]?.getSettings();
      labStore.update({
        camera: { status: "active", message: null, width: settings?.width ?? video.videoWidth, height: settings?.height ?? video.videoHeight },
        tracking: { ...labStore.latest.tracking, status: "loading", message: "Loading MediaPipe Face Landmarker…" },
      });
      const provider = new MediaPipeProvider();
      providerRef.current = provider;
      pipeline.attachProvider(provider);
      await provider.start(video);
      labStore.update({ tracking: { ...labStore.latest.tracking, status: "running", message: `delegate: ${provider.delegateUsed}` } });
      pipeline.bus.emit({ type: "SYSTEM", timestamp: performance.now(), confidence: 1, source: "system", metadata: { note: `Tracking started (${provider.name}, ${provider.delegateUsed})` } });
    } catch (err) {
      console.error(err);
      labStore.update({ tracking: { ...labStore.latest.tracking, status: "error", message: `Tracking failed to start: ${String(err)}. Check that /mediapipe/wasm and /models/face_landmarker.task are served (run npm run setup-assets).` } });
    } finally {
      startingRef.current = false;
    }
  }, []);

  useEffect(() => stop, [stop]);

  return { videoRef, start, stop };
}

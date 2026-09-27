import type { CameraStatus } from "@/store/labStore";

export interface CameraResult {
  status: CameraStatus;
  message: string | null;
  stream: MediaStream | null;
}

/** Requests the user-facing webcam. Never sends frames anywhere; the stream is attached to a local <video>. */
export async function requestCamera(): Promise<CameraResult> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return { status: "unavailable", message: "This browser does not expose navigator.mediaDevices.getUserMedia. Use a recent Chrome/Edge/Firefox/Safari over https or localhost.", stream: null };
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user", frameRate: { ideal: 30 } },
      audio: false,
    });
    return { status: "active", message: null, stream };
  } catch (err) {
    const e = err as DOMException;
    const name = e?.name ?? "Error";
    const messages: Record<string, string> = {
      NotAllowedError: "Camera permission denied. Allow camera access for this site in the browser's address-bar permissions and press Start again.",
      NotFoundError: "No camera found. Connect a webcam and press Start again.",
      NotReadableError: "Camera is in use by another application or blocked by the OS. Close other apps using the camera (Zoom, FaceTime, OBS…) and retry.",
      OverconstrainedError: "The camera does not support the requested resolution. Try again; the lab will accept any resolution.",
      SecurityError: "Camera blocked by browser security policy. The page must be served over https or localhost.",
      AbortError: "Camera request was aborted by the browser.",
    };
    return { status: name === "NotAllowedError" ? "denied" : "error", message: `${name}: ${messages[name] ?? e?.message ?? "Unknown camera error"}`, stream: null };
  }
}

export function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((t) => t.stop());
}

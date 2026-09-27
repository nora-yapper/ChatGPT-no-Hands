// Copies MediaPipe wasm files and downloads the Face Landmarker model into public/
// so the app runs fully locally after install (no CDN at runtime).
import { cpSync, existsSync, mkdirSync, writeFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const wasmSrc = join(root, "node_modules/@mediapipe/tasks-vision/wasm");
const wasmDst = join(root, "public/mediapipe/wasm");
const modelDst = join(root, "public/models/face_landmarker.task");
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

if (!existsSync(wasmSrc)) {
  console.error("[setup-assets] @mediapipe/tasks-vision not installed; skipping.");
  process.exit(0);
}
mkdirSync(wasmDst, { recursive: true });
cpSync(wasmSrc, wasmDst, { recursive: true });
console.log("[setup-assets] wasm copied to public/mediapipe/wasm");

if (existsSync(modelDst) && statSync(modelDst).size > 1_000_000) {
  console.log("[setup-assets] model already present, skipping download");
} else {
  console.log("[setup-assets] downloading face_landmarker.task ...");
  try {
    const res = await fetch(MODEL_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    mkdirSync(dirname(modelDst), { recursive: true });
    writeFileSync(modelDst, buf);
    console.log(`[setup-assets] model saved (${(buf.length / 1e6).toFixed(1)} MB)`);
  } catch (err) {
    console.error(
      `[setup-assets] model download failed: ${err}. Download manually from\n  ${MODEL_URL}\ninto public/models/face_landmarker.task`,
    );
  }
}

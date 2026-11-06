import { useEffect, useRef, useState } from "react";
import { Camera, CameraOff, Loader2, ShieldCheck, AlertTriangle } from "lucide-react";
import type { FaceLandmarker, PoseLandmarker } from "@mediapipe/tasks-vision";
import { cn } from "@/lib/utils";

type Phase = "off" | "loading" | "running" | "unsupported" | "denied" | "model-error" | "camera-error" | "frame-error";
type Reading = { face: string | null; faceOk: boolean; gaze: string | null; gazeOk: boolean; posture: string | null; postureOk: boolean };

const WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.2/wasm";
const FACE_MODEL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const POSE_MODEL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

export function PostureCoach() {
  const supported = typeof window !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof WebAssembly !== "undefined";
  const [phase, setPhase] = useState<Phase>(supported ? "off" : "unsupported");
  const [consent, setConsent] = useState(false);
  const [reading, setReading] = useState<Reading | null>(null);
  const [detail, setDetail] = useState("");
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const face = useRef<FaceLandmarker | null>(null);
  const pose = useRef<PoseLandmarker | null>(null);
  const raf = useRef<number | null>(null);
  const lastTs = useRef(0);
  const gen = useRef(0);
  const fails = useRef(0);

  const stop = () => {
    gen.current += 1;
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    face.current?.close(); face.current = null;
    pose.current?.close(); pose.current = null;
    if (video.current) video.current.srcObject = null;
    setReading(null);
  };

  useEffect(() => () => stop(), []);

  const loop = (my: number) => {
    const v = video.current;
    if (my !== gen.current || !v || !face.current || !pose.current) return;
    const now = performance.now();
    if (v.readyState >= 2 && now - lastTs.current > 120) {
      lastTs.current = now;
      try {
        const f = face.current.detectForVideo(v, now);
        const p = pose.current.detectForVideo(v, now);
        const r: Reading = { face: null, faceOk: false, gaze: null, gazeOk: false, posture: null, postureOk: false };
        const lm = f.faceLandmarks[0];
        if (lm) {
          const nose = lm[1], l = lm[234], rr = lm[454], top = lm[10], chin = lm[152];
          const yaw = (nose.x - (l.x + rr.x) / 2) / Math.max(0.001, Math.abs(rr.x - l.x));
          const pitch = (nose.y - (top.y + chin.y) / 2) / Math.max(0.001, Math.abs(chin.y - top.y));
          if (Math.abs(yaw) > 0.12) r.face = "Head turned to the side. Bring your face back toward the camera.";
          else if (pitch > 0.12) r.face = "Head tilted down. Raise your chin slightly toward the lens.";
          else if (pitch < -0.05) r.face = "Head tilted up. Level your gaze with the camera.";
          else { r.face = "Facing the camera."; r.faceOk = true; }
          if (lm.length >= 478) {
            const h = (iris: number, a: number, b: number) => (lm[iris].x - lm[a].x) / Math.max(0.001, lm[b].x - lm[a].x);
            const vv = (iris: number, t: number, bt: number) => (lm[iris].y - lm[t].y) / Math.max(0.001, lm[bt].y - lm[t].y);
            const gx = (h(468, 33, 133) + h(473, 362, 263)) / 2;
            const gy = (vv(468, 159, 145) + vv(473, 386, 374)) / 2;
            if (gx < 0.38 || gx > 0.62) r.gaze = "Eyes appear directed to the side of the camera.";
            else if (gy > 0.7) r.gaze = "Eyes appear directed below the camera, perhaps at notes or the screen.";
            else { r.gaze = "Eyes appear roughly toward the camera."; r.gazeOk = true; }
          } else r.gaze = "Eye landmarks unavailable for this frame.";
        } else { r.face = "No face detected in frame."; r.gaze = "No face detected in frame."; }
        const pl = p.landmarks[0];
        if (pl && pl[11].visibility! > 0.5 && pl[12].visibility! > 0.5) {
          const dy = pl[11].y - pl[12].y, dx = pl[11].x - pl[12].x;
          const tilt = Math.abs((Math.atan2(dy, dx) * 180) / Math.PI);
          const deg = Math.min(tilt, 180 - tilt);
          const cx = (pl[11].x + pl[12].x) / 2;
          if (deg > 7) r.posture = `Shoulders uneven by about ${Math.round(deg)} degrees. Sit square to the camera.`;
          else if (Math.abs(cx - 0.5) > 0.18) r.posture = "You're off-center. Shift so your shoulders sit in the middle of the frame.";
          else { r.posture = "Shoulders level and centered."; r.postureOk = true; }
        } else r.posture = "Shoulders not visible. Move back so both are in frame.";
        fails.current = 0;
        setReading(r);
      } catch (e) {
        fails.current += 1;
        if (fails.current >= 10) {
          stop();
          setDetail(e instanceof Error ? e.message : "Detection repeatedly failed.");
          setPhase("frame-error");
          return;
        }
      }
    }
    raf.current = requestAnimationFrame(() => loop(my));
  };

  const start = async () => {
    stop();
    const my = gen.current;
    const stale = () => my !== gen.current;
    fails.current = 0;
    setPhase("loading");
    setDetail("");
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: "user" }, audio: false });
      if (stale()) { s.getTracks().forEach((t) => t.stop()); return; }
      stream.current = s;
      if (video.current) { video.current.srcObject = s; await video.current.play(); }
      if (stale()) return;
    } catch (e) {
      if (stale()) return;
      stop();
      setPhase(e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "SecurityError") ? "denied" : "camera-error");
      return;
    }
    try {
      const vision = await import("@mediapipe/tasks-vision");
      const files = await vision.FilesetResolver.forVisionTasks(WASM);
      if (stale()) return;
      const fl = await vision.FaceLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: FACE_MODEL }, runningMode: "VIDEO", numFaces: 1 });
      if (stale()) { fl.close(); return; }
      face.current = fl;
      const pl = await vision.PoseLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: POSE_MODEL }, runningMode: "VIDEO", numPoses: 1 });
      if (stale()) { pl.close(); return; }
      pose.current = pl;
      setPhase("running");
      raf.current = requestAnimationFrame(() => loop(my));
    } catch (e) {
      if (stale()) return;
      stop();
      setDetail(e instanceof Error ? e.message : "");
      setPhase("model-error");
    }
  };

  const off = () => { stop(); setPhase("off"); };

  return (
    <div className="grid gap-6 md:grid-cols-[1fr_300px]">
      <div className="relative aspect-[4/3] overflow-hidden rounded-3xl bg-sidebar">
        <video ref={video} muted playsInline className={cn("h-full w-full -scale-x-100 object-cover transition-opacity", phase === "running" || phase === "loading" ? "opacity-100" : "opacity-0")} data-testid="video-webcam" />
        {phase !== "running" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center text-sidebar-foreground">
            {phase === "loading" ? <><Loader2 className="h-8 w-8 animate-spin text-sidebar-primary" /><p className="mt-3 text-sm">Loading on-device models</p></>
              : phase === "unsupported" ? <><CameraOff className="h-8 w-8" /><p className="mt-3 text-sm">This browser lacks camera or WebAssembly support, so posture feedback isn't available.</p></>
              : phase === "denied" ? <><CameraOff className="h-8 w-8 text-sidebar-primary" /><p className="mt-3 text-sm">Camera permission was denied. Allow it in your browser's site settings to use this.</p></>
              : phase === "camera-error" ? <><AlertTriangle className="h-8 w-8 text-sidebar-primary" /><p className="mt-3 text-sm">No camera could be opened. It may be in use by another app.</p></>
              : phase === "frame-error" ? <><AlertTriangle className="h-8 w-8 text-sidebar-primary" /><p className="mt-3 text-sm">Detection kept failing on camera frames, so the camera was stopped and no feedback is shown.{detail && <span className="block text-xs opacity-60">{detail}</span>}</p></>
              : phase === "model-error" ? <><AlertTriangle className="h-8 w-8 text-sidebar-primary" /><p className="mt-3 text-sm">The vision model failed to load, so no feedback is shown.{detail && <span className="block text-xs opacity-60">{detail}</span>}</p></>
              : <><Camera className="h-8 w-8 text-sidebar-primary" /><p className="mt-3 text-sm text-sidebar-foreground/70">Camera is off.</p></>}
          </div>
        )}
        {phase === "running" && <span className="absolute left-4 top-4 flex items-center gap-1.5 rounded-full bg-sidebar/80 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-sidebar-foreground"><span className="h-1.5 w-1.5 rounded-full bg-red-400" /> Local only</span>}
      </div>
      <div className="space-y-4">
        <div className="rounded-2xl bg-secondary p-4 text-xs text-muted-foreground">
          <p className="mb-1 flex items-center gap-1.5 font-semibold text-foreground"><ShieldCheck className="h-4 w-4 text-primary" /> Privacy</p>
          Video is processed in this browser tab by MediaPipe. Nothing is uploaded or recorded. Only head orientation, approximate iris direction and shoulder alignment are measured; emotions and stress are never inferred.
        </div>
        {phase === "running" ? (
          <>
            {[{ t: "Face orientation", v: reading?.face, ok: reading?.faceOk }, { t: "Gaze (approximate)", v: reading?.gaze, ok: reading?.gazeOk }, { t: "Posture", v: reading?.posture, ok: reading?.postureOk }].map((x) => (
              <div key={x.t} className={cn("rounded-2xl border p-4 transition-colors", x.ok ? "border-[hsl(var(--chart-4))]/50 bg-[hsl(var(--chart-4))]/10" : "bg-card")} data-testid={`status-${x.t.split(" ")[0].toLowerCase()}`}>
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{x.t}</p>
                <p className="mt-1 text-sm">{x.v ?? "Waiting for first frame"}</p>
                {x.t.startsWith("Gaze") && <p className="mt-1 text-[11px] text-muted-foreground">A rough estimate from iris position relative to eye corners. Not a true eye-contact measurement; lighting, glasses and camera placement affect it.</p>}
              </div>
            ))}
            <button onClick={off} className="w-full rounded-full border px-4 py-2.5 text-sm hover:bg-secondary" data-testid="button-camera-off">Turn camera off</button>
          </>
        ) : phase !== "unsupported" && (
          <>
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 accent-[hsl(var(--primary))]" data-testid="checkbox-consent" />
              I consent to using my webcam locally for orientation, approximate gaze and posture feedback.
            </label>
            <button onClick={start} disabled={!consent || phase === "loading"} className="w-full rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-40" data-testid="button-camera-on">
              {phase === "loading" ? "Starting" : phase === "off" ? "Start camera" : "Try again"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

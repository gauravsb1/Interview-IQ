import { useEffect, useRef, useState } from "react";
import { Camera, CameraOff, Loader2, ShieldCheck } from "lucide-react";

type CameraState = "off" | "requesting" | "live" | "denied" | "unavailable" | "error";

export function InterviewCamera() {
  const supported = typeof window !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState<CameraState>(supported ? "off" : "unavailable");
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const generation = useRef(0);

  const release = () => {
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
  };

  useEffect(() => () => {
    generation.current += 1;
    release();
  }, []);

  const start = async () => {
    if (!supported || !consent) return;
    const attempt = ++generation.current;
    release();
    setState("requesting");
    try {
      const localStream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
        audio: false,
      });
      if (attempt !== generation.current) {
        localStream.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = localStream;
      if (!video.current) throw new Error("Camera preview is unavailable.");
      video.current.srcObject = localStream;
      await video.current.play();
      if (attempt !== generation.current) return;
      setState("live");
    } catch (error) {
      if (attempt !== generation.current) return;
      release();
      setState(error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "SecurityError") ? "denied" : "error");
    }
  };

  const stop = () => {
    generation.current += 1;
    release();
    setState("off");
  };

  return (
    <section className="rounded-3xl border bg-card p-4" aria-labelledby="interview-camera-title" data-testid="card-interview-camera">
      <h2 id="interview-camera-title" className="flex items-center gap-2 font-semibold">
        {state === "live" ? <Camera className="h-4 w-4 text-primary" /> : <CameraOff className="h-4 w-4 text-muted-foreground" />}
        Camera preview
      </h2>

      <div className="relative mt-3 aspect-video overflow-hidden rounded-xl bg-sidebar">
        <video
          ref={video}
          muted
          playsInline
          className={`h-full w-full -scale-x-100 object-cover ${state === "live" ? "block" : "hidden"}`}
          data-testid="video-interview-preview"
        />
        {state !== "live" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center text-sidebar-foreground">
            {state === "requesting" ? <Loader2 className="h-6 w-6 animate-spin text-sidebar-primary" /> : <CameraOff className="h-6 w-6 text-sidebar-primary" />}
            <p className="text-xs">
              {state === "requesting" ? "Waiting for camera permission"
                : state === "denied" ? "Camera access was blocked. Allow it in browser site settings."
                : state === "unavailable" ? "Camera preview isn't supported in this browser."
                : state === "error" ? "The camera could not be opened. Check permissions or whether another app is using it."
                : "Camera is off."}
            </p>
          </div>
        )}
        {state === "live" && (
          <span className="absolute left-2 top-2 rounded-full bg-sidebar/80 px-2 py-1 font-mono text-[9px] uppercase tracking-wider text-sidebar-foreground">
            Local preview
          </span>
        )}
      </div>

      <div className="mt-3 rounded-xl bg-secondary p-3 text-[11px] text-muted-foreground">
        <p className="flex items-center gap-1.5 font-semibold text-foreground"><ShieldCheck className="h-3.5 w-3.5 text-primary" /> Video stays on this device</p>
        <p className="mt-1">Only your microphone audio is sent for transcription. Camera video is not recorded, uploaded, or saved.</p>
      </div>

      {state === "live" ? (
        <button onClick={stop} className="mt-3 w-full rounded-full border px-3 py-2 text-sm hover:bg-secondary" data-testid="button-stop-interview-camera">
          Turn camera off
        </button>
      ) : (
        <>
          <label className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
              disabled={state === "requesting" || !supported}
              className="mt-0.5 accent-primary"
              data-testid="checkbox-interview-camera-consent"
            />
            <span>I consent to a local camera preview during this practice session.</span>
          </label>
          {supported && (
            <button
              onClick={start}
              disabled={!consent || state === "requesting"}
              className="mt-3 w-full rounded-full bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40"
              data-testid="button-start-interview-camera"
            >
              {state === "requesting" ? "Starting camera…" : state === "error" || state === "denied" ? "Try camera again" : "Start camera"}
            </button>
          )}
        </>
      )}
    </section>
  );
}

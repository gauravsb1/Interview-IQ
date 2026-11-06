import { useCallback, useEffect, useRef, useState } from "react";

export const MAX_SECONDS = 300;

export type RecState = "idle" | "requesting" | "recording" | "denied" | "unsupported" | "error";

export function useRecorder(onBlob: (b: Blob) => void) {
  const supported = typeof window !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";
  const [state, setState] = useState<RecState>(supported ? "idle" : "unsupported");
  const [seconds, setSeconds] = useState(0);
  const rec = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<number | null>(null);
  const mounted = useRef(true);
  const cb = useRef(onBlob);
  cb.current = onBlob;

  const cleanup = useCallback(() => {
    if (timer.current) window.clearInterval(timer.current);
    timer.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
    mounted.current = false;
    if (rec.current && rec.current.state !== "inactive") { rec.current.onstop = null; rec.current.stop(); }
    cleanup();
    };
  }, [cleanup]);

  const start = useCallback(async () => {
    if (!supported) return;
    setState("requesting");
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current) { s.getTracks().forEach((t) => t.stop()); return; }
      stream.current = s;
      const r = new MediaRecorder(s);
      chunks.current = [];
      r.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
      r.onstop = () => {
        const blob = new Blob(chunks.current, { type: r.mimeType || "audio/webm" });
        cleanup();
        if (!mounted.current) return;
        setState("idle");
        if (blob.size) cb.current(blob);
      };
      rec.current = r;
      r.start();
      setSeconds(0);
      timer.current = window.setInterval(() => setSeconds((x) => {
        const n = x + 1;
        if (n >= MAX_SECONDS && rec.current && rec.current.state !== "inactive") rec.current.stop();
        return n;
      }), 1000);
      setState("recording");
    } catch (e) {
      cleanup();
      if (!mounted.current) return;
      setState(e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "SecurityError") ? "denied" : "error");
    }
  }, [supported, cleanup]);

  const stop = useCallback(() => {
    if (rec.current && rec.current.state !== "inactive") rec.current.stop();
  }, []);

  return { state, seconds, start, stop, reset: () => setState(supported ? "idle" : "unsupported") };
}

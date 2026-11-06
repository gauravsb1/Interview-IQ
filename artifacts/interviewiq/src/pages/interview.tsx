import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetSession, getGetSessionQueryKey, useSubmitAnswer, useFinishSession, useTranscribe, useRetryQuestion,
  getListSessionsQueryKey, getGetDashboardQueryKey, type Transcript,
} from "@workspace/api-client-react";
import { Volume2, VolumeX, Mic, Square, Loader2, RotateCw, Send, Flag, CheckCircle2, AlertTriangle } from "lucide-react";
import { RequireAuth, ErrorState, PageSkeleton, ScoreRing } from "@/components/bits";
import { Textarea } from "@/components/ui/textarea";
import { useRecorder, MAX_SECONDS } from "@/hooks/use-recorder";
import { useAnswerDraft } from "@/hooks/use-answer-draft";
import { InterviewCamera } from "@/components/interview-camera";
import { errMsg, CATEGORY_LABEL } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

function Room({ id }: { id: string }) {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const q = useGetSession(id, { query: { enabled: !!id, queryKey: getGetSessionQueryKey(id) } });
  const submit = useSubmitAnswer();
  const finish = useFinishSession();
  const transcribe = useTranscribe();
  const retryQuestion = useRetryQuestion();
  const draft = useAnswerDraft(q.data ? `iq-answer:${id}:${q.data.answers.length}` : undefined);
  const { text, update: setText } = draft;
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [lastBlob, setLastBlob] = useState<Blob | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const ttsOk = typeof window !== "undefined" && "speechSynthesis" in window;

  const runTranscribe = (blob: Blob) => {
    setLastBlob(blob);
    transcribe.mutate({ data: { file: blob } }, {
      onSuccess: (t) => { setTranscript(t); setText((prev) => (prev.trim() ? prev.trim() + " " : "") + t.text); },
    });
  };
  const rec = useRecorder(runTranscribe);

  const session = q.data;
  const question = session?.currentQuestion ?? "";
  const answered = session?.answers.length ?? 0;
  const allAnswered = !!session && answered >= session.questionCount;

  const speak = () => {
    if (!ttsOk || !question) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(question);
    u.rate = 0.98;
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    setSpeaking(true);
    window.speechSynthesis.speak(u);
  };

  useEffect(() => {
    if (ttsOk && question && session?.status === "active" && !allAnswered) {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(question);
      u.onend = () => setSpeaking(false);
      u.onerror = () => setSpeaking(false);
      setSpeaking(true);
      window.speechSynthesis.speak(u);
    }
    return () => { if (ttsOk) window.speechSynthesis.cancel(); };
  }, [question, ttsOk, session?.status, allAnswered]);

  useEffect(() => {
    if (session?.status === "completed") setLocation(`/results/${id}`);
  }, [session?.status, id, setLocation]);

  if (q.isLoading) return <PageSkeleton />;
  if (q.error || !session) return <ErrorState message={errMsg(q.error, "This session could not be loaded.")} onRetry={() => q.refetch()} />;

  const doSubmit = () => {
    if (!text.trim() || session.nextQuestionPending) return;
    if (ttsOk) window.speechSynthesis.cancel();
    submit.mutate(
      { id, data: { text: text.trim(), questionIndex: session.answers.length, transcriptId: transcript?.id } },
      {
        onSuccess: (s) => {
          draft.clear();
          qc.setQueryData(getGetSessionQueryKey(id), s);
          qc.invalidateQueries({ queryKey: getListSessionsQueryKey() });
          qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
          setText(""); setTranscript(null); setLastBlob(null); transcribe.reset();
          const a = s.answers[s.answers.length - 1];
          if (a) toast({ title: "Answer evaluated", description: a.improvement || a.feedback });
        },
      },
    );
  };

  const doRetryQuestion = () => {
    retryQuestion.mutate({ id }, {
      onSuccess: (s) => {
        qc.setQueryData(getGetSessionQueryKey(id), s);
        qc.invalidateQueries({ queryKey: getListSessionsQueryKey() });
        qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
      },
    });
  };

  const doFinish = () => {
    if (submit.isPending || transcribe.isPending || rec.state === "recording" || rec.state === "requesting") return;
    if (text.trim() && !window.confirm("Finish without submitting this draft? Your unsent text will be discarded.")) return;
    finish.mutate({ id }, {
      onSuccess: (s) => {
        draft.clear();
        qc.setQueryData(getGetSessionQueryKey(id), s);
        qc.invalidateQueries({ queryKey: getListSessionsQueryKey() });
        qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
        setLocation(`/results/${id}`);
      },
    });
  };

  const last = session.answers[session.answers.length - 1];
  const busy = submit.isPending || transcribe.isPending || finish.isPending || retryQuestion.isPending;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <div className="space-y-5">
        <div className="rise flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          <span className="text-primary">{CATEGORY_LABEL[session.category] ?? session.category}</span>
          <span>{session.role}{session.company ? ` · ${session.company}` : ""}</span>
          <span className="ml-auto" data-testid="text-progress">Question {Math.min(answered + 1, session.questionCount)} of {session.questionCount}</span>
        </div>
        <div className="flex gap-1">{Array.from({ length: session.questionCount }).map((_, i) => <span key={i} className={cn("h-1 flex-1 rounded-full transition-colors duration-500", i < answered ? "bg-primary" : i === answered ? "bg-accent" : "bg-muted")} />)}</div>

        {allAnswered ? (
          <div className="rise rounded-3xl bg-sidebar p-8 text-sidebar-foreground">
            <CheckCircle2 className="h-8 w-8 text-sidebar-primary" />
            <h2 className="font-display mt-4 text-3xl font-semibold">Every question answered.</h2>
            <p className="mt-2 text-sidebar-foreground/70">Finish the session to compile your evaluation, skill signals and speech metrics.</p>
            {finish.error && <p className="mt-4 text-sm text-red-300">{errMsg(finish.error)}</p>}
            <button onClick={doFinish} disabled={finish.isPending} className="mt-6 inline-flex items-center gap-2 rounded-full bg-sidebar-primary px-6 py-3 text-sm font-semibold text-sidebar-primary-foreground disabled:opacity-60" data-testid="button-finish-session">
              {finish.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Compiling results</> : <><Flag className="h-4 w-4" /> {finish.error ? "Retry finishing" : "See results"}</>}
            </button>
          </div>
        ) : (
          <>
            <div key={question} className="rise relative overflow-hidden rounded-3xl bg-sidebar p-8 text-sidebar-foreground md:p-10">
              <p className="font-mono text-[10px] uppercase tracking-widest text-sidebar-primary">Interviewer</p>
              {session.nextQuestionPending ? (
                <div className="mt-4 rounded-2xl border border-sidebar-border bg-sidebar-accent/50 p-5" role="status" data-testid="status-next-question-pending">
                  <p className="font-semibold">Your answer and evaluation are saved.</p>
                  <p className="mt-1 text-sm text-sidebar-foreground/70">The next question could not be prepared just now. Retry when you’re ready; your answer won’t be evaluated twice.</p>
                  {retryQuestion.error && <p className="mt-3 text-sm text-red-200" data-testid="text-question-retry-error">{errMsg(retryQuestion.error, "The next question is still unavailable.")}</p>}
                  <button onClick={doRetryQuestion} disabled={retryQuestion.isPending} className="mt-4 inline-flex items-center gap-2 rounded-full bg-sidebar-primary px-5 py-2.5 text-sm font-semibold text-sidebar-primary-foreground disabled:opacity-60" data-testid="button-retry-question">
                    {retryQuestion.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Preparing question</> : <><RotateCw className="h-4 w-4" /> Retry next question</>}
                  </button>
                </div>
              ) : (
                <>
                  <p className="font-display mt-4 text-2xl font-medium leading-snug md:text-[1.9rem]" data-testid="text-current-question">{question}</p>
                  <div className="mt-6 flex items-center gap-3">
                    {ttsOk ? (
                      <button onClick={speaking ? () => { window.speechSynthesis.cancel(); setSpeaking(false); } : speak} className="inline-flex items-center gap-2 rounded-full border border-sidebar-border px-4 py-2 text-sm hover:bg-sidebar-accent" data-testid="button-speak">
                        {speaking ? <><VolumeX className="h-4 w-4" /> Stop voice</> : <><Volume2 className="h-4 w-4" /> Read aloud</>}
                      </button>
                    ) : <span className="text-xs text-sidebar-foreground/60">Speech synthesis isn't available in this browser; read the question above.</span>}
                    {speaking && <span className="flex items-end gap-0.5">{[0, 1, 2, 3].map((i) => <span key={i} className="w-1 animate-pulse rounded-full bg-sidebar-primary" style={{ height: 6 + ((i * 5) % 12), animationDelay: `${i * 120}ms` }} />)}</span>}
                  </div>
                </>
              )}
            </div>
            {!session.nextQuestionPending && !!session.currentContext?.length && (
              <details className="rise rounded-2xl border bg-card px-5 py-4" data-testid="details-question-context">
                <summary className="cursor-pointer text-sm font-semibold">Sources used for this question</summary>
                <div className="mt-4 space-y-3">
                  {session.currentContext.map((item, index) => (
                    <div key={`${item.source}-${index}`} className="rounded-xl bg-secondary p-3">
                      <p className="text-xs font-semibold">{item.source}</p>
                      <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">{item.text}</p>
                    </div>
                  ))}
                  {session.category === "company-specific" && session.companyContext && (
                    <p className="text-xs text-muted-foreground">Company details were supplied by you and have not been independently verified.</p>
                  )}
                </div>
              </details>
            )}

            <div className="rise rise-1 rounded-3xl border bg-card p-6">
              <div className="flex flex-col items-center gap-3 py-2">
                <div className="relative">
                  {rec.state === "recording" && <span className="pulse-ring absolute inset-0 rounded-full bg-destructive/40" />}
                  <button
                    onClick={rec.state === "recording" ? rec.stop : rec.start}
                    disabled={rec.state === "unsupported" || rec.state === "requesting" || busy || session.nextQuestionPending}
                    className={cn("relative flex h-20 w-20 items-center justify-center rounded-full text-primary-foreground transition-transform hover:scale-105 active:scale-95 disabled:opacity-40", rec.state === "recording" ? "bg-destructive" : "bg-primary")}
                    aria-label={rec.state === "recording" ? "Stop recording" : "Start recording"} data-testid="button-record"
                  >
                    {rec.state === "recording" ? <Square className="h-6 w-6 fill-current" /> : rec.state === "requesting" ? <Loader2 className="h-6 w-6 animate-spin" /> : <Mic className="h-7 w-7" />}
                  </button>
                </div>
                <p className="text-sm text-muted-foreground" data-testid="status-recorder">
                  {rec.state === "recording" ? <span className="font-mono text-destructive">Recording {fmt(rec.seconds)} / {fmt(MAX_SECONDS)}. Stops automatically at the limit.</span>
                    : rec.state === "requesting" ? "Waiting for microphone permission"
                    : rec.state === "denied" ? "Microphone access was blocked. Allow it in your browser settings, or type your answer below."
                    : rec.state === "unsupported" ? "Audio recording isn't supported in this browser. Type your answer below."
                    : rec.state === "error" ? "No microphone could be opened. Check your device, or type your answer."
                    : transcribe.isPending ? "Transcribing your answer. Longer answers take a little more time."
                    : "Tap to answer out loud. Audio is sent for transcription only and not stored."}
                </p>
                {transcribe.error && (
                  <div className="flex items-center gap-3 rounded-xl bg-destructive/10 px-4 py-2 text-sm text-destructive" data-testid="text-transcribe-error">
                    <AlertTriangle className="h-4 w-4" /> {errMsg(transcribe.error, "Transcription failed.")}
                    {lastBlob && <button onClick={() => runTranscribe(lastBlob)} className="inline-flex items-center gap-1 font-semibold underline" data-testid="button-retry-transcribe"><RotateCw className="h-3 w-3" /> Retry</button>}
                  </div>
                )}
              </div>
              <div className="mt-4">
                <div className="mb-2 flex items-baseline justify-between">
                  <label htmlFor="answer" className="text-sm font-medium">Transcript</label>
                  <span className="text-xs text-muted-foreground">Edit freely before submitting</span>
                </div>
                <Textarea id="answer" value={text} onChange={(e) => setText(e.target.value)} rows={7} placeholder="Your spoken answer appears here, or type it directly." className="resize-y bg-background text-[15px] leading-relaxed" disabled={submit.isPending || session.nextQuestionPending} data-testid="input-answer" />
                <p className="mt-2 text-xs text-muted-foreground" aria-live="polite">
                  {draft.notice || "Unsent text is saved in this tab until submission. Audio is not saved."}
                </p>
                {transcript && (
                  <div className="mt-3 flex flex-wrap gap-2 font-mono text-[11px] text-muted-foreground" data-testid="text-speech-metrics">
                    <span className="rounded-full bg-secondary px-2.5 py-1">{Math.round(transcript.speakingRate)} wpm</span>
                    <span className="rounded-full bg-secondary px-2.5 py-1">{transcript.duration.toFixed(1)}s</span>
                    <span className="rounded-full bg-secondary px-2.5 py-1">{transcript.pauses} pauses</span>
                    <span className="rounded-full bg-secondary px-2.5 py-1">{transcript.silenceDuration.toFixed(1)}s not speaking</span>
                    <span className="rounded-full bg-secondary px-2.5 py-1">{transcript.fillerWords} fillers</span>
                  </div>
                )}
                {submit.error && <p className="mt-3 text-sm text-destructive" data-testid="text-submit-error">{errMsg(submit.error, "Could not submit answer.")} Your text is preserved; try again.</p>}
                <div className="mt-4 flex justify-end">
                  <button onClick={doSubmit} disabled={!text.trim() || busy || rec.state === "recording" || session.nextQuestionPending} className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-40" data-testid="button-submit-answer">
                    {submit.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Evaluating answer</> : <><Send className="h-4 w-4" /> Submit answer</>}
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      <aside className="space-y-4">
        <div className="rise rise-2 rounded-3xl border bg-card p-5">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Last answer</p>
          {last ? (
            <div className="mt-3">
              <div className="flex items-center gap-3">
                <ScoreRing value={(last.scores.technicalAccuracy + last.scores.clarity + last.scores.completeness + last.scores.star) / 4} size={56} />
                <p className="text-sm font-medium">{last.skill}</p>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">{last.feedback}</p>
            </div>
          ) : <p className="mt-3 text-sm text-muted-foreground">Feedback on each answer appears here as you go.</p>}
        </div>
        <div className="rise rise-3 rounded-3xl bg-secondary p-5 text-sm">
          <p className="font-semibold">STAR, quickly</p>
          <ul className="mt-2 space-y-1 text-muted-foreground">
            <li><b className="text-foreground">S</b>ituation in one sentence</li>
            <li><b className="text-foreground">T</b>ask: what was yours</li>
            <li><b className="text-foreground">A</b>ction: say "I", be specific</li>
            <li><b className="text-foreground">R</b>esult with a number</li>
          </ul>
        </div>
        {!allAnswered && <InterviewCamera />}
        {!allAnswered && answered > 0 && (
          <button onClick={doFinish} disabled={busy || rec.state === "recording" || rec.state === "requesting"} className="w-full rounded-full border px-4 py-2 text-sm text-muted-foreground hover:bg-secondary disabled:opacity-50" data-testid="button-end-early">
            {finish.isPending ? "Finishing" : "End session early"}
          </button>
        )}
        <Link href="/history" className="block text-center text-xs text-muted-foreground hover:text-foreground">Leave and resume later</Link>
      </aside>
    </div>
  );
}

export default function InterviewPage() {
  const params = useParams<{ id: string }>();
  return <RequireAuth what="run voice interview sessions"><Room id={params.id ?? ""} /></RequireAuth>;
}

import { useState, type FormEvent } from "react";
import { Link, useParams } from "wouter";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { useGetSession, getGetSessionQueryKey, useSaveRating, getListSessionsQueryKey, type Answer, type Scores } from "@workspace/api-client-react";
import { ChevronDown, Lightbulb, Mic, UserCheck, Loader2, Info, Download } from "lucide-react";
import { PageHeader, RequireAuth, ErrorState, PageSkeleton, ScoreRing, Bar } from "@/components/bits";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { errMsg, CATEGORY_LABEL } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const DIMS: { k: keyof Scores; label: string }[] = [
  { k: "technicalAccuracy", label: "Technical accuracy" },
  { k: "clarity", label: "Clarity" },
  { k: "completeness", label: "Completeness" },
  { k: "star", label: "STAR structure" },
];
const RUBRIC_GUIDE: Record<keyof Scores, string> = {
  technicalAccuracy: "Correctness of the facts, reasoning, or technical approach.",
  clarity: "How clearly and logically the answer is communicated.",
  completeness: "Whether the answer addresses the important parts of the question.",
  star: "Situation, Task, Action, Result structure when that framework applies.",
};
const avg = (s: Scores) => (s.technicalAccuracy + s.clarity + s.completeness + s.star) / 4;

function AnswerCard({ a, i, open, toggle }: { a: Answer; i: number; open: boolean; toggle: () => void }) {
  return (
    <div className="rounded-2xl border bg-card" data-testid={`card-answer-${i}`}>
      <button onClick={toggle} className="flex w-full items-center gap-4 p-5 text-left" data-testid={`button-toggle-answer-${i}`}>
        <span className="font-mono text-xs text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
        <p className="flex-1 font-medium leading-snug">{a.question}</p>
        <ScoreRing value={avg(a.scores)} size={48} />
        <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="rise grid gap-6 border-t p-5 md:grid-cols-[1fr_260px]">
          <div className="space-y-4">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Your answer</p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{a.text}</p>
            </div>
            <div className="rounded-xl bg-secondary p-4 text-sm"><p className="font-semibold">Feedback</p><p className="mt-1 text-muted-foreground">{a.feedback}</p></div>
            <div className="flex gap-3 rounded-xl border border-accent/50 bg-accent/10 p-4 text-sm"><Lightbulb className="h-4 w-4 shrink-0 text-primary" /><p><b>Next time:</b> {a.improvement}</p></div>
            {!!a.contextUsed?.length && (
              <details className="rounded-xl border px-4 py-3" data-testid={`details-answer-context-${i}`}>
                <summary className="cursor-pointer text-sm font-semibold">Context used for this evaluation</summary>
                <div className="mt-3 space-y-2">
                  {a.contextUsed.map((item, index) => (
                    <div key={`${item.source}-${index}`} className="rounded-lg bg-secondary p-3">
                      <p className="text-xs font-semibold">{item.source}</p>
                      <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">{item.text}</p>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
          <div className="space-y-3">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Skill: <span className="text-primary">{a.skill}</span></p>
            {DIMS.map((d) => (
              <div key={d.k}><div className="mb-1 flex justify-between text-xs"><span>{d.label}</span><span className="font-mono">{Math.round(a.scores[d.k])}</span></div><Bar value={a.scores[d.k]} /></div>
            ))}
            {a.speech ? (
              <div className="mt-4 grid grid-cols-2 gap-2 text-center" data-testid={`speech-${i}`}>
                {[
                  ["wpm", Math.round(a.speech.speakingRate)],
                  ["seconds", a.speech.duration.toFixed(1)],
                  ["pauses", a.speech.pauses],
                  ["fillers", a.speech.fillerWords],
                  ["silence s", a.speech.silenceDuration.toFixed(1)],
                ].map(([l, v]) => <div key={l} className="rounded-lg bg-secondary p-2"><p className="font-display text-lg font-semibold">{v}</p><p className="font-mono text-[9px] uppercase text-muted-foreground">{l}</p></div>)}
              </div>
            ) : <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Mic className="h-3 w-3" /> Typed answer, no speech metrics.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function RatingForm({ id, answers }: { id: string; answers: Answer[] }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const save = useSaveRating();
  const [idx, setIdx] = useState("0");
  const [rater, setRater] = useState("");
  const [notes, setNotes] = useState("");
  const [blindReviewed, setBlindReviewed] = useState(false);
  const [scores, setScores] = useState<Record<keyof Scores, string>>({ technicalAccuracy: "", clarity: "", completeness: "", star: "" });
  const [err, setErr] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!rater.trim()) return setErr("Add the rater's name or role.");
    if (!blindReviewed) return setErr("Confirm the reviewer rated the answer without seeing the AI scores.");
    const parsed = {} as Scores;
    for (const d of DIMS) {
      const n = Number(scores[d.k]);
      if (scores[d.k] === "" || !Number.isFinite(n) || n < 0 || n > 100) return setErr(`${d.label} must be 0-100.`);
      parsed[d.k] = n;
    }
    save.mutate({ id, data: { answerIndex: Number(idx), rater: rater.trim(), scores: parsed, notes: notes.trim() || undefined, blindReviewed } }, {
      onSuccess: (s) => {
        qc.setQueryData(getGetSessionQueryKey(id), s);
        qc.invalidateQueries({ queryKey: getListSessionsQueryKey() });
        toast({ title: "Rating saved", description: "Stored as an independent, manually entered rating." });
        setScores({ technicalAccuracy: "", clarity: "", completeness: "", star: "" });
        setNotes("");
        setBlindReviewed(false);
      },
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4 rounded-3xl border bg-card p-6" data-testid="form-rating">
      <div className="space-y-1.5">
        <Label>Answer</Label>
        <Select value={idx} onValueChange={setIdx}>
          <SelectTrigger data-testid="select-answer-index"><SelectValue /></SelectTrigger>
          <SelectContent>{answers.map((a, i) => <SelectItem key={i} value={String(i)}>Q{i + 1}: {a.question.slice(0, 50)}{a.question.length > 50 ? "..." : ""}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="rater">Rater label</Label>
        <Input id="rater" value={rater} onChange={(e) => setRater(e.target.value)} placeholder="Peer A, mentor, career coach" data-testid="input-rater" />
        <p className="text-xs text-muted-foreground">Use a role or anonymous label, not contact details.</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {DIMS.map((d) => (
          <div key={d.k} className="space-y-1.5">
            <Label htmlFor={d.k} className="text-xs">{d.label}</Label>
            <Input id={d.k} type="number" min={0} max={100} inputMode="numeric" value={scores[d.k]} onChange={(e) => setScores((s) => ({ ...s, [d.k]: e.target.value }))} placeholder="0-100" data-testid={`input-score-${d.k}`} />
          </div>
        ))}
      </div>
      <div className="space-y-1.5"><Label htmlFor="notes">Notes <span className="text-muted-foreground">(optional)</span></Label><Textarea id="notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} data-testid="input-notes" /></div>
      <label className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
        <input
          type="checkbox"
          checked={blindReviewed}
          onChange={(event) => setBlindReviewed(event.target.checked)}
          className="mt-0.5 accent-primary"
          data-testid="checkbox-blind-review"
        />
        I confirm the reviewer scored this answer without seeing its AI scores.
      </label>
      {(err || save.error) && <p className="text-sm text-destructive" data-testid="text-rating-error">{err ?? errMsg(save.error, "Could not save rating.")}</p>}
      <button type="submit" disabled={save.isPending} className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60" data-testid="button-save-rating">
        {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Save human rating
      </button>
    </form>
  );
}

function View({ id }: { id: string }) {
  const q = useGetSession(id, { query: { enabled: !!id, queryKey: getGetSessionQueryKey(id) } });
  const [open, setOpen] = useState<number | null>(0);
  const [packetConsent, setPacketConsent] = useState(false);
  if (q.isLoading) return <PageSkeleton />;
  if (q.error || !q.data) return <ErrorState message={errMsg(q.error, "Results could not be loaded.")} onRetry={() => q.refetch()} />;
  const s = q.data;

  const skills = new Map<string, number[]>();
  s.answers.forEach((a) => skills.set(a.skill, [...(skills.get(a.skill) ?? []), avg(a.scores)]));
  const dimAvg = DIMS.map((d) => ({ ...d, v: s.answers.length ? s.answers.reduce((t, a) => t + a.scores[d.k], 0) / s.answers.length : 0 }));
  const spoken = s.answers.filter((a) => a.speech).map((a) => a.speech!);
  const sAvg = (f: (t: (typeof spoken)[number]) => number) => spoken.length ? spoken.reduce((t, x) => t + f(x), 0) / spoken.length : 0;
  const blindRatings = (s.ratings ?? []).filter((rating) => rating.blindReviewed && s.answers[rating.answerIndex]);
  const agreement = DIMS.map((dimension) => ({
    ...dimension,
    meanAbsoluteDifference: blindRatings.length
      ? blindRatings.reduce((total, rating) => total + Math.abs(rating.scores[dimension.k] - s.answers[rating.answerIndex].scores[dimension.k]), 0) / blindRatings.length
      : null,
  }));
  const downloadBlindPacket = () => {
    if (!packetConsent) return;
    const packet = {
      format: "InterviewIQ blind review",
      version: 1,
      role: s.role,
      category: s.category,
      instructions: "Rate each answer without requesting or viewing AI-generated scores. Return the filled score fields to the candidate. Avoid adding identifying details.",
      rubric: DIMS.map((dimension) => ({ dimension: dimension.label, definition: RUBRIC_GUIDE[dimension.k], scale: "0-100" })),
      answers: s.answers.map((answer, index) => ({
        item: `Answer ${index + 1}`,
        question: answer.question,
        answer: answer.text,
        scores: Object.fromEntries(DIMS.map((dimension) => [dimension.k, null])),
        notes: "",
      })),
    };
    const blob = new Blob([JSON.stringify(packet, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "interviewiq-blind-review.json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  return (
    <div>
      <PageHeader kicker={`${CATEGORY_LABEL[s.category] ?? s.category} · ${format(new Date(s.createdAt), "MMM d, yyyy")}`} title={<>{s.role}{s.company && <span className="text-muted-foreground"> at {s.company}</span>}</>}>
        {s.status === "active" && <Link href={`/interview/${s.id}`} className="rounded-full border px-4 py-2 text-sm" data-testid="link-resume-session">Continue session</Link>}
        <Link href="/practice" className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground" data-testid="link-practice-again">Practice again</Link>
      </PageHeader>

      <div className="grid gap-4 md:grid-cols-12">
        <div className="rise flex items-center gap-6 rounded-3xl bg-sidebar p-6 text-sidebar-foreground md:col-span-5">
          <ScoreRing value={s.score} size={120} label="overall" />
          <div className="text-sm text-sidebar-foreground/70">
            <p>{s.answers.length} of {s.questionCount} answered.</p>
            <p className="mt-2 text-xs">Scores are contextual coaching on this rehearsal, not a prediction of hiring outcomes.</p>
          </div>
        </div>
        <div className="rise rise-1 grid grid-cols-2 gap-4 rounded-3xl border bg-card p-6 md:col-span-7">
          {dimAvg.map((d) => <div key={d.k}><div className="mb-1.5 flex justify-between text-sm"><span>{d.label}</span><span className="font-mono">{Math.round(d.v)}</span></div><Bar value={d.v} /></div>)}
        </div>
        <div className="rise rise-2 rounded-3xl border bg-card p-6 md:col-span-6">
          <h3 className="font-display mb-4 text-lg font-semibold">Skills exercised</h3>
          {skills.size ? <div className="flex flex-wrap gap-2">{[...skills].map(([k, v]) => <span key={k} className="rounded-full border bg-secondary px-3 py-1 text-sm">{k} <span className="font-mono text-xs text-muted-foreground">{Math.round(v.reduce((a, b) => a + b, 0) / v.length)}</span></span>)}</div> : <p className="text-sm text-muted-foreground">No answers evaluated.</p>}
        </div>
        <div className="rise rise-3 rounded-3xl border bg-card p-6 md:col-span-6">
          <h3 className="font-display mb-4 text-lg font-semibold">Delivery</h3>
          {spoken.length ? (
            <div className="grid grid-cols-4 gap-2 text-center">
              {[["wpm", Math.round(sAvg((t) => t.speakingRate))], ["pauses", sAvg((t) => t.pauses).toFixed(1)], ["fillers", sAvg((t) => t.fillerWords).toFixed(1)], ["silence s", sAvg((t) => t.silenceDuration).toFixed(1)]].map(([l, v]) => (
                <div key={l}><p className="font-display text-2xl font-semibold">{v}</p><p className="font-mono text-[9px] uppercase text-muted-foreground">avg {l}</p></div>
              ))}
            </div>
          ) : <p className="text-sm text-muted-foreground">No spoken answers in this session, so no speech metrics.</p>}
        </div>
      </div>

      <h2 className="font-display mb-4 mt-10 text-2xl font-semibold">Answer by answer</h2>
      <div className="space-y-3">{s.answers.map((a, i) => <AnswerCard key={i} a={a} i={i} open={open === i} toggle={() => setOpen(open === i ? null : i)} />)}</div>

      {s.answers.length > 0 && (
        <section className="mt-12 grid gap-6 lg:grid-cols-[1fr_380px]">
          <div>
            <h2 className="font-display flex items-center gap-2 text-2xl font-semibold"><UserCheck className="h-5 w-5 text-primary" /> Human-rater comparison</h2>
            <p className="mt-2 flex gap-2 rounded-xl bg-secondary p-3 text-xs text-muted-foreground"><Info className="h-4 w-4 shrink-0" /> Ratings are manually entered and reviewer identity is not verified. The comparison is exploratory, not a scientific validation or measure of hiring suitability.</p>
            <div className="mt-4 rounded-2xl border bg-card p-4" data-testid="blind-review-packet">
              <h3 className="font-semibold">Prepare a blind review</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">The local download contains questions and answers, but no AI scores, account name, company, or resume. Answer text may still identify you; redact it before sharing. The packet is not uploaded by this app.</p>
              <label className="mt-3 flex items-start gap-2 text-xs leading-relaxed">
                <input type="checkbox" checked={packetConsent} onChange={(event) => setPacketConsent(event.target.checked)} className="mt-0.5 accent-primary" data-testid="checkbox-review-packet-consent" />
                I consent to sharing this packet with a reviewer I choose.
              </label>
              <button type="button" onClick={downloadBlindPacket} disabled={!packetConsent} className="mt-3 inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50" data-testid="button-download-review-packet">
                <Download className="h-4 w-4" /> Download blind packet
              </button>
            </div>
            {blindRatings.length > 0 && (
              <div className="mt-4 rounded-2xl border bg-card p-4" data-testid="summary-rater-agreement">
                <h3 className="font-semibold">Exploratory score agreement</h3>
                <p className="mt-1 text-xs text-muted-foreground">Mean absolute score difference across {blindRatings.length} blind-marked rating{blindRatings.length === 1 ? "" : "s"} in this session. Lower means closer scores; small, unverified samples are not a benchmark.</p>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  {agreement.map((dimension) => (
                    <div key={dimension.k} className="rounded-xl bg-secondary p-3">
                      <p className="text-xs text-muted-foreground">{dimension.label}</p>
                      <p className="mt-1 font-mono text-lg font-semibold">{dimension.meanAbsoluteDifference?.toFixed(1)} <span className="text-xs font-normal text-muted-foreground">points</span></p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {s.ratings.length ? (
              <div className="mt-4 overflow-x-auto rounded-2xl border bg-card">
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground"><th className="p-3">Q</th><th className="p-3">Rater</th>{DIMS.map((d) => <th key={d.k} className="p-3">{d.label.split(" ")[0]}</th>)}</tr></thead>
                  <tbody>
                    {s.ratings.map((r, i) => {
                      const ai = s.answers[r.answerIndex];
                      return (
                        <tr key={i} className="border-b last:border-0" data-testid={`row-rating-${i}`}>
                          <td className="p-3 font-mono">{r.answerIndex + 1}</td>
                          <td className="p-3"><p>{r.rater}</p>{r.notes && <p className="text-xs text-muted-foreground">{r.notes}</p>}</td>
                          {DIMS.map((d) => {
                            const diff = ai ? r.scores[d.k] - ai.scores[d.k] : null;
                            return <td key={d.k} className="p-3 font-mono">{r.scores[d.k]}{diff !== null && <span className={cn("ml-1 text-[10px]", diff >= 0 ? "text-[hsl(var(--chart-4))]" : "text-[hsl(var(--chart-3))]")}>{diff >= 0 ? "+" : ""}{Math.round(diff)}</span>}</td>;
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p className="p-3 text-[11px] text-muted-foreground">Small numbers show the difference from the automated score for the same answer.</p>
              </div>
            ) : <p className="mt-4 text-sm text-muted-foreground">No human ratings yet. Ask someone to watch or read an answer and score it independently.</p>}
          </div>
          <RatingForm id={s.id} answers={s.answers} />
        </section>
      )}
    </div>
  );
}

export default function ResultsPage() {
  const params = useParams<{ id: string }>();
  return <RequireAuth what="see your session results"><View id={params.id ?? ""} /></RequireAuth>;
}

import { useEffect, useState } from "react";
import { Link, useRoute } from "wouter";
import { getGetAdminUserQueryKey, useGetAdminSession, useGetAdminUser } from "@workspace/api-client-react";
import { Activity, ArrowLeft, CalendarDays, FileText, LockKeyhole, Moon, ShieldCheck, Sun, UserRound } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import "@/admin.css";

function formatDate(value?: string | null) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}
function score(value?: number | null) {
  return value != null && Number.isFinite(value) ? value.toFixed(1) : "—";
}
function isList(value: unknown): value is string[] {
  return Array.isArray(value);
}
function ListSection({ title, items }: { title: string; items?: string[] }) {
  return <section className="border-t border-[var(--admin-line)] py-4 first:border-0 first:pt-0">
    <div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-semibold">{title}</h3><span className="admin-muted font-mono text-xs">{items?.length ?? 0}</span></div>
    {items?.length ? <ul className="space-y-2">{items.map((item, index) => <li key={`${title}-${index}`} className="rounded-lg bg-[color:var(--admin-paper)] px-3 py-2.5 text-sm leading-6">{item}</li>)}</ul> : <p className="admin-muted rounded-lg bg-[color:var(--admin-paper)] px-3 py-3 text-sm">No {title.toLowerCase()} stored.</p>}
  </section>;
}

export default function AdminUserPage() {
  const [, params] = useRoute("/admin/users/:id");
  const userId = params?.id ? decodeURIComponent(params.id) : "";
  const session = useGetAdminSession();
  const authenticated = session.data?.authenticated === true;
  const detailQuery = useGetAdminUser(userId, {
    query: { enabled: Boolean(userId) && authenticated, queryKey: getGetAdminUserQueryKey(userId) },
  });
  const [isDark, setIsDark] = useState(false);
  const detail = detailQuery.data;
  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
    return () => document.documentElement.classList.remove("dark");
  }, [isDark]);

  if (session.isLoading) return <main className="admin-root min-h-[100dvh] p-6"><div className="mx-auto max-w-6xl space-y-5"><Skeleton className="h-10 w-64" /><Skeleton className="h-36 w-full rounded-2xl" /><Skeleton className="h-64 w-full rounded-2xl" /></div></main>;
  if (!authenticated) return <main className="admin-root flex min-h-[100dvh] items-center justify-center px-5"><section className="admin-card admin-enter w-full max-w-md p-8 text-center"><div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-[color:var(--admin-paper)] text-[var(--admin-teal)]"><LockKeyhole size={20} /></div><p className="admin-kicker mb-2">Restricted record</p><h1 className="admin-display text-3xl">Admin sign-in required</h1><p className="admin-muted mt-2 text-sm leading-6">This candidate record is private. Sign in with an administrator account to continue.</p><Link href="/admin" className="admin-primary mt-6 inline-flex h-11 items-center justify-center rounded-lg px-5 text-sm font-semibold">Go to admin sign in</Link></section></main>;

  return (
    <main className={`admin-root ${isDark ? "dark" : ""} min-h-[100dvh]`}>
      <div className="mx-auto max-w-[1240px] px-4 py-6 sm:px-7 lg:px-10">
        <header className="admin-enter mb-7 flex flex-wrap items-center justify-between gap-4 border-b border-[var(--admin-line)] pb-5">
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/admin" className="admin-control flex h-10 items-center gap-2 px-3 text-sm"><ArrowLeft size={15} />Overview</Link>
            <div className="flex items-center gap-2 text-sm font-semibold"><span className="grid h-8 w-8 place-items-center rounded-xl bg-[#173b38] text-[#dba94b]"><Activity size={15} /></span> InterviewIQ <span className="admin-muted font-normal">/ Candidate record</span></div>
          </div>
          <div className="admin-print-hide flex items-center gap-2">
            <button data-testid="button-print-user-detail" onClick={() => window.print()} className="admin-control h-10 rounded-lg px-3 text-sm">Print record</button>
            <button data-testid="button-toggle-user-theme" onClick={() => setIsDark((value) => !value)} className="admin-control grid h-10 w-10 place-items-center" aria-label="Toggle dark mode">{isDark ? <Sun size={16} /> : <Moon size={16} />}</button>
          </div>
        </header>

        {detailQuery.isLoading || detailQuery.isFetching ? <div className="space-y-5"><Skeleton className="h-40 w-full rounded-2xl" /><div className="grid gap-5 lg:grid-cols-2"><Skeleton className="h-72 rounded-2xl" /><Skeleton className="h-72 rounded-2xl" /></div></div> :
          detailQuery.isError ? <section role="alert" className="admin-card p-8 text-center"><p className="admin-kicker mb-2">Record unavailable</p><h1 className="admin-display text-3xl">Could not load this candidate.</h1><p className="admin-muted mx-auto mt-2 max-w-lg text-sm">{detailQuery.error instanceof Error ? detailQuery.error.message : "The record could not be retrieved. It may have been removed, or your session may have expired."}</p><button data-testid="button-retry-user-detail" onClick={() => detailQuery.refetch()} className="admin-primary mt-5 h-10 rounded-lg px-4 text-sm font-semibold">Try again</button></section> :
            !detail ? <section className="admin-card p-8 text-center"><p className="admin-muted text-sm">No candidate record was returned.</p></section> : <>
              <section className="admin-card admin-enter mb-5 overflow-hidden">
                <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[1fr_auto] lg:items-center">
                  <div className="flex items-start gap-4">
                    <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-[#dce9df] font-mono text-lg font-semibold text-[#176a62]">{detail.user.name.trim().split(/\s+/).slice(0,2).map((part) => part[0]).join("").toUpperCase() || "?"}</div>
                    <div><p className="admin-kicker mb-1">Candidate profile</p><h1 data-testid={`text-user-name-${detail.user.id}`} className="admin-display text-3xl sm:text-4xl">{detail.user.name}</h1><p className="admin-muted mt-1 text-sm">{detail.user.email}</p><p className="admin-muted mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs"><span className="flex items-center gap-1.5"><CalendarDays size={13} /> Joined {formatDate(detail.user.createdAt)}</span><span>Last login {formatDate(detail.user.lastLoginAt)}</span></p></div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:min-w-[440px]">
                    {[["Sessions", detail.user.totalSessions], ["Answers", detail.user.totalAnswers], ["Average score", score(detail.user.averageScore)], ["Interview history", detail.sessions.length]].map(([label, value]) => <div key={String(label)} className="rounded-xl bg-[color:var(--admin-paper)] px-3 py-3"><p className="admin-muted text-[11px]">{label}</p><p className="mt-1 font-mono text-xl">{value}</p></div>)}
                  </div>
                </div>
              </section>

              <div className="mb-5 grid items-start gap-5 lg:grid-cols-[.9fr_1.1fr]">
                <section className="admin-card p-5 sm:p-6">
                  <div className="mb-5 flex items-start gap-3"><div className="grid h-9 w-9 place-items-center rounded-xl bg-[color:var(--admin-paper)] text-[var(--admin-teal)]"><FileText size={17} /></div><div><p className="admin-kicker mb-1">Stored resume</p><h2 className="text-lg font-semibold">Profile & experience</h2><p className="admin-muted mt-1 text-xs">{detail.profile.filename || "Resume file unknown"}</p></div></div>
                  <div className="space-y-4">
                    <ListSection title="Skills" items={isList(detail.profile.skills) ? detail.profile.skills : undefined} />
                    <ListSection title="Experience" items={isList(detail.profile.experience) ? detail.profile.experience : undefined} />
                    <ListSection title="Projects" items={isList(detail.profile.projects) ? detail.profile.projects : undefined} />
                    <ListSection title="Education" items={isList(detail.profile.education) ? detail.profile.education : undefined} />
                    <ListSection title="Certifications" items={isList(detail.profile.certifications) ? detail.profile.certifications : undefined} />
                    <section className="border-t border-[var(--admin-line)] pt-4"><h3 className="mb-2 text-sm font-semibold">Full extracted resume text</h3>{detail.profile.text ? <pre data-testid={`text-resume-${detail.user.id}`} className="max-h-[480px] overflow-auto whitespace-pre-wrap rounded-lg bg-[color:var(--admin-paper)] p-4 font-sans text-sm leading-6">{detail.profile.text}</pre> : <p className="admin-muted rounded-lg bg-[color:var(--admin-paper)] p-4 text-sm">No extracted resume text stored.</p>}</section>
                  </div>
                </section>

                <section className="admin-card p-5 sm:p-6">
                  <div className="mb-5 flex items-start justify-between gap-3"><div><p className="admin-kicker mb-1">Practice history</p><h2 className="text-lg font-semibold">Interview sessions</h2><p className="admin-muted mt-1 text-xs">Questions, complete answers, score breakdown and AI coaching.</p></div><span className="admin-muted font-mono text-xs">{detail.sessions.length} total</span></div>
                  {detail.sessions.length ? <div className="space-y-3">{detail.sessions.map((interview) => <details key={interview.id} className="group rounded-xl border border-[var(--admin-line)] bg-[color:var(--admin-card)]">
                    <summary data-testid={`session-${interview.id}`} className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 p-4 [&::-webkit-details-marker]:hidden">
                      <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="rounded-md bg-[color:var(--admin-paper)] px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--admin-teal)]">{interview.category}</span><span className={`rounded-md px-2 py-1 text-[10px] font-semibold ${interview.status === "completed" ? "bg-[#e4efe6] text-[#28654b]" : "bg-[#f5ead5] text-[#8b651c]"}`}>{interview.status}</span></div><p className="mt-2 truncate text-sm font-semibold">{interview.role}{interview.company ? ` · ${interview.company}` : ""}</p><p className="admin-muted mt-1 text-xs">{formatDate(interview.createdAt)} <span className="px-1">·</span> {interview.answers.length} answers <span className="px-1">·</span> {interview.questionCount} questions</p></div>
                      <div className="flex items-center gap-3"><span className="text-right"><span className="admin-muted block text-[10px]">Score</span><span className="font-mono text-lg">{score(interview.score)}</span></span><span className="admin-muted text-lg transition-transform group-open:rotate-90">›</span></div>
                    </summary>
                    <div className="space-y-4 border-t border-[var(--admin-line)] p-4">
                      {interview.companyContext && <div className="rounded-lg bg-[color:var(--admin-paper)] p-3"><p className="admin-kicker mb-1">Company context</p><p className="text-sm leading-6">{interview.companyContext}</p></div>}
                      {interview.answers.length ? interview.answers.map((answer, answerIndex) => <article key={`${interview.id}-answer-${answerIndex}`} className="rounded-lg border border-[var(--admin-line)] p-4">
                        <p className="admin-kicker mb-2">Question {answerIndex + 1}{answer.skill ? ` · ${answer.skill}` : ""}</p><h3 className="text-sm font-semibold leading-6">{answer.question}</h3>
                        <div className="mt-3 rounded-lg bg-[color:var(--admin-paper)] p-3"><p className="admin-muted mb-1 text-[10px] font-semibold uppercase tracking-wider">Candidate answer</p><p className="whitespace-pre-wrap text-sm leading-6">{answer.text || "No written answer recorded."}</p></div>
                        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">{Object.entries(answer.scores ?? {}).map(([key, value]) => <div key={key} className="rounded-md bg-[color:var(--admin-paper)] px-2.5 py-2"><p className="admin-muted text-[10px] capitalize">{key.replace(/([A-Z])/g, " $1")}</p><p className="mt-1 font-mono text-sm">{score(value)}</p></div>)}</div>
                        {answer.feedback && <div className="mt-3"><p className="admin-kicker mb-1">AI feedback</p><p className="text-sm leading-6">{answer.feedback}</p></div>}
                        {answer.improvement && <div className="mt-3 rounded-lg border-l-2 border-[#dba94b] bg-[color:var(--admin-paper)] px-3 py-2.5"><p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[#9a7021]">Suggested improvement</p><p className="text-sm leading-6">{answer.improvement}</p></div>}
                        {answer.speech && <div className="mt-3 rounded-lg border border-[var(--admin-line)] p-3"><p className="mb-2 flex items-center gap-2 text-xs font-semibold"><Activity size={13} className="text-[var(--admin-teal)]" /> Speech transcript & delivery signals</p><p className="whitespace-pre-wrap text-sm leading-6">{answer.speech.text}</p><div className="admin-muted mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs"><span>Duration {answer.speech.duration}s</span><span>Speaking rate {answer.speech.speakingRate}</span><span>Pauses {answer.speech.pauses}</span><span>Silence {answer.speech.silenceDuration}s</span><span>Filler words {answer.speech.fillerWords}</span></div></div>}
                        {answer.contextUsed?.length ? <details className="mt-3"><summary className="admin-muted cursor-pointer text-xs font-semibold">Show {answer.contextUsed.length} resume context source{answer.contextUsed.length === 1 ? "" : "s"}</summary><div className="mt-2 space-y-2">{answer.contextUsed.map((source, index) => <div key={`${answerIndex}-source-${index}`} className="rounded-lg bg-[color:var(--admin-paper)] p-3"><p className="text-xs font-semibold">{source.source} · {Math.round(source.similarity * 100)}% match</p><p className="admin-muted mt-1 text-xs leading-5">{source.text}</p></div>)}</div></details> : null}
                      </article>) : <p className="admin-muted rounded-lg bg-[color:var(--admin-paper)] p-4 text-sm">No answers stored for this interview.</p>}
                      {interview.ratings?.length > 0 && <section className="rounded-lg bg-[color:var(--admin-paper)] p-3"><p className="admin-kicker mb-2">Human review</p>{interview.ratings.map((rating, index) => <div key={`${rating.rater}-${index}`} className="border-t border-[var(--admin-line)] py-2 first:border-0"><p className="text-xs font-semibold">{rating.rater} · answer {rating.answerIndex + 1}{rating.blindReviewed ? " · blind reviewed" : ""}</p><div className="admin-muted mt-2 flex flex-wrap gap-3 text-xs">{Object.entries(rating.scores ?? {}).map(([key, value]) => <span key={key}>{key.replace(/([A-Z])/g, " $1")}: <b className="font-mono text-[var(--admin-ink)]">{score(value)}</b></span>)}</div>{rating.notes && <p className="admin-muted mt-1 text-sm leading-5">{rating.notes}</p>}</div>)}</section>}
                    </div>
                  </details>)}</div> : <div className="admin-muted rounded-xl bg-[color:var(--admin-paper)] px-5 py-10 text-center text-sm">No interview sessions stored for this account.</div>}
                </section>
              </div>

              <section className="admin-card p-5 sm:p-6">
                <div className="mb-5 flex items-start justify-between"><div><p className="admin-kicker mb-1">Voice practice</p><h2 className="text-lg font-semibold">Stored speech transcripts</h2><p className="admin-muted mt-1 text-xs">Transcript content and delivery metadata recorded with practice answers.</p></div><span className="admin-muted font-mono text-xs">{detail.transcripts.length} total</span></div>
                {detail.transcripts.length ? <div className="grid gap-3 md:grid-cols-2">{detail.transcripts.map((transcript) => <article key={transcript.id} className="rounded-xl border border-[var(--admin-line)] p-4"><div className="mb-3 flex items-center justify-between gap-3"><span className="admin-muted font-mono text-[10px]">Transcript {transcript.id}</span><span className="rounded-md bg-[color:var(--admin-paper)] px-2 py-1 text-xs">{transcript.duration}s</span></div><p className="whitespace-pre-wrap text-sm leading-6">{transcript.text || "No transcript text stored."}</p><div className="admin-muted mt-4 grid grid-cols-2 gap-2 border-t border-[var(--admin-line)] pt-3 text-xs sm:grid-cols-4"><span>Rate <b className="font-mono text-[var(--admin-ink)]">{transcript.speakingRate}</b></span><span>Pauses <b className="font-mono text-[var(--admin-ink)]">{transcript.pauses}</b></span><span>Silence <b className="font-mono text-[var(--admin-ink)]">{transcript.silenceDuration}s</b></span><span>Fillers <b className="font-mono text-[var(--admin-ink)]">{transcript.fillerWords}</b></span></div></article>)}</div> : <div className="admin-muted rounded-xl bg-[color:var(--admin-paper)] px-5 py-10 text-center text-sm">No speech transcripts stored for this account.</div>}
              </section>
              <footer className="admin-muted mt-6 flex items-center justify-between gap-3 text-xs"><span className="flex items-center gap-1.5"><UserRound size={13} /> Profile and performance record</span><span className="flex items-center gap-1.5"><ShieldCheck size={13} /> Credentials and session tokens are never shown</span></footer>
            </>}
      </div>
    </main>
  );
}

import { Link } from "wouter";
import { format } from "date-fns";
import { useGetDashboard, getGetDashboardQueryKey } from "@workspace/api-client-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowUpRight, Mic, FileText, TrendingUp, TrendingDown, Eye } from "lucide-react";
import { PageHeader, ScoreRing, Bar, ErrorState, EmptyState, PageSkeleton } from "@/components/bits";
import { useAuth, errMsg, CATEGORY_LABEL } from "@/lib/auth";

export default function Dashboard() {
  const { user, isLoading } = useAuth();
  const q = useGetDashboard({ query: {
    queryKey: [...getGetDashboardQueryKey(), user?.id ?? "public"],
    enabled: !isLoading,
  } });
  if (isLoading || q.isLoading) return <PageSkeleton />;
  if (q.error || !q.data) return <ErrorState message={errMsg(q.error)} onRetry={() => q.refetch()} />;
  const d = q.data;
  if (!user && !d.demo) return <PageSkeleton />;
  const up = d.improvement >= 0;

  return (
    <div>
      {d.demo && (
        <div className="rise mb-6 flex flex-col gap-3 rounded-2xl border border-accent/50 bg-accent/15 px-5 py-4 sm:flex-row sm:items-center" data-testid="banner-sample-data">
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-accent px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-widest text-accent-foreground">
            <Eye className="h-3 w-3" /> Sample data
          </span>
          <p className="flex-1 text-sm">You're viewing an illustrative dashboard. {user ? "Complete a session to replace it with your own numbers." : "Register to upload your resume and record real sessions."}</p>
          {!user && <Link href="/register" className="text-sm font-semibold text-primary hover:underline" data-testid="link-register-banner">Register free</Link>}
        </div>
      )}
      <PageHeader kicker={user ? `Hello, ${user.name.split(" ")[0]}` : "Interview coach"} title={<>Rehearse with <em className="text-primary">your</em> story.</>}>
        <Link href="/resume" className="inline-flex items-center gap-2 rounded-full border bg-card px-4 py-2 text-sm font-medium hover:bg-secondary" data-testid="link-resume">
          <FileText className="h-4 w-4" /> Resume
        </Link>
        <Link href="/practice" className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90" data-testid="link-start-practice">
          <Mic className="h-4 w-4" /> Start a session
        </Link>
      </PageHeader>

      <div className="grid gap-4 md:grid-cols-12">
        <div className="rise rise-1 flex items-center gap-6 rounded-3xl bg-sidebar p-6 text-sidebar-foreground md:col-span-5">
          <ScoreRing value={d.averageScore} size={112} label="avg" />
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-sidebar-foreground/60">Average answer score</p>
            <p className={`mt-3 flex items-center gap-1.5 text-sm ${up ? "text-sidebar-primary" : "text-red-300"}`} data-testid="text-improvement">
              {up ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
              {up ? "+" : ""}{d.improvement.toFixed(1)} pts since your first sessions
            </p>
            <p className="mt-2 text-xs text-sidebar-foreground/50">Coaching signal, not a hiring prediction.</p>
          </div>
        </div>
        {[
          { k: "Sessions", v: d.totalSessions, id: "sessions" },
          { k: "Answers given", v: d.totalAnswers, id: "answers" },
        ].map((s, i) => (
          <div key={s.id} className={`rise rise-${i + 2} rounded-3xl border bg-card p-6 md:col-span-2`}>
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{s.k}</p>
            <p className="font-display mt-4 text-5xl font-semibold" data-testid={`text-total-${s.id}`}>{s.v}</p>
          </div>
        ))}
        <div className="rise rise-4 rounded-3xl border bg-card p-6 md:col-span-3">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Top skill signal</p>
          {d.skills.length ? (
            <>
              <p className="font-display mt-4 text-2xl font-semibold leading-tight">{[...d.skills].sort((a, b) => b.score - a.score)[0].name}</p>
              <p className="mt-1 text-sm text-muted-foreground">Your strongest evaluated area</p>
            </>
          ) : <p className="mt-4 text-sm text-muted-foreground">Appears after your first evaluated answer.</p>}
        </div>

        <div className="rise rise-2 rounded-3xl border bg-card p-6 md:col-span-8">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="font-display text-xl font-semibold">Score trend</h2>
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">0-100</span>
          </div>
          {d.trends.length ? (
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={d.trends.map((t) => ({ ...t, label: format(new Date(t.date), "MMM d") }))}>
                  <defs>
                    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={28} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12, fontSize: 12 }} />
                  <Area type="monotone" dataKey="score" stroke="hsl(var(--chart-1))" strokeWidth={2.5} fill="url(#g)" dot={{ r: 3, fill: "hsl(var(--accent))", strokeWidth: 0 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : <p className="py-16 text-center text-sm text-muted-foreground">Your trend line starts after the first completed session.</p>}
        </div>

        <div className="rise rise-3 rounded-3xl border bg-card p-6 md:col-span-4">
          <h2 className="font-display mb-5 text-xl font-semibold">Skills</h2>
          {d.skills.length ? (
            <ul className="space-y-4">
              {d.skills.slice(0, 7).map((s, i) => (
                <li key={s.name} data-testid={`row-skill-${i}`}>
                  <div className="mb-1.5 flex justify-between text-sm"><span>{s.name}</span><span className="font-mono text-muted-foreground">{Math.round(s.score)}</span></div>
                  <Bar value={s.score} />
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted-foreground">No skill evaluations yet.</p>}
        </div>

        <div className="rise rise-4 md:col-span-12">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="font-display text-xl font-semibold">Recent sessions</h2>
            {user && <Link href="/history" className="text-sm text-primary hover:underline" data-testid="link-history">All history</Link>}
          </div>
          {d.recentSessions.length ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {d.recentSessions.map((s) => {
                const inner = (
                  <>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-mono text-[10px] uppercase tracking-widest text-primary">{CATEGORY_LABEL[s.category] ?? s.category}</p>
                        <p className="mt-1 truncate font-semibold">{s.role}</p>
                        <p className="truncate text-sm text-muted-foreground">{s.company || "General"} · {format(new Date(s.createdAt), "MMM d")}</p>
                      </div>
                      <ScoreRing value={s.score} size={52} />
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">{s.answers.length}/{s.questionCount} answered</p>
                  </>
                );
                return d.demo ? (
                  <div key={s.id} className="rounded-2xl border bg-card p-5" data-testid={`card-session-${s.id}`}>{inner}</div>
                ) : (
                  <Link key={s.id} href={s.status === "completed" ? `/results/${s.id}` : `/interview/${s.id}`} className="lift group relative rounded-2xl border bg-card p-5" data-testid={`card-session-${s.id}`}>
                    {inner}
                    <ArrowUpRight className="absolute bottom-4 right-4 h-4 w-4 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
                  </Link>
                );
              })}
            </div>
          ) : (
            <EmptyState icon={<Mic className="h-6 w-6" />} title="No sessions yet" body="Your first rehearsal takes about ten minutes. Questions adapt to the resume you upload." action={<Link href="/practice" className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground">Start practicing</Link>} />
          )}
        </div>
      </div>
    </div>
  );
}

import { useState, type FormEvent } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useCreateSession, useGetProfile, getGetProfileQueryKey, getListSessionsQueryKey, getGetDashboardQueryKey, type InterviewInputCategory } from "@workspace/api-client-react";
import { Code2, Users, MessagesSquare, Building2, Loader2, Minus, Plus, ArrowRight, FileWarning } from "lucide-react";
import { PageHeader, RequireAuth } from "@/components/bits";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { errMsg } from "@/lib/auth";
import { cn } from "@/lib/utils";

const CATS: { v: InterviewInputCategory; label: string; desc: string; icon: typeof Code2 }[] = [
  { v: "technical", label: "Technical", desc: "Depth on the stack and decisions in your projects", icon: Code2 },
  { v: "behavioral", label: "Behavioral", desc: "STAR stories about conflict, ownership, failure", icon: MessagesSquare },
  { v: "hr", label: "HR", desc: "Motivation, expectations, career narrative", icon: Users },
  { v: "company-specific", label: "Company-specific", desc: "Why this company, its product and values", icon: Building2 },
];

function Form() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const create = useCreateSession();
  const profile = useGetProfile({ query: { retry: false, queryKey: getGetProfileQueryKey() } });
  const [category, setCategory] = useState<InterviewInputCategory>("technical");
  const [role, setRole] = useState("");
  const [company, setCompany] = useState("");
  const [companyContext, setCompanyContext] = useState("");
  const [count, setCount] = useState(5);
  const [err, setErr] = useState<string | null>(null);

  const hasResume = !!profile.data?.filename;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!hasResume) return setErr("Upload your resume first so questions come from your experience.");
    if (!role.trim()) return setErr("Which role are you preparing for?");
    if (category === "company-specific" && !company.trim()) return setErr("Company-specific practice needs a company name.");
    create.mutate(
      { data: { category, role: role.trim(), company: company.trim() || undefined, companyContext: companyContext.trim() || undefined, questionCount: count } },
      {
        onSuccess: (s) => {
          qc.invalidateQueries({ queryKey: getListSessionsQueryKey() });
          qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
          setLocation(`/interview/${s.id}`);
        },
      },
    );
  };

  return (
    <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        {profile.error && (
          <div className="rise flex items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm" data-testid="text-profile-error">
            <FileWarning className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <p>Couldn't check your resume: {errMsg(profile.error)} <button type="button" onClick={() => profile.refetch()} className="font-semibold text-primary underline">Retry</button></p>
          </div>
        )}
        {!profile.isLoading && !profile.error && !hasResume && (
          <div className="rise flex items-start gap-3 rounded-2xl border border-accent/50 bg-accent/10 p-4 text-sm" data-testid="banner-resume-required">
            <FileWarning className="mt-0.5 h-4 w-4 shrink-0" />
            <p>A resume is required before you can start: every question is drawn from your experience. <Link href="/resume" className="font-semibold text-primary underline" data-testid="link-upload-resume">Upload your resume</Link></p>
          </div>
        )}
        <fieldset className="rise rise-1">
          <legend className="mb-3 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Category</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {CATS.map(({ v, label, desc, icon: Icon }) => (
              <button
                type="button" key={v} onClick={() => setCategory(v)} data-testid={`button-category-${v}`}
                className={cn("lift rounded-2xl border p-5 text-left transition-colors", category === v ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:border-primary/40")}
              >
                <Icon className={cn("h-5 w-5", category === v ? "text-accent" : "text-primary")} />
                <p className="mt-3 font-semibold">{label}</p>
                <p className={cn("mt-1 text-sm", category === v ? "text-primary-foreground/75" : "text-muted-foreground")}>{desc}</p>
              </button>
            ))}
          </div>
        </fieldset>
        <div className="rise rise-2 grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="role">Target role</Label>
            <Input id="role" value={role} onChange={(e) => setRole(e.target.value)} placeholder="Senior Backend Engineer" data-testid="input-role" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="company">Company {category !== "company-specific" && <span className="text-muted-foreground">(optional)</span>}</Label>
            <Input id="company" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Monzo" data-testid="input-company" />
          </div>
        </div>
        <div className="rise rise-2 space-y-1.5">
          <Label htmlFor="company-context">Role or company context <span className="text-muted-foreground">(optional)</span></Label>
          <Textarea
            id="company-context"
            value={companyContext}
            onChange={(e) => setCompanyContext(e.target.value)}
            maxLength={8000}
            rows={5}
            placeholder="Paste a job description or company/product details to ground the questions."
            data-testid="input-company-context"
          />
          <p className="text-xs text-muted-foreground">Saved with this session and used as candidate-provided context, not verified company facts. {companyContext.length}/8000</p>
        </div>
      </div>
      <aside className="rise rise-3 h-fit rounded-3xl bg-sidebar p-6 text-sidebar-foreground">
        <p className="font-mono text-[10px] uppercase tracking-widest text-sidebar-foreground/60">Questions</p>
        <div className="mt-4 flex items-center justify-between">
          <button type="button" onClick={() => setCount((c) => Math.max(3, c - 1))} disabled={count <= 3} className="flex h-10 w-10 items-center justify-center rounded-full border border-sidebar-border hover:bg-sidebar-accent disabled:opacity-30" aria-label="Fewer" data-testid="button-count-minus"><Minus className="h-4 w-4" /></button>
          <span className="font-display text-6xl font-semibold" data-testid="text-question-count">{count}</span>
          <button type="button" onClick={() => setCount((c) => Math.min(10, c + 1))} disabled={count >= 10} className="flex h-10 w-10 items-center justify-center rounded-full border border-sidebar-border hover:bg-sidebar-accent disabled:opacity-30" aria-label="More" data-testid="button-count-plus"><Plus className="h-4 w-4" /></button>
        </div>
        <div className="mt-4 flex gap-1">{Array.from({ length: 10 }).map((_, i) => <span key={i} className={cn("h-1 flex-1 rounded-full transition-colors", i < count ? "bg-sidebar-primary" : "bg-sidebar-accent")} />)}</div>
        <p className="mt-4 text-sm text-sidebar-foreground/70">Roughly {count * 2}-{count * 3} minutes. Each answer is evaluated as you go.</p>
        {(err || create.error) && <p className="mt-4 rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-200" data-testid="text-practice-error">{err ?? errMsg(create.error, "Could not create the session.")}</p>}
        <button type="submit" disabled={profile.isLoading || create.isPending || !hasResume} className="group mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-sidebar-primary py-3 text-sm font-semibold text-sidebar-primary-foreground hover:opacity-90 disabled:opacity-60" data-testid="button-start-session">
          {profile.isLoading ? <><Loader2 className="h-4 w-4 animate-spin" /> Checking saved resume</>
            : create.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Writing your questions</>
            : <>Begin interview <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" /></>}
        </button>
        {profile.isLoading && <p className="mt-3 text-center text-xs text-sidebar-foreground/60" role="status" data-testid="status-resume-check">Checking for a saved resume before practice can start.</p>}
        {!hasResume && !profile.isLoading && <Link href="/resume" className="mt-3 block text-center text-xs font-semibold text-sidebar-primary underline" data-testid="link-upload-resume-aside">Upload a resume to unlock</Link>}
        {create.isPending && <p className="mt-3 text-center text-xs text-sidebar-foreground/60">Tailoring to your resume can take 10-30 seconds.</p>}
      </aside>
    </form>
  );
}

export default function PracticePage() {
  return (
    <div>
      <PageHeader kicker="Set the stage" title="Configure a rehearsal" />
      <RequireAuth what="run voice interview sessions"><Form /></RequireAuth>
    </div>
  );
}

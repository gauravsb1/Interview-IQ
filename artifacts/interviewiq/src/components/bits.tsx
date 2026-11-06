import type { ReactNode } from "react";
import { Link } from "wouter";
import { AlertTriangle, LockKeyhole, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

export function PageHeader({ kicker, title, children }: { kicker: string; title: ReactNode; children?: ReactNode }) {
  return (
    <header className="rise mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-primary/80">{kicker}</p>
        <h1 className="font-display mt-2 text-3xl font-semibold leading-tight md:text-[2.6rem]">{title}</h1>
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </header>
  );
}

export function ScoreRing({ value, size = 72, label }: { value: number; size?: number; label?: string }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  const r = size / 2 - 6;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }} data-testid="score-ring">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth={5} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke="hsl(var(--accent))" strokeWidth={5} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c - (v / 100) * c} style={{ transition: "stroke-dashoffset 1s cubic-bezier(.2,.7,.2,1)" }}
        />
      </svg>
      <div className="absolute text-center leading-none">
        <div className="font-display font-semibold" style={{ fontSize: size * 0.3 }}>{v}</div>
        {label && <div className="mt-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>}
      </div>
    </div>
  );
}

export function Bar({ value, className }: { value: number; className?: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-muted", className)}>
      <div className="h-full origin-left rounded-full bg-primary transition-transform duration-700" style={{ transform: `scaleX(${v / 100})` }} />
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rise rounded-2xl border border-destructive/30 bg-destructive/5 p-6" data-testid="status-error">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
        <div className="flex-1">
          <p className="font-medium">That didn't load.</p>
          <p className="mt-1 text-sm text-muted-foreground">{message}</p>
          {onRetry && (
            <Button size="sm" variant="outline" className="mt-4" onClick={onRetry} data-testid="button-retry">
              <RotateCw className="mr-2 h-3.5 w-3.5" /> Try again
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export function EmptyState({ icon, title, body, action }: { icon: ReactNode; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="rise flex flex-col items-center rounded-2xl border border-dashed border-border bg-card/60 px-6 py-14 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-secondary text-primary">{icon}</div>
      <h3 className="font-display text-xl font-semibold">{title}</h3>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">{body}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-72" />
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-32" /><Skeleton className="h-32" /><Skeleton className="h-32" />
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}

export function RequireAuth({ children, what }: { children: ReactNode; what: string }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <PageSkeleton />;
  if (!user)
    return (
      <div className="rise mx-auto mt-10 max-w-lg rounded-3xl border bg-card p-10 text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <LockKeyhole className="h-6 w-6" />
        </div>
        <h2 className="font-display text-2xl font-semibold">Your rehearsal room is private</h2>
        <p className="mt-3 text-sm text-muted-foreground">Create a free account to {what}. Your resume text and sessions stay tied to your account only.</p>
        <div className="mt-7 flex justify-center gap-3">
          <Link href="/register" className="rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90" data-testid="link-register-gate">Create account</Link>
          <Link href="/login" className="rounded-full border px-5 py-2.5 text-sm font-medium hover:bg-secondary" data-testid="link-login-gate">Sign in</Link>
        </div>
      </div>
    );
  return <>{children}</>;
}

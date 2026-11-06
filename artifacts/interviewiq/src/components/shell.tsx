import { useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useLogout, useHealthCheck } from "@workspace/api-client-react";
import { LayoutDashboard, FileText, Mic, History, Wind, LogOut, Menu, X, LogIn, MessagesSquare } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/resume", label: "Resume", icon: FileText },
  { href: "/practice", label: "Practice", icon: Mic },
  { href: "/history", label: "History", icon: History },
  { href: "/coaching", label: "Coaching", icon: Wind },
  { href: "/community", label: "Community & Messages", icon: MessagesSquare },
];

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2.5" data-testid="link-home">
      <span className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground">
        <span className="font-display text-lg font-bold leading-none">iq</span>
      </span>
      <span className="font-display text-xl font-semibold tracking-tight">InterviewIQ</span>
    </Link>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  const { user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const logout = useLogout();
  const health = useHealthCheck({ query: { retry: false, refetchInterval: 60_000 } });

  if (location === "/login" || location === "/register") return <>{children}</>;

  const doLogout = () =>
    logout.mutate(undefined, {
      onSuccess: async () => {
        await qc.cancelQueries();
        qc.clear();
        // A fresh document discards mounted query observers and private UI state.
        try {
          for (const key of Object.keys(sessionStorage)) {
            if (key.startsWith("iq-answer:")) sessionStorage.removeItem(key);
          }
        } finally {
          window.location.replace(import.meta.env.BASE_URL);
        }
      },
      onError: () => toast({ title: "Sign out failed", description: "Please try again.", variant: "destructive" }),
    });

  const isActive = (href: string) => (href === "/" ? location === "/" : location.startsWith(href));

  const nav = (
    <nav className="mt-10 flex flex-col gap-1">
      {NAV.map(({ href, label, icon: Icon }) => (
        <Link
          key={href} href={href} onClick={() => setOpen(false)} data-testid={`link-nav-${label.toLowerCase()}`}
          className={cn(
            "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
            isActive(href) ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
          )}
        >
          <Icon className={cn("h-4 w-4 transition-transform group-hover:scale-110", isActive(href) && "text-sidebar-primary")} />
          {label}
          {isActive(href) && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-sidebar-primary" />}
        </Link>
      ))}
    </nav>
  );

  const footer = (
    <div className="mt-auto space-y-4 pt-8">
      {user ? (
        <div className="rounded-2xl bg-sidebar-accent/70 p-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-sidebar-primary text-sm font-semibold text-sidebar-primary-foreground">
              {user.name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase() || "U"}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium" data-testid="text-username">{user.name}</p>
              <p className="truncate text-xs text-sidebar-foreground/60">{user.email}</p>
            </div>
            <button onClick={doLogout} disabled={logout.isPending} className="rounded-lg p-2 text-sidebar-foreground/70 hover:bg-sidebar/60 hover:text-sidebar-foreground" aria-label="Sign out" data-testid="button-logout">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : (
        <Link href="/login" className="flex items-center justify-center gap-2 rounded-xl bg-sidebar-primary px-3 py-2.5 text-sm font-semibold text-sidebar-primary-foreground hover:opacity-90" data-testid="link-login">
          <LogIn className="h-4 w-4" /> Sign in to practice
        </Link>
      )}
      <div className="flex items-center gap-2 px-1 font-mono text-[10px] uppercase tracking-widest text-sidebar-foreground/50" data-testid="status-api">
        <span className={cn("h-1.5 w-1.5 rounded-full", health.isLoading ? "bg-sidebar-foreground/40" : health.data?.status ? "bg-emerald-400" : "bg-red-400")} />
        {health.isLoading ? "Checking service" : health.data?.status ? "Service online" : "Service unreachable"}
      </div>
    </div>
  );

  return (
    <div className="min-h-[100dvh] bg-background">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-sidebar p-6 text-sidebar-foreground lg:flex">
        <Brand />
        {nav}
        {footer}
      </aside>
      <div className="sticky top-0 z-30 flex items-center justify-between bg-sidebar px-4 py-3 text-sidebar-foreground lg:hidden">
        <Brand />
        <button onClick={() => setOpen(true)} aria-label="Open menu" data-testid="button-menu"><Menu className="h-5 w-5" /></button>
      </div>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-foreground/40" onClick={() => setOpen(false)} />
          <div className="rise absolute inset-y-0 left-0 flex w-72 flex-col bg-sidebar p-6 text-sidebar-foreground">
            <div className="flex items-center justify-between"><Brand /><button onClick={() => setOpen(false)} aria-label="Close menu"><X className="h-5 w-5" /></button></div>
            {nav}
            {footer}
          </div>
        </div>
      )}
      <main className="lg:pl-64">
        <div className="mx-auto max-w-6xl px-5 py-8 md:px-10 md:py-12">{children}</div>
      </main>
    </div>
  );
}

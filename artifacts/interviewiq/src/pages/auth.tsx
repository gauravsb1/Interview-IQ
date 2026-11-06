import { useState, type FormEvent } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useLogin, useRegister, getGetMeQueryKey, type User } from "@workspace/api-client-react";
import { ArrowRight, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errMsg } from "@/lib/auth";

export default function AuthPage({ mode }: { mode: "login" | "register" }) {
  const isReg = mode === "register";
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const login = useLogin();
  const register = useRegister();
  const m = isReg ? register : login;
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [localErr, setLocalErr] = useState<string | null>(null);

  const done = (user: User) => {
    qc.clear();
    qc.setQueryData(getGetMeQueryKey(), user);
    setLocation(isReg ? "/resume" : "/");
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setLocalErr(null);
    if (isReg && !name.trim()) return setLocalErr("Tell us what to call you.");
    if (!/^\S+@\S+\.\S+$/.test(email)) return setLocalErr("That email doesn't look right.");
    if (password.length < 10) return setLocalErr("Password needs at least 10 characters.");
    const data = isReg ? { name: name.trim(), email, password } : { email, password };
    m.mutate({ data }, { onSuccess: done });
  };

  const error = localErr ?? (m.error ? errMsg(m.error, isReg ? "Could not create account." : "Email or password is incorrect.") : null);

  return (
    <div className="grid min-h-[100dvh] lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden bg-sidebar p-14 text-sidebar-foreground lg:flex lg:flex-col">
        <Link href="/" className="font-display text-2xl font-semibold">InterviewIQ</Link>
        <div className="my-auto max-w-md">
          <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-sidebar-primary">The rehearsal room</p>
          <h1 className="font-display mt-5 text-5xl font-semibold leading-[1.05]">
            Practice the questions <em className="text-sidebar-primary">your</em> resume invites.
          </h1>
          <p className="mt-6 text-sidebar-foreground/70">
            Upload your resume, rehearse out loud, and get feedback on clarity, completeness and STAR structure, grounded in the projects you actually shipped.
          </p>
          <div className="mt-12 space-y-3 border-l border-sidebar-primary/40 pl-5 font-mono text-xs text-sidebar-foreground/60">
            <p>01 / Questions drawn from your experience</p>
            <p>02 / Speak, review the transcript, then submit</p>
            <p>03 / Scored 0-100 as coaching, not a hiring verdict</p>
          </div>
        </div>
        <div className="pointer-events-none absolute -bottom-40 -right-40 h-[28rem] w-[28rem] rounded-full border border-sidebar-primary/20" />
        <div className="pointer-events-none absolute -bottom-24 -right-24 h-[20rem] w-[20rem] rounded-full border border-sidebar-primary/30" />
      </section>
      <section className="flex items-center justify-center px-6 py-14">
        <form onSubmit={submit} className="rise w-full max-w-sm" noValidate>
          <Link href="/" className="font-display text-xl font-semibold lg:hidden">InterviewIQ</Link>
          <h2 className="font-display mt-6 text-3xl font-semibold lg:mt-0">{isReg ? "Open your room" : "Welcome back"}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {isReg ? "A private space for your resume and sessions." : "Pick up where your last rehearsal left off."}
          </p>
          <div className="mt-8 space-y-4">
            {isReg && (
              <div className="space-y-1.5">
                <Label htmlFor="name">Name</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Priya Raman" data-testid="input-name" />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="you@domain.com" data-testid="input-email" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={isReg ? "new-password" : "current-password"} placeholder="At least 10 characters" data-testid="input-password" />
            </div>
          </div>
          {error && <p className="mt-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive" data-testid="text-auth-error">{error}</p>}
          <button type="submit" disabled={m.isPending} className="group mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60" data-testid="button-submit">
            {m.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {isReg ? "Create account" : "Sign in"}
            {!m.isPending && <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />}
          </button>
          <p className="mt-6 text-center text-sm text-muted-foreground">
            {isReg ? "Already have an account? " : "New here? "}
            <Link href={isReg ? "/login" : "/register"} className="font-medium text-primary underline-offset-4 hover:underline" data-testid="link-switch-auth">
              {isReg ? "Sign in" : "Create an account"}
            </Link>
          </p>
          <p className="mt-3 text-center"><Link href="/" className="text-xs text-muted-foreground hover:text-foreground">Back to dashboard</Link></p>
        </form>
      </section>
    </div>
  );
}

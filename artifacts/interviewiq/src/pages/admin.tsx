import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { CSVLink } from "@/components/admin-csv";
import {
  getGetAdminOverviewQueryKey,
  getGetAdminSessionQueryKey,
  getGetAdminTrafficQueryKey,
  getGetAdminUsersQueryKey,
  useAdminLogin,
  useAdminLogout,
  useGetAdminOverview,
  useGetAdminSession,
  useGetAdminTraffic,
  useGetAdminUsers,
  type AdminLoginInput,
  type GetAdminUsersParams,
} from "@workspace/api-client-react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";
import {
  Activity, ArrowDownRight, ArrowLeft, ArrowRight, ArrowUpRight, Check,
  ChevronDown, Download, LockKeyhole, LogOut, Moon, Printer, RefreshCw,
  Search, ShieldCheck, Sun, UsersRound, Eye, Globe2,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import "@/admin.css";

const intervalOptions = [
  { label: "Every 5 minutes", ms: 5 * 60 * 1000 },
  { label: "Every 15 minutes", ms: 15 * 60 * 1000 },
  { label: "Every hour", ms: 60 * 60 * 1000 },
];
const chartColors = { teal: "#176a62", coral: "#d66b4e", gold: "#dba94b" };
const chartTipStyle = {
  background: "#fbfcf8", border: "1px solid #dce5df", borderRadius: 10,
  color: "#183b3a", padding: "9px 12px", fontSize: 12,
};

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value ?? 0);
}
function formatScore(value: number | null | undefined) {
  return value != null && Number.isFinite(value) ? value.toFixed(1) : "—";
}
function formatDate(value?: string | null) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
}
function formatUpdated(timestamp?: number) {
  if (!timestamp) return null;
  const date = new Date(timestamp);
  return `${date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} · ${date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}
function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Something went wrong. Please try again.";
}

function AdminLogin() {
  const queryClient = useQueryClient();
  const loginMutation = useAdminLogin();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorText, setErrorText] = useState("");
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorText("");
    const input: AdminLoginInput = { email: email.trim(), password };
    loginMutation.mutate({ data: input }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetAdminSessionQueryKey() }),
      onError: (error) => setErrorText(getErrorMessage(error)),
    });
  };

  return (
    <main className="admin-root min-h-[100dvh]">
      <div className="mx-auto grid min-h-[100dvh] max-w-[1440px] lg:grid-cols-[.92fr_1.08fr]">
        <section className="admin-aside relative flex min-h-[32vh] flex-col justify-between overflow-hidden px-7 py-8 sm:px-12 lg:min-h-[100dvh] lg:px-16 lg:py-12">
          <div className="absolute -right-20 -top-24 h-80 w-80 rounded-full border border-white/10" />
          <div className="absolute -right-5 -top-9 h-52 w-52 rounded-full border border-white/10" />
          <Link href="/" className="relative z-10 flex w-fit items-center gap-3 text-sm font-semibold tracking-tight text-white">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#dba94b] text-[#183b3a]"><Activity size={18} /></span>
            InterviewIQ
          </Link>
          <div className="relative z-10 max-w-md py-10">
            <p className="mb-5 font-mono text-[10px] uppercase tracking-[.2em] text-[#c4d5c7]">Operator workspace · private</p>
            <h1 className="admin-display text-5xl leading-[.98] text-[#f2f5ef] sm:text-6xl">A clearer view of every practice.</h1>
            <p className="mt-6 max-w-sm text-sm leading-6 text-[#c6d4cb]">Review account activity and coaching outcomes from one secure, read-only workspace.</p>
          </div>
          <div className="relative z-10 flex items-center gap-2 text-xs text-[#c4d5c7]">
            <ShieldCheck size={15} /> Restricted to authorized operators
          </div>
        </section>
        <section className="flex items-center justify-center px-6 py-12 sm:px-12">
          <div className="admin-enter w-full max-w-[390px]">
            <div className="mb-8">
              <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl border border-[var(--admin-line)] bg-[var(--admin-card)] text-[var(--admin-teal)]"><LockKeyhole size={21} /></div>
              <p className="admin-kicker mb-3">Secure sign in</p>
              <h2 className="admin-display text-4xl">Welcome back.</h2>
              <p className="admin-muted mt-2 text-sm leading-6">Sign in with your administrator credentials to continue.</p>
            </div>
            <form onSubmit={handleSubmit} className="space-y-5">
              <label className="block">
                <span className="mb-2 block text-sm font-medium">Administrator email</span>
                <input data-testid="input-admin-email" autoComplete="username" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" className="admin-control h-12 w-full px-4 text-sm outline-none placeholder:text-[var(--admin-muted)]" />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium">Password</span>
                <input data-testid="input-admin-password" autoComplete="current-password" type="password" minLength={12} required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 12 characters" className="admin-control h-12 w-full px-4 text-sm outline-none placeholder:text-[var(--admin-muted)]" />
              </label>
              {errorText && <p role="alert" className="rounded-lg border border-[#e2b4a6] bg-[#fff0eb] px-3 py-2.5 text-sm text-[#963f2c]">{errorText}</p>}
              <button data-testid="button-admin-sign-in" type="submit" disabled={loginMutation.isPending} className="admin-primary flex h-12 w-full items-center justify-center gap-2 rounded-lg text-sm font-semibold disabled:opacity-60">
                {loginMutation.isPending ? "Verifying access…" : "Enter admin workspace"} <ArrowRight size={16} />
              </button>
            </form>
            <div className="mt-7 flex items-center gap-2 border-t border-[var(--admin-line)] pt-5 text-xs text-[var(--admin-muted)]"><ShieldCheck size={14} /> Your sign-in is protected by the admin session cookie.</div>
          </div>
        </section>
      </div>
    </main>
  );
}

export default function AdminPage() {
  const session = useGetAdminSession();
  const queryClient = useQueryClient();
  const authenticated = session.data?.authenticated === true;
  const [isDark, setIsDark] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [intervalMs, setIntervalMs] = useState(intervalOptions[0].ms);
  const [menuOpen, setMenuOpen] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [search, setSearch] = useState("");
  const [stableSearch, setStableSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const limit = 12;
  const params: GetAdminUsersParams = useMemo(() => ({
    ...(stableSearch ? { q: stableSearch } : {}),
    limit,
    offset,
  }), [stableSearch, offset]);
  const overviewQuery = useGetAdminOverview({
    query: { enabled: authenticated, queryKey: getGetAdminOverviewQueryKey() },
  });
  const usersQuery = useGetAdminUsers(params, {
    query: { enabled: authenticated, queryKey: getGetAdminUsersQueryKey(params) },
  });
  const trafficQuery = useGetAdminTraffic({
    query: { enabled: authenticated, queryKey: getGetAdminTrafficQueryKey() },
  });
  const logoutMutation = useAdminLogout();
  const loading = overviewQuery.isLoading || overviewQuery.isFetching || usersQuery.isLoading || usersQuery.isFetching;
  const trafficLoading = trafficQuery.isLoading || trafficQuery.isFetching;
  const overview = overviewQuery.data;
  const usersPage = usersQuery.data;
  const traffic = trafficQuery.data;
  const updatedAt = formatUpdated(overviewQuery.dataUpdatedAt);

  useEffect(() => {
    const timer = window.setTimeout(() => { setStableSearch(search.trim()); setOffset(0); }, 280);
    return () => window.clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    const timer = window.setTimeout(() => setSpinning(false), loading ? 10_000 : 600);
    if (loading) setSpinning(true);
    return () => window.clearTimeout(timer);
  }, [loading]);
  useEffect(() => {
    function handleOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);
  useEffect(() => {
    if (!autoRefresh || !authenticated) return;
    const timer = window.setInterval(() => {
      queryClient.invalidateQueries({ queryKey: getGetAdminOverviewQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetAdminUsersQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetAdminTrafficQueryKey() });
    }, Math.max(intervalMs, 5 * 60 * 1000));
    return () => window.clearInterval(timer);
  }, [autoRefresh, authenticated, intervalMs, queryClient]);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
    return () => document.documentElement.classList.remove("dark");
  }, [isDark]);

  const refresh = () => {
    setSpinning(true);
    queryClient.invalidateQueries({ queryKey: getGetAdminOverviewQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetAdminUsersQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetAdminTrafficQueryKey() });
  };
  const retry = () => {
    session.refetch();
    refresh();
  };
  const chartData = overview?.sessionsByMonth ?? [];
  const categoryData = overview?.performanceByCategory ?? [];
  const trafficDays = traffic?.daily ?? [];
  const topPages = traffic?.topPages ?? [];
  const trafficCsvData: Array<Record<string, string | number>> = trafficDays.map((day) => ({
    date: day.date,
    pageViews: day.pageViews,
    uniqueVisitors: day.uniqueVisitors,
  }));
  const fullPageCount = usersPage ? Math.max(1, Math.ceil(usersPage.total / limit)) : 1;
  const currentPage = Math.floor(offset / limit) + 1;

  if (session.isLoading) {
    return <main className="admin-root min-h-[100dvh] p-6 sm:p-10"><div className="mx-auto max-w-6xl space-y-6"><Skeleton className="h-10 w-64" /><Skeleton className="h-52 w-full rounded-2xl" /><div className="grid gap-4 md:grid-cols-4">{[1,2,3,4].map((item) => <Skeleton key={item} className="h-28 rounded-2xl" />)}</div></div></main>;
  }
  if (!authenticated) return <AdminLogin />;

  return (
    <main className={`admin-root ${isDark ? "dark" : ""} min-h-[100dvh]`}>
      <div className="mx-auto max-w-[1440px] px-4 py-6 sm:px-7 lg:px-10">
        <header className="admin-enter mb-8 flex flex-col justify-between gap-5 border-b border-[var(--admin-line)] pb-6 sm:flex-row sm:items-end">
          <div>
            <div className="mb-4 flex items-center gap-2 text-xs font-semibold tracking-tight"><span className="grid h-8 w-8 place-items-center rounded-xl bg-[#173b38] text-[#dba94b]"><Activity size={16} /></span> InterviewIQ <span className="admin-muted font-normal">/</span> <span className="admin-muted font-normal">Owner admin</span></div>
            <p className="admin-kicker mb-2">Workspace overview</p>
            <h1 className="admin-display text-4xl sm:text-[46px]">Performance, in full view.</h1>
            <p className="admin-muted mt-2 text-sm">Aggregate account activity and interview coaching performance.</p>
            {updatedAt && <p className="admin-muted mt-3 text-xs">Updated {updatedAt} <span className="px-1">·</span> MySQL-backed metrics</p>}
          </div>
          <div className="admin-print-hide flex flex-wrap items-center gap-2">
            <div className="relative" ref={dropdownRef}>
              <div className="admin-control flex h-10 overflow-hidden text-sm">
                <button data-testid="button-admin-refresh" onClick={refresh} className="flex items-center gap-2 px-3"><RefreshCw size={15} className={spinning ? "animate-spin" : ""} />Refresh</button>
                <span className="my-2 w-px bg-[var(--admin-line)]" />
                <button data-testid="button-refresh-options" onClick={() => setMenuOpen((open) => !open)} className="px-3" aria-label="Auto-refresh settings"><ChevronDown size={15} /></button>
              </div>
              {menuOpen && <div className="admin-card absolute right-0 top-12 z-30 w-64 p-3 shadow-xl">
                <div className="flex items-center justify-between px-2 py-2"><div><p className="text-sm font-semibold">Auto-refresh</p><p className="admin-muted mt-0.5 text-xs">Off by default</p></div><button role="switch" aria-checked={autoRefresh} data-testid="switch-auto-refresh" onClick={() => setAutoRefresh((value) => !value)} className={`relative h-6 w-11 rounded-full transition-colors ${autoRefresh ? "bg-[var(--admin-teal)]" : "bg-[var(--admin-line)]"}`}><span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${autoRefresh ? "translate-x-6" : "translate-x-1"}`} /></button></div>
                <div className="my-2 border-t border-[var(--admin-line)]" />
                {intervalOptions.map((option) => <button data-testid={`button-interval-${option.ms}`} key={option.ms} onClick={() => { setIntervalMs(option.ms); setAutoRefresh(true); setMenuOpen(false); }} className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm hover:bg-[var(--muted)]"><span>{option.label}</span>{intervalMs === option.ms && <Check size={15} className="text-[var(--admin-teal)]" />}</button>)}
              </div>}
            </div>
            <button data-testid="button-print-admin" onClick={() => window.print()} className="admin-control grid h-10 w-10 place-items-center" aria-label="Print dashboard"><Printer size={16} /></button>
            <button data-testid="button-toggle-admin-theme" onClick={() => setIsDark((value) => !value)} className="admin-control grid h-10 w-10 place-items-center" aria-label="Toggle dark mode">{isDark ? <Sun size={16} /> : <Moon size={16} />}</button>
            <button data-testid="button-admin-logout" onClick={() => logoutMutation.mutate(undefined, { onSuccess: () => {
              queryClient.setQueryData(getGetAdminSessionQueryKey(), { authenticated: false });
              queryClient.removeQueries({
                predicate: (query) => {
                  const key = query.queryKey[0];
                  return typeof key === "string" && key.startsWith("/api/admin/") && key !== "/api/admin/session";
                },
              });
            } })} disabled={logoutMutation.isPending} className="admin-control flex h-10 items-center gap-2 px-3 text-sm"><LogOut size={15} /> Sign out</button>
          </div>
        </header>

        {(overviewQuery.isError || usersQuery.isError || trafficQuery.isError) && <div role="alert" className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#e4b3a4] bg-[#fff0eb] px-4 py-3 text-sm text-[#963f2c]"><span>{getErrorMessage(overviewQuery.error ?? usersQuery.error ?? trafficQuery.error)}</span><button data-testid="button-retry-admin-data" onClick={retry} className="rounded-md border border-[#d9a08f] px-3 py-1.5 font-semibold">Retry</button></div>}

        <section className="admin-enter-delay mb-7 grid grid-cols-2 gap-3 lg:grid-cols-5">
          {[
            { label: "Accounts", value: overview?.totalUsers, note: "registered candidates", icon: UsersRound, color: "var(--admin-teal)" },
            { label: "Practice sessions", value: overview?.totalSessions, note: `${overview?.completedSessions ?? 0} completed`, icon: Activity, color: "var(--admin-coral)" },
            { label: "Answers reviewed", value: overview?.totalAnswers, note: "across all sessions", icon: ArrowUpRight, color: "var(--admin-gold)" },
            { label: "Average score", value: overview ? `${formatScore(overview.averageScore)}` : undefined, note: "coaching score", icon: ArrowDownRight, color: "var(--admin-teal)" },
            { label: "Completion", value: overview ? `${overview.totalSessions ? ((overview.completedSessions / overview.totalSessions) * 100).toFixed(1) : "0.0"}%` : undefined, note: "sessions completed", icon: Check, color: "var(--admin-coral)" },
          ].map((metric) => <article key={metric.label} data-testid={`metric-${metric.label.toLowerCase().replaceAll(" ", "-")}`} className="admin-card min-h-[132px] p-4 sm:p-5">
            <div className="flex items-center justify-between"><span className="admin-muted text-[12px]">{metric.label}</span><metric.icon size={16} style={{ color: metric.color }} /></div>
            {loading ? <><Skeleton className="mt-4 h-8 w-24" /><Skeleton className="mt-2 h-3 w-32" /></> : <><p className="mt-3 font-mono text-[27px] font-medium tracking-tight">{metric.value === undefined ? "—" : typeof metric.value === "number" ? formatNumber(metric.value) : metric.value}</p><p className="admin-muted mt-1 text-xs">{metric.note}</p></>}
          </article>)}
        </section>

        <section className="admin-card mb-7 overflow-hidden" aria-labelledby="traffic-heading">
          <div className="flex flex-col gap-5 border-b border-[var(--admin-line)] p-4 sm:flex-row sm:items-end sm:justify-between sm:p-5">
            <div>
              <p className="admin-kicker mb-1">Anonymous site traffic · last {traffic?.windowDays ?? 30} days</p>
              <h2 id="traffic-heading" className="text-lg font-semibold">A view of the wider audience</h2>
              <p className="admin-muted mt-1 max-w-2xl text-sm leading-5">Traffic counts are separate from candidate accounts. Unique visitors represent anonymous browsers, not exact people; no traffic identities are shown here.</p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:min-w-[300px]">
              <div className="rounded-xl border border-[var(--admin-line)] bg-[var(--admin-paper)] px-3 py-3">
                <div className="admin-muted flex items-center gap-2 text-xs"><Eye size={14} /> Page views</div>
                {trafficLoading ? <Skeleton className="mt-2 h-7 w-20" /> : <p data-testid="metric-traffic-page-views" className="mt-2 font-mono text-xl">{traffic ? formatNumber(traffic.pageViews) : "—"}</p>}
              </div>
              <div className="rounded-xl border border-[var(--admin-line)] bg-[var(--admin-paper)] px-3 py-3">
                <div className="admin-muted flex items-center gap-2 text-xs"><Globe2 size={14} /> Anonymous browsers</div>
                {trafficLoading ? <Skeleton className="mt-2 h-7 w-20" /> : <p data-testid="metric-traffic-unique-browsers" className="mt-2 font-mono text-xl">{traffic ? formatNumber(traffic.uniqueVisitors) : "—"}</p>}
              </div>
            </div>
          </div>
          <div className="grid min-w-0 lg:grid-cols-[1.45fr_1fr]">
            <article className="min-w-0 p-4 sm:p-5 lg:border-r lg:border-[var(--admin-line)]">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div><p className="admin-kicker mb-1">Daily pattern</p><h3 className="text-base font-semibold">Page views & anonymous browsers</h3></div>
                {!trafficLoading && trafficDays.length > 0 && <CSVLink data={trafficCsvData} filename="site-traffic-last-30-days.csv" className="admin-control grid h-9 w-9 place-items-center admin-print-hide" aria-label="Export daily site traffic chart as CSV"><Download size={15} /></CSVLink>}
              </div>
              {trafficLoading ? <Skeleton className="h-[270px] w-full" /> : trafficQuery.isError ? <div className="admin-muted flex h-[270px] items-center justify-center text-center text-sm">Traffic data could not be loaded. Use Retry above.</div> : trafficDays.length ? <ResponsiveContainer width="100%" height={270} debounce={0}>
                <AreaChart data={trafficDays} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                  <defs><linearGradient id="trafficViewsFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={chartColors.teal} stopOpacity={.26} /><stop offset="100%" stopColor={chartColors.teal} stopOpacity={.02} /></linearGradient><linearGradient id="trafficBrowsersFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={chartColors.gold} stopOpacity={.22} /><stop offset="100%" stopColor={chartColors.gold} stopOpacity={0} /></linearGradient></defs>
                  <CartesianGrid vertical={false} stroke="var(--admin-line)" strokeDasharray="3 5" />
                  <XAxis dataKey="date" tickFormatter={(value: string) => { const [year, month, day] = value.split("-").map(Number); return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(year, month - 1, day)); }} tick={{ fontSize: 11, fill: "var(--admin-muted)" }} axisLine={false} tickLine={false} minTickGap={24} />
                  <YAxis tick={{ fontSize: 11, fill: "var(--admin-muted)" }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={chartTipStyle} cursor={{ stroke: chartColors.teal, strokeDasharray: "3 3" }} labelFormatter={(value) => { const [year, month, day] = String(value).split("-").map(Number); return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).format(new Date(year, month - 1, day)); }} />
                  <Area type="monotone" dataKey="pageViews" name="Page views" stroke={chartColors.teal} strokeWidth={2.5} fill="url(#trafficViewsFill)" isAnimationActive={false} />
                  <Area type="monotone" dataKey="uniqueVisitors" name="Anonymous browsers" stroke={chartColors.gold} strokeWidth={2} fill="url(#trafficBrowsersFill)" isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer> : <div className="admin-muted flex h-[270px] flex-col items-center justify-center text-center"><Globe2 size={22} className="mb-3 opacity-50" /><p className="text-sm font-medium">No traffic to chart yet</p><p className="mt-1 text-xs">Daily counts will appear as anonymous browsers visit the site.</p></div>}
              <div className="admin-muted mt-1 flex flex-wrap gap-x-5 gap-y-2 text-xs"><span className="flex items-center gap-2"><i className="h-2 w-2 rounded-full bg-[#176a62]" />Page views</span><span className="flex items-center gap-2"><i className="h-2 w-2 rounded-full bg-[#dba94b]" />Anonymous browsers</span></div>
            </article>
            <article className="min-w-0 p-4 sm:p-5">
              <div className="mb-3"><p className="admin-kicker mb-1">Most visited</p><h3 className="text-base font-semibold">Top pages</h3><p className="admin-muted mt-1 text-xs">By page views in this reporting window</p></div>
              {trafficLoading ? <div className="space-y-3">{[1,2,3,4].map((item) => <Skeleton key={item} className="h-12 w-full" />)}</div> : trafficQuery.isError ? <div className="admin-muted flex min-h-[220px] items-center justify-center text-center text-sm">Page totals could not be loaded. Use Retry above.</div> : topPages.length ? <div className="space-y-1">
                {topPages.map((page, index) => <div key={page.pagePath} data-testid={`traffic-page-${index}`} className="flex items-center gap-3 rounded-lg px-2 py-3 hover:bg-[var(--admin-paper)]">
                  <span className="admin-muted w-6 shrink-0 font-mono text-xs">{String(index + 1).padStart(2, "0")}</span>
                  <div className="min-w-0 flex-1"><p className="truncate font-mono text-sm" title={page.pagePath}>{page.pagePath}</p><p className="admin-muted mt-1 text-xs">{formatNumber(page.uniqueVisitors)} anonymous browsers</p></div>
                  <span className="shrink-0 text-right"><span className="block font-mono text-sm">{formatNumber(page.pageViews)}</span><span className="admin-muted text-[10px] uppercase tracking-wider">views</span></span>
                </div>)}
              </div> : <div className="admin-muted flex min-h-[220px] flex-col items-center justify-center text-center"><Activity size={22} className="mb-3 opacity-50" /><p className="text-sm font-medium">No page totals yet</p><p className="mt-1 text-xs">Popular pages appear once traffic is recorded.</p></div>}
            </article>
          </div>
        </section>

        <section className="mb-7 grid gap-4 lg:grid-cols-[1.55fr_1fr]">
          <article className="admin-card min-w-0 p-4 sm:p-5">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div><p className="admin-kicker mb-1">Activity over time</p><h2 className="text-base font-semibold">Sessions & answers by month</h2></div>
              {!loading && chartData.length > 0 && <CSVLink data={chartData} filename="sessions-and-answers-by-month.csv" className="admin-control grid h-9 w-9 place-items-center admin-print-hide" aria-label="Export monthly activity chart as CSV"><Download size={15} /></CSVLink>}
            </div>
            {loading ? <Skeleton className="h-[270px] w-full" /> : chartData.length ? <ResponsiveContainer width="100%" height={270} debounce={0}>
              <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                <defs><linearGradient id="sessionsFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={chartColors.teal} stopOpacity={.28} /><stop offset="100%" stopColor={chartColors.teal} stopOpacity={.02} /></linearGradient><linearGradient id="answersFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={chartColors.coral} stopOpacity={.2} /><stop offset="100%" stopColor={chartColors.coral} stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid vertical={false} stroke="var(--admin-line)" strokeDasharray="3 5" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "var(--admin-muted)" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "var(--admin-muted)" }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={chartTipStyle} cursor={{ stroke: chartColors.teal, strokeDasharray: "3 3" }} />
                <Area type="monotone" dataKey="sessions" name="Sessions" stroke={chartColors.teal} strokeWidth={2.5} fill="url(#sessionsFill)" isAnimationActive={false} />
                <Area type="monotone" dataKey="answers" name="Answers" stroke={chartColors.coral} strokeWidth={2} fill="url(#answersFill)" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer> : <div className="admin-muted flex h-[270px] flex-col items-center justify-center text-center"><Activity size={22} className="mb-3 opacity-50" /><p className="text-sm font-medium">No activity to chart yet</p><p className="mt-1 text-xs">Monthly totals will appear when candidates start practicing.</p></div>}
            <div className="admin-muted mt-1 flex gap-5 text-xs"><span className="flex items-center gap-2"><i className="h-2 w-2 rounded-full bg-[#176a62]" />Sessions</span><span className="flex items-center gap-2"><i className="h-2 w-2 rounded-full bg-[#d66b4e]" />Answers</span></div>
          </article>
          <article className="admin-card min-w-0 p-4 sm:p-5">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div><p className="admin-kicker mb-1">Coaching outcomes</p><h2 className="text-base font-semibold">Average score by category</h2></div>
              {!loading && categoryData.length > 0 && <CSVLink data={categoryData} filename="average-score-by-category.csv" className="admin-control grid h-9 w-9 place-items-center admin-print-hide" aria-label="Export category performance chart as CSV"><Download size={15} /></CSVLink>}
            </div>
            {loading ? <Skeleton className="h-[270px] w-full" /> : categoryData.length ? <ResponsiveContainer width="100%" height={270} debounce={0}>
              <BarChart data={categoryData} layout="vertical" margin={{ top: 4, right: 14, bottom: 0, left: 2 }}>
                <CartesianGrid horizontal={false} stroke="var(--admin-line)" strokeDasharray="3 5" />
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: "var(--admin-muted)" }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="category" width={98} tick={{ fontSize: 11, fill: "var(--admin-muted)" }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={chartTipStyle} cursor={{ fill: "rgba(23,106,98,.08)" }} />
                <Bar dataKey="averageScore" name="Average score" fill={chartColors.teal} radius={[0, 5, 5, 0]} barSize={18} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer> : <div className="admin-muted flex h-[270px] flex-col items-center justify-center text-center"><Activity size={22} className="mb-3 opacity-50" /><p className="text-sm font-medium">Scores need sessions</p><p className="mt-1 text-xs">Category comparisons appear as interviews are completed.</p></div>}
            <p className="admin-muted mt-1 text-xs">Score out of 100 · based on evaluated sessions</p>
          </article>
        </section>

        <section className="admin-card overflow-hidden">
          <div className="flex flex-col justify-between gap-4 p-4 sm:flex-row sm:items-end sm:p-5">
            <div><p className="admin-kicker mb-1">Account directory</p><h2 className="text-lg font-semibold">Candidates</h2><p className="admin-muted mt-1 text-sm">Search accounts and open a complete performance record.</p></div>
            <label className="admin-control flex h-10 w-full items-center gap-2 px-3 sm:max-w-[320px]">
              <Search size={16} className="admin-muted shrink-0" /><input data-testid="input-search-admin-users" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name or email" className="w-full bg-transparent text-sm outline-none placeholder:text-[var(--admin-muted)]" aria-label="Search users" />
            </label>
          </div>
          {loading ? <div className="space-y-3 px-5 pb-5">{[1,2,3,4].map((row) => <Skeleton key={row} className="h-[58px] w-full" />)}</div> :
            usersQuery.isError ? <div className="px-5 pb-6 text-sm text-[#963f2c]">Could not load candidates. Use Retry above to try again.</div> :
              usersPage?.users.length ? <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left">
                  <thead><tr className="admin-muted bg-[color:var(--admin-paper)] text-[11px] uppercase tracking-[.1em]"><th className="px-5 py-3 font-medium">Candidate</th><th className="px-4 py-3 font-medium">Joined</th><th className="px-4 py-3 font-medium">Last login</th><th className="px-4 py-3 font-medium">Sessions</th><th className="px-4 py-3 font-medium">Answers</th><th className="px-4 py-3 font-medium">Avg score</th><th className="px-5 py-3" /></tr></thead>
                  <tbody>{usersPage.users.map((user) => <tr key={user.id} data-testid={`row-admin-user-${user.id}`} className="admin-table-row transition-colors hover:bg-[color:var(--admin-paper)]">
                    <td className="px-5 py-4"><div className="flex items-center gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#dce9df] font-mono text-xs font-semibold text-[#176a62]">{user.name.trim().split(/\s+/).slice(0,2).map((part) => part[0]).join("").toUpperCase() || "?"}</span><div><p className="text-sm font-semibold">{user.name}</p><p className="admin-muted mt-0.5 text-xs">{user.email}</p></div></div></td>
                    <td className="admin-muted px-4 py-4 text-sm">{formatDate(user.createdAt)}</td><td className="admin-muted px-4 py-4 text-sm">{formatDate(user.lastLoginAt)}</td>
                    <td className="px-4 py-4 font-mono text-sm">{formatNumber(user.totalSessions)}</td><td className="px-4 py-4 font-mono text-sm">{formatNumber(user.totalAnswers)}</td>
                    <td className="px-4 py-4"><span className="rounded-md bg-[#e8f0e8] px-2 py-1 font-mono text-xs text-[#176a62]">{formatScore(user.averageScore)}</span></td>
                    <td className="px-5 py-4 text-right"><Link href={`/admin/users/${encodeURIComponent(user.id)}`} data-testid={`link-admin-user-${user.id}`} className="admin-control inline-flex h-9 items-center gap-2 px-3 text-xs font-semibold">View record <ArrowRight size={14} /></Link></td>
                  </tr>)}</tbody>
                </table>
              </div> : <div className="flex flex-col items-center justify-center px-5 py-14 text-center"><UsersRound size={27} className="admin-muted mb-3 opacity-60" /><h3 className="text-sm font-semibold">{stableSearch ? "No candidates match that search" : "No candidate accounts yet"}</h3><p className="admin-muted mt-1 max-w-sm text-sm">{stableSearch ? "Try a different name or email address." : "When users create an InterviewIQ account, their activity will appear here."}</p></div>}
          {usersPage && usersPage.total > 0 && <footer className="admin-table-row flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><p className="admin-muted text-sm">Showing {offset + 1}–{Math.min(offset + (usersPage.users.length || limit), usersPage.total)} of {formatNumber(usersPage.total)} candidates</p><div className="flex items-center gap-2"><button data-testid="button-users-previous" className="admin-control flex h-9 items-center gap-1.5 px-3 text-sm disabled:opacity-40" disabled={offset <= 0} onClick={() => setOffset(Math.max(0, offset - limit))}><ArrowLeft size={14} />Previous</button><span className="admin-muted px-2 font-mono text-xs">{currentPage} / {fullPageCount}</span><button data-testid="button-users-next" className="admin-control flex h-9 items-center gap-1.5 px-3 text-sm disabled:opacity-40" disabled={offset + limit >= usersPage.total} onClick={() => setOffset(offset + limit)}>Next<ArrowRight size={14} /></button></div></footer>}
        </section>
        <footer className="admin-muted mt-7 flex items-center justify-between gap-3 text-xs"><span>InterviewIQ owner console <span className="px-1">·</span> Private workspace</span><span className="flex items-center gap-1.5"><ShieldCheck size={13} /> Sensitive credentials are never displayed</span></footer>
      </div>
    </main>
  );
}

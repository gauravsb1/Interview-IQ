import { useMemo, useState } from "react";
import { Link } from "wouter";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { useListSessions, getListSessionsQueryKey, useDeleteSession, getGetDashboardQueryKey, getGetSessionQueryKey } from "@workspace/api-client-react";
import { Search, Trash2, History as HistoryIcon, ArrowRight } from "lucide-react";
import { PageHeader, RequireAuth, ErrorState, EmptyState, ScoreRing } from "@/components/bits";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { errMsg, CATEGORY_LABEL } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";

function List() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const q = useListSessions();
  const del = useDeleteSession();
  const [search, setSearch] = useState("");
  const [pending, setPending] = useState<string | null>(null);

  const rows = useMemo(() => {
    const s = search.toLowerCase().trim();
    return (q.data ?? []).filter((x) => !s || [x.role, x.company, x.category].some((f) => f?.toLowerCase().includes(s)));
  }, [q.data, search]);

  const confirm = () => {
    if (!pending) return;
    const id = pending;
    del.mutate({ id }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListSessionsQueryKey() });
        qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
        qc.removeQueries({ queryKey: getGetSessionQueryKey(id) });
        toast({ title: "Session deleted" });
        setPending(null);
      },
      onError: (e) => toast({ title: "Delete failed", description: errMsg(e), variant: "destructive" }),
    });
  };

  if (q.isLoading) return <div className="space-y-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}</div>;
  if (q.error) return <ErrorState message={errMsg(q.error)} onRetry={() => q.refetch()} />;
  if (!q.data?.length)
    return <EmptyState icon={<HistoryIcon className="h-6 w-6" />} title="No sessions recorded" body="Every rehearsal you run lands here, searchable by role and company." action={<Link href="/practice" className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground" data-testid="link-practice-empty">Run your first session</Link>} />;

  return (
    <>
      <div className="relative mb-5 max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search role, company or category" className="rounded-full bg-card pl-9" data-testid="input-search" />
      </div>
      {rows.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">Nothing matches "{search}".</p> : (
        <ul className="space-y-2.5">
          {rows.map((s, i) => (
            <li key={s.id} className={`rise rise-${Math.min(i, 4)} group flex items-center gap-4 rounded-2xl border bg-card p-4 transition hover:border-primary/40`} data-testid={`row-session-${s.id}`}>
              <ScoreRing value={s.score} size={52} />
              <Link href={s.status === "completed" ? `/results/${s.id}` : `/interview/${s.id}`} className="min-w-0 flex-1" data-testid={`link-session-${s.id}`}>
                <p className="truncate font-semibold">{s.role}{s.company ? <span className="font-normal text-muted-foreground"> at {s.company}</span> : null}</p>
                <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                  <span className="font-mono uppercase tracking-wider text-primary">{CATEGORY_LABEL[s.category] ?? s.category}</span>
                  <span>{format(new Date(s.createdAt), "MMM d, yyyy")}</span>
                  <span>{s.answers.length}/{s.questionCount} answered</span>
                  {s.status === "active" && <span className="rounded-full bg-accent/30 px-2 text-foreground">In progress</span>}
                </p>
              </Link>
              <ArrowRight className="hidden h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5 sm:block" />
              <button onClick={() => setPending(s.id)} className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label="Delete session" data-testid={`button-delete-${s.id}`}>
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <AlertDialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">Delete this session?</AlertDialogTitle>
            <AlertDialogDescription>Its answers, evaluations and any human ratings will be removed permanently.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); confirm(); }} disabled={del.isPending} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" data-testid="button-confirm-delete">
              {del.isPending ? "Deleting" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default function HistoryPage() {
  return (
    <div>
      <PageHeader kicker="Archive" title="Every rehearsal" />
      <RequireAuth what="keep a history of your sessions"><List /></RequireAuth>
    </div>
  );
}

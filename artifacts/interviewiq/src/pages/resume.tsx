import { useRef, useState, type DragEvent } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useGetProfile, useUploadResume, getGetProfileQueryKey, getGetDashboardQueryKey } from "@workspace/api-client-react";
import { UploadCloud, Loader2, FileText, Wrench, FolderGit2, GraduationCap, BadgeCheck, Briefcase, ArrowRight } from "lucide-react";
import { PageHeader, RequireAuth, ErrorState, PageSkeleton } from "@/components/bits";
import { errMsg, errStatus } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const ACCEPT = ".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain";

function Uploader({ compact }: { compact?: boolean }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const upload = useUploadResume();
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [name, setName] = useState<string | null>(null);

  const send = (file: File) => {
    if (!/\.(pdf|docx|txt)$/i.test(file.name)) {
      toast({ title: "Unsupported file", description: "Use a PDF, DOCX or TXT resume.", variant: "destructive" });
      return;
    }
    setName(file.name);
    upload.mutate({ data: { file } }, {
      onSuccess: (p) => {
        qc.setQueryData(getGetProfileQueryKey(), p);
        qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
        toast({ title: "Resume analyzed", description: "The file itself was discarded; only extracted text is kept." });
      },
    });
  };
  const onDrop = (e: DragEvent) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) send(f); };

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={onDrop}
        onClick={() => !upload.isPending && input.current?.click()}
        className={cn("group cursor-pointer rounded-3xl border-2 border-dashed bg-card text-center transition-colors", compact ? "p-6" : "p-12", drag ? "border-primary bg-primary/5" : "hover:border-primary/50")}
        data-testid="dropzone-resume"
      >
        <input ref={input} type="file" accept={ACCEPT} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) send(f); e.target.value = ""; }} data-testid="input-resume-file" />
        {upload.isPending ? (
          <div className="flex flex-col items-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="mt-4 font-medium">Reading {name}</p>
            <p className="mt-1 text-sm text-muted-foreground">Extracting skills, projects and experience. This can take up to a minute.</p>
          </div>
        ) : (
          <div className="flex flex-col items-center">
            <UploadCloud className="h-8 w-8 text-primary transition-transform group-hover:-translate-y-1" />
            <p className="mt-3 font-medium">{compact ? "Replace resume" : "Drop your resume here, or click to browse"}</p>
            <p className="mt-1 text-xs text-muted-foreground">PDF, DOCX or TXT. The file is processed transiently and not stored.</p>
          </div>
        )}
      </div>
      {upload.error && (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive" data-testid="text-upload-error">
          <span>{errMsg(upload.error, "Upload failed.")}</span>
          <button className="font-semibold underline" onClick={() => input.current?.click()}>Choose again</button>
        </div>
      )}
    </div>
  );
}

const SECTIONS = [
  { key: "experience", label: "Experience", icon: Briefcase, wide: true },
  { key: "projects", label: "Projects", icon: FolderGit2, wide: true },
  { key: "education", label: "Education", icon: GraduationCap },
  { key: "certifications", label: "Certifications", icon: BadgeCheck },
] as const;

function ProfileView() {
  const q = useGetProfile({ query: { retry: false, queryKey: getGetProfileQueryKey() } });
  if (q.isLoading) return <PageSkeleton />;
  if ((q.error && errStatus(q.error) === 404) || (q.data && !q.data.filename)) return <Uploader />;
  if (q.error || !q.data) return <ErrorState message={errMsg(q.error)} onRetry={() => q.refetch()} />;
  const p = q.data;
  return (
    <div className="space-y-6">
      <div className="rise flex flex-col gap-4 rounded-3xl bg-sidebar p-6 text-sidebar-foreground md:flex-row md:items-center">
        <FileText className="h-8 w-8 text-sidebar-primary" />
        <div className="flex-1">
          <p className="font-mono text-[10px] uppercase tracking-widest text-sidebar-foreground/60">Current source</p>
          <p className="font-display text-xl font-semibold" data-testid="text-resume-filename">{p.filename}</p>
        </div>
        <Link href="/practice" className="inline-flex w-fit items-center gap-2 rounded-full bg-sidebar-primary px-4 py-2 text-sm font-semibold text-sidebar-primary-foreground" data-testid="link-practice-from-resume">
          Practice with this <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
      <div className="rise rise-1 rounded-3xl border bg-card p-6">
        <h3 className="mb-4 flex items-center gap-2 font-semibold"><Wrench className="h-4 w-4 text-primary" /> Skills <span className="font-mono text-xs text-muted-foreground">{p.skills.length}</span></h3>
        {p.skills.length ? (
          <div className="flex flex-wrap gap-2">
            {p.skills.map((s, i) => <span key={s + i} className="rounded-full border bg-secondary px-3 py-1 text-sm transition hover:-translate-y-0.5 hover:border-primary/40" data-testid={`tag-skill-${i}`}>{s}</span>)}
          </div>
        ) : <p className="text-sm text-muted-foreground">No skills were detected in this file.</p>}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {SECTIONS.map(({ key, label, icon: Icon }, i) => (
          <div key={key} className={`rise rise-${i + 1} rounded-3xl border bg-card p-6`}>
            <h3 className="mb-4 flex items-center gap-2 font-semibold"><Icon className="h-4 w-4 text-primary" /> {label} <span className="font-mono text-xs text-muted-foreground">{p[key].length}</span></h3>
            {p[key].length ? (
              <ul className="space-y-3">
                {p[key].map((item, j) => <li key={j} className="border-l-2 border-accent pl-3 text-sm leading-relaxed" data-testid={`text-${key}-${j}`}>{item}</li>)}
              </ul>
            ) : <p className="text-sm text-muted-foreground">Nothing detected.</p>}
          </div>
        ))}
      </div>
      <Uploader compact />
    </div>
  );
}

export default function ResumePage() {
  return (
    <div>
      <PageHeader kicker="Source material" title="Your resume, read closely" />
      <RequireAuth what="upload your resume and generate questions from it"><ProfileView /></RequireAuth>
    </div>
  );
}

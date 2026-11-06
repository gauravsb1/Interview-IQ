import { useEffect, useState } from "react";
import { PageHeader } from "@/components/bits";
import { PostureCoach } from "@/components/posture-coach";
import { Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";

const PHASES = [
  { label: "Breathe in", secs: 4 },
  { label: "Hold", secs: 2 },
  { label: "Breathe out", secs: 6 },
];

function Breather() {
  const [on, setOn] = useState(false);
  const [i, setI] = useState(0);
  const [left, setLeft] = useState(PHASES[0].secs);
  useEffect(() => {
    if (!on) return;
    const t = window.setInterval(() => {
      setLeft((l) => {
        if (l > 1) return l - 1;
        setI((x) => { const n = (x + 1) % PHASES.length; setLeft(PHASES[n].secs); return n; });
        return l;
      });
    }, 1000);
    return () => window.clearInterval(t);
  }, [on]);
  const p = PHASES[i];
  const scale = !on ? 0.7 : i === 0 ? 1 : i === 1 ? 1 : 0.62;
  return (
    <div className="flex flex-col items-center rounded-3xl bg-sidebar p-8 text-sidebar-foreground">
      <div className="relative flex h-56 w-56 items-center justify-center">
        <div className="absolute inset-0 rounded-full border border-sidebar-primary/20" />
        <div className="absolute inset-0 rounded-full bg-sidebar-primary/25" style={{ transform: `scale(${scale})`, transition: `transform ${on ? p.secs : 0.6}s ease-in-out` }} />
        <div className="relative text-center">
          <p className="font-display text-2xl font-semibold" data-testid="text-breath-phase">{on ? p.label : "Ready"}</p>
          {on && <p className="font-mono text-sm text-sidebar-foreground/60">{left}</p>}
        </div>
      </div>
      <button onClick={() => { setOn(!on); setI(0); setLeft(PHASES[0].secs); }} className="mt-6 inline-flex items-center gap-2 rounded-full bg-sidebar-primary px-5 py-2.5 text-sm font-semibold text-sidebar-primary-foreground" data-testid="button-breathe">
        {on ? <><Pause className="h-4 w-4" /> Stop</> : <><Play className="h-4 w-4" /> Start 4-2-6 breathing</>}
      </button>
      <p className="mt-3 max-w-xs text-center text-xs text-sidebar-foreground/60">A longer exhale is a common pacing technique before speaking. Stop if you feel lightheaded.</p>
    </div>
  );
}

const STAR = [
  { l: "S", t: "Situation", d: "One or two sentences of context. Team size, stakes, timeline.", ex: "Our checkout service was timing out for 3% of orders during a sale week." },
  { l: "T", t: "Task", d: "What specifically was yours to own.", ex: "I owned finding the cause and shipping a fix before the weekend peak." },
  { l: "A", t: "Action", d: "The bulk of your answer. Use \"I\", name tools and trade-offs.", ex: "I traced it to a lock on the inventory table, moved reads to a replica and added a queue." },
  { l: "R", t: "Result", d: "Quantify, then reflect on what you'd repeat.", ex: "Timeouts fell to 0.1% and we used the pattern for two more services." },
];

export default function CoachingPage() {
  const [active, setActive] = useState(0);
  return (
    <div>
      <PageHeader kicker="Before you speak" title="Practical coaching" />
      <p className="rise -mt-4 mb-8 max-w-2xl text-sm text-muted-foreground">Techniques for pacing, structure and on-camera presence. This is practical guidance, not medical or psychological advice, and nothing here diagnoses or measures how you feel.</p>
      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        <Breather />
        <div className="rounded-3xl border bg-card p-6">
          <h2 className="font-display text-xl font-semibold">Structure with STAR</h2>
          <div className="mt-5 flex gap-2">
            {STAR.map((s, i) => (
              <button key={s.l} onClick={() => setActive(i)} className={cn("flex h-12 w-12 items-center justify-center rounded-xl font-display text-xl font-semibold transition", active === i ? "bg-primary text-primary-foreground" : "bg-secondary hover:bg-muted")} data-testid={`button-star-${s.l}`}>{s.l}</button>
            ))}
          </div>
          <div key={active} className="rise mt-5">
            <p className="font-semibold">{STAR[active].t}</p>
            <p className="mt-1 text-sm text-muted-foreground">{STAR[active].d}</p>
            <p className="mt-4 border-l-2 border-accent pl-4 text-sm italic">"{STAR[active].ex}"</p>
          </div>
          <ul className="mt-6 space-y-2 border-t pt-5 text-sm text-muted-foreground">
            <li>Aim for 90 seconds to 2 minutes per behavioral answer.</li>
            <li>Pause instead of filling silence with "um"; a one-second pause reads as thoughtful.</li>
            <li>Pick stories from your resume you can defend at three levels of detail.</li>
          </ul>
        </div>
      </div>
      <section className="mt-12">
        <h2 className="font-display text-2xl font-semibold">Camera presence check</h2>
        <p className="mb-5 mt-1 text-sm text-muted-foreground">Optional. Checks whether you face the lens and sit level in frame.</p>
        <PostureCoach />
      </section>
    </div>
  );
}

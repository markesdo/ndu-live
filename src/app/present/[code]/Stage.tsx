"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, LayoutGroup, MotionConfig, motion, useReducedMotion } from "motion/react";
import { STEPS, courseUrl } from "@/lib/steps";
import { stripNames, type Spotlight, type Thema } from "@/lib/ai-shared";
import type { Answer, Participant, Reaction } from "@/lib/useSession";
import Lobby from "./Lobby";
import Poll, { Pool } from "./Poll";
import { IdeaWall, SpotlightView, type SpotState } from "./Ideas";
import Finale from "./Finale";
import { LivePill, T } from "./parts";

export type StageAi = {
  spotlight: (text: string) => Promise<Spotlight | null>;
  themen: (ideen: { id: string; text: string }[]) => Promise<Thema[] | null>;
};

type Props = {
  code: string; step: number; participants: Participant[]; answers: Answer[]; reactions: Reaction[];
  live: boolean; reconnecting: boolean;
  go: (next: number) => void; onReset: () => void; onUnlock?: () => void;
  dialogOpen: boolean; ai: StageAi; children?: React.ReactNode;
};

// Zwischenzustände nur auf der Leinwand (Pointe, Spotlight, Themen, Kurs-Hinweis). Sie gehören zu
// einem Schritt und verfallen beim Weiterblättern – die Handys sehen davon nichts.
type Sub = { step: number; punch: boolean; spot: string | null; hook: boolean; themen: Thema[] | null };
const fresh = (step: number): Sub => ({ step, punch: false, spot: null, hook: false, themen: null });

export default function Stage(props: Props) {
  const { code, step, participants, answers, reactions, live, reconnecting, go, onReset, onUnlock, dialogOpen, ai, children } = props;
  const reduce = useReducedMotion();
  const [origin, setOrigin] = useState("");
  const [host, setHost] = useState("localhost");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOrigin(window.location.origin);
    setHost(window.location.hostname);
  }, []);

  const current = STEPS[step] ?? STEPS[0];
  const [subRaw, setSub] = useState<Sub>(() => fresh(step));
  const sub = subRaw.step === step ? subRaw : fresh(step);
  const patch = (p: Partial<Sub>) => setSub({ ...sub, ...p });

  const ideas = useMemo(() => answers.filter((a) => a.step === step && current.kind === "text"), [answers, step, current.kind]);
  const allIdeas = answers.filter((a) => STEPS[a.step]?.kind === "text").length;
  const names = participants.map((p) => p.name);

  // KI: Ergebnis pro Idee merken, pro Route höchstens eine Anfrage gleichzeitig, nie blockierend.
  const [spots, setSpots] = useState<Record<string, SpotState>>({});
  const spotBusy = useRef(false);
  const [themenNote, setThemenNote] = useState<string | null>(null);
  const themenBusy = useRef(false);

  function openSpot(id: string) {
    patch({ spot: id });
    if (spots[id] || spotBusy.current) return;
    const idea = answers.find((a) => a.id === id);
    if (!idea) return;
    spotBusy.current = true;
    setSpots((s) => ({ ...s, [id]: { status: "loading" } }));
    ai.spotlight(stripNames(idea.value, names))
      .catch(() => null)
      .then((data) => setSpots((s) => ({ ...s, [id]: data ? { status: "ok", data } : { status: "off" } })))
      .finally(() => { spotBusy.current = false; });
  }

  function requestThemen() {
    if (current.kind !== "text" || themenBusy.current) return;
    if (sub.themen) { patch({ themen: null }); return; }
    if (ideas.length < 4) { flashNote("Für Themen braucht es mindestens vier Ideen."); return; }
    themenBusy.current = true;
    setThemenNote("Ordne Ideen …");
    const forStep = step;
    ai.themen(ideas.map((a) => ({ id: a.id, text: stripNames(a.value, names) })))
      .catch(() => null)
      .then((themen) => {
        if (themen) { setSub((s) => (s.step === forStep ? { ...s, themen } : s)); setThemenNote(null); }
        else flashNote("Themen gerade nicht verfügbar.");
      })
      .finally(() => { themenBusy.current = false; });
  }
  const noteTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  function flashNote(t: string) {
    setThemenNote(t);
    clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => setThemenNote(null), 3000);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (dialogOpen || e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key;
      if (k === "Escape") { if (sub.spot) patch({ spot: null }); else if (sub.hook) patch({ hook: false }); return; }
      if (k === "ArrowRight" || k === " ") {
        e.preventDefault();
        if (sub.spot) return patch({ spot: null });
        if (current.kind === "poll" && current.punchline && !sub.punch) return patch({ punch: true });
        if (current.kind === "finale" && !sub.hook) return patch({ hook: true });
        return go(step + 1);
      }
      if (k === "ArrowLeft") {
        if (sub.spot) return patch({ spot: null });
        if (sub.hook) return patch({ hook: false });
        if (sub.punch) return patch({ punch: false });
        return go(step - 1);
      }
      if ((k === "h" || k === "H") && current.kind === "finale") return patch({ hook: !sub.hook });
      if ((k === "t" || k === "T") && current.kind === "text") return requestThemen();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const joinUrl = `${origin}/join/${code}`;
  const spotIdea = sub.spot ? answers.find((a) => a.id === sub.spot) : undefined;
  const mood = current.kind === "poll" ? (current.punchline ? "poll2" : "poll") : current.kind;

  return (
    <MotionConfig reducedMotion="user">
      <main data-mood={mood} className="stage relative flex min-h-screen flex-col overflow-hidden px-[4vw] py-[3vh]">
        <header className="relative z-10 flex items-center justify-between">
          <span className={`${T.meta} uppercase tracking-[0.14em] text-muted`}>NDU Coding 2026 · Live</span>
          <span className="flex items-center gap-4">
            <LivePill count={participants.length} live={live} reconnecting={reconnecting} />
            {current.kind !== "lobby" && <span className={`${T.meta} text-muted`}>{joinUrl.replace(/^https?:\/\//, "")}</span>}
          </span>
        </header>

        <LayoutGroup>
          <section className="relative z-10 flex flex-1 items-center py-[3vh]">
            <AnimatePresence mode="wait">
              <motion.div key={step} initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -30 }}
                transition={{ duration: 0.35, ease: [0.2, 0, 0, 1] }} className="w-full">
                {current.kind === "lobby" && <Lobby participants={participants} joinUrl={joinUrl} showQr={!!origin} />}
                {current.kind === "poll" && (
                  <Poll step={step} title={current.title} options={current.options} participants={participants} answers={answers}
                    punchline={current.punchline} showPunchline={sub.punch} />
                )}
                {current.kind === "text" && (
                  <IdeaWall title={current.title} ideas={ideas} participants={participants} spotlightId={sub.spot}
                    onSpotlight={openSpot} themen={sub.themen} themenNote={themenNote} />
                )}
                {current.kind === "finale" && <Finale title={current.title} ideas={allIdeas} hook={sub.hook} courseUrl={courseUrl(host)} />}
              </motion.div>
            </AnimatePresence>
          </section>
          {/* Bei der Pointe tritt der Wartebereich zurück – sonst rutscht er bei 1080 px aus dem Bild. */}
          {current.kind === "poll" && !sub.punch && <div className="relative z-10"><Pool key={step} step={step} participants={participants} answers={answers} /></div>}
          <AnimatePresence>
            {spotIdea && (
              <SpotlightView key="spot" idea={spotIdea} author={participants.find((p) => p.id === spotIdea.participant_id)}
                spot={spots[spotIdea.id] ?? { status: "loading" }} onClose={() => patch({ spot: null })} />
            )}
          </AnimatePresence>
        </LayoutGroup>

        {/* Reaktionen steigen auf: nur transform/opacity, höchstens 25 gleichzeitig, bei reduzierter Bewegung aus */}
        {/* Container immer rendern (sonst weicht das Server-HTML ab), bei reduzierter Bewegung bleibt er leer. */}
        <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden" aria-hidden>
            <AnimatePresence>
              {(reduce ? [] : reactions.slice(-25)).map((r) => {
                const seed = spread(r.id);
                return (
                  <motion.span key={r.id} className="absolute bottom-0 text-[clamp(40px,3.6vw,72px)]" style={{ left: `${(seed % 90) + 5}vw` }}
                    initial={{ opacity: 1, y: 0, x: 0 }} animate={{ opacity: 0, y: "-105vh", x: (seed % 41) - 20 }} transition={{ duration: 3.5, ease: "easeOut" }}>
                    {r.emoji}
                  </motion.span>
                );
              })}
            </AnimatePresence>
        </div>

        {/* Steuerung (dezent) */}
        <footer className="relative z-10 flex items-center justify-between text-sm text-muted opacity-40 transition hover:opacity-100">
          <span>{step + 1} / {STEPS.length} · ← → zum Blättern{current.kind === "text" ? " · Karte anklicken = Spotlight · T = Themen" : ""}{current.kind === "finale" ? " · H = Kurs-Website" : ""}</span>
          <span className="flex gap-2">
            {onUnlock && <button onClick={onUnlock} className="rounded-lg border border-accent px-3 py-1 text-accent">Steuerung freischalten</button>}
            {current.kind === "text" && <button onClick={requestThemen} className="rounded-lg border border-border px-3 py-1">Themen</button>}
            {current.kind === "finale" && <button onClick={() => patch({ hook: !sub.hook })} className="rounded-lg border border-border px-3 py-1">Kurs-Website</button>}
            <button onClick={() => go(step - 1)} className="rounded-lg border border-border px-3 py-1">Zurück</button>
            <button onClick={() => go(step + 1)} className="rounded-lg border border-border px-3 py-1">Weiter</button>
            <button onClick={onReset} className="rounded-lg border border-border px-3 py-1">Reset</button>
          </span>
        </footer>
        {children}
      </main>
    </MotionConfig>
  );
}

// Gleichmäßige Streuung der Reaktionen über die Breite, unabhängig vom Aufbau der ID.
function spread(id: string) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}

"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, LayoutGroup, MotionConfig, motion, useReducedMotion } from "motion/react";
import { STEPS, courseUrl, projectorCourseUrl } from "@/lib/steps";
import { stripNames, type Spotlight, type Thema } from "@/lib/ai-shared";
import { doneSpot, ideaTextForAi, requestSpot, type SpotQueue } from "@/lib/spot-queue";
import { hash } from "@/lib/avatar";
import { useFlash } from "@/lib/useFlash";
import { answeredCount, pollAdvance, revealed } from "@/lib/poll-small";
import type { Answer, Participant, Reaction } from "@/lib/useSession";
import { TokensStage } from "./EnergyMeter";
import Lobby from "./Lobby";
import Swarm from "./Swarm";
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
  preview?: boolean; // nur Vorschau: Token-Spiel mit erfundenen Tipps, ohne Netz
};

// Zwischenzustände nur auf der Leinwand (Auflösung, Pointe, Spotlight, Themen, Kurs-Hinweis). Sie gehören zu
// einem Schritt und verfallen beim Weiterblättern – die Handys sehen davon nichts.
// `reveal`: kleine Umfrage früher aufgelöst, bevor alle geantwortet haben (src/lib/poll-small.ts).
type Sub = { step: number; reveal: boolean; punch: boolean; spot: string | null; hook: boolean; themen: Thema[] | null };
const fresh = (step: number): Sub => ({ step, reveal: false, punch: false, spot: null, hook: false, themen: null });

export default function Stage(props: Props) {
  const { code, step, participants, answers, reactions, live, reconnecting, go, onReset, onUnlock, dialogOpen, ai, children, preview } = props;
  const reduce = useReducedMotion();
  const [origin, setOrigin] = useState("");
  const [host, setHost] = useState("localhost");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOrigin(window.location.origin);
    setHost(window.location.hostname);
  }, []);

  const current = STEPS[step] ?? STEPS[0];
  const stepRef = useRef(step);
  useEffect(() => { stepRef.current = step; }, [step]);
  const [subRaw, setSub] = useState<Sub>(() => fresh(step));
  const sub = subRaw.step === step ? subRaw : fresh(step);
  const patch = (p: Partial<Sub>) => setSub({ ...sub, ...p });

  const ideas = useMemo(() => answers.filter((a) => a.step === step && current.kind === "text"), [answers, step, current.kind]);
  const allIdeas = answers.filter((a) => STEPS[a.step]?.kind === "text").length;
  const names = participants.map((p) => p.name);
  const answered = answeredCount(answers, participants.map((p) => p.id), step);
  const pollShown = current.kind !== "poll" || revealed(answered, participants.length, sub.reveal);

  // → und „Weiter“ gehen denselben Weg: Spotlight schließen, Umfrage auflösen, Pointe, Kurs-Hinweis, nächster Schritt.
  function advance() {
    if (sub.spot) return patch({ spot: null });
    if (current.kind === "poll") {
      const next = pollAdvance(pollShown, !!current.punchline, sub.punch);
      if (next === "reveal") return patch({ reveal: true });
      if (next === "punch") return patch({ punch: true });
    }
    if (current.kind === "finale" && !sub.hook && courseUrl(host)) return patch({ hook: true });
    go(step + 1);
  }

  // KI: Ergebnis pro Idee merken, pro Route höchstens eine Anfrage gleichzeitig, nie blockierend.
  const [spots, setSpotsState] = useState<Record<string, SpotState>>({});
  const note = useFlash(3000);
  const themenBusy = useRef(false);

  // Spotlight-Warteschlange (src/lib/spot-queue.ts): eine Anfrage läuft, dahinter ein Platz für die
  // zuletzt geöffnete Idee. Verdrängte Ideen gehen zurück auf „unbekannt“ und laden beim nächsten
  // Öffnen neu. Ideen, Namen und der KI-Zugang (Key) kommen aus Refs – also aus dem Stand beim Senden.
  const queue = useRef<SpotQueue>({ busy: null, wanted: null });
  // spotsRef ist die eine Quelle der Wahrheit für Entscheidungen; React-State nur zum Anzeigen.
  const spotsRef = useRef(spots);
  const updateSpots = (fn: (s: Record<string, SpotState>) => Record<string, SpotState>) => {
    spotsRef.current = fn(spotsRef.current);
    setSpotsState(spotsRef.current);
  };
  const answersRef = useRef(answers);
  const peopleRef = useRef(participants);
  const aiRef = useRef(ai);
  useEffect(() => { answersRef.current = answers; peopleRef.current = participants; aiRef.current = ai; });
  const forget = (id: string) => updateSpots((s) => { const n = { ...s }; delete n[id]; return n; });
  function startSpot(id: string) {
    const text = ideaTextForAi(id, answersRef.current, peopleRef.current);
    if (text === null) { forget(id); finishSpot(); return; }
    aiRef.current.spotlight(text)
      .catch(() => null)
      .then((data) => updateSpots((s) => ({ ...s, [id]: data ? { status: "ok", data } : { status: "off" } })))
      .finally(finishSpot);
  }
  function finishSpot() {
    const { q, start } = doneSpot(queue.current);
    queue.current = q;
    if (start) startSpot(start);
  }
  function fetchSpot(id: string) {
    // Bekannt und nicht „off“ (lädt gerade, wartet oder fertig) → nichts tun. „off“ wird erneut versucht.
    const known = spotsRef.current[id];
    if (known && known.status !== "off") return;
    const { q, start, dropped } = requestSpot(queue.current, id);
    queue.current = q;
    if (dropped) forget(dropped);
    updateSpots((s) => ({ ...s, [id]: { status: "loading" } }));
    if (start) startSpot(start);
  }
  function openSpot(id: string) {
    patch({ spot: id });
    fetchSpot(id);
  }

  function requestThemen() {
    if (current.kind !== "text" || themenBusy.current) return;
    if (sub.themen) { patch({ themen: null }); return; }
    if (ideas.length < 4) { note.flash("Für Themen braucht es mindestens vier Ideen."); return; }
    themenBusy.current = true;
    note.set("Ordne Ideen …");
    const forStep = step;
    ai.themen(ideas.map((a) => ({ id: a.id, text: stripNames(a.value, names) })))
      .catch(() => null)
      .then((themen) => {
        // Gespeicherter Zustand kann noch zum vorigen Schritt gehören (nichts hat ihn hier geändert) – dann frisch beginnen.
        if (themen) { setSub((s) => (stepRef.current !== forStep ? s : { ...(s.step === forStep ? s : fresh(forStep)), themen })); note.set(null); }
        else note.flash("Themen gerade nicht verfügbar.");
      })
      .finally(() => { themenBusy.current = false; });
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (dialogOpen || e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key;
      if (k === "Escape") { if (sub.spot) patch({ spot: null }); else if (sub.hook) patch({ hook: false }); return; }
      if (k === "ArrowRight" || k === " ") {
        e.preventDefault();
        return advance();
      }
      if (k === "ArrowLeft") {
        if (sub.spot) return patch({ spot: null });
        if (sub.hook) return patch({ hook: false });
        if (sub.punch) return patch({ punch: false });
        if (sub.reveal && !revealed(answered, participants.length, false)) return patch({ reveal: false });
        return go(step - 1);
      }
      if ((k === "h" || k === "H") && current.kind === "finale") return patch({ hook: !sub.hook });
      if (k === "Enter" && sub.hook && courseUrl(host)) { e.preventDefault(); window.location.href = projectorCourseUrl(courseUrl(host)!); return; }
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
        {/* Lobby-Spiel „Schwarm“: Canvas über die ganze Bühne, hinter dem Text; baut sich beim Weiterblättern ab. */}
        {current.kind === "lobby" && <Swarm code={code} participants={participants} preview={!!preview} avoidSelector="[data-swarm-meiden]" />}
        <header data-swarm-meiden className="relative z-10 flex items-center justify-between">
          <span className={`${T.meta} uppercase tracking-[0.14em] text-muted`}>NDU Coding 2026 · Live</span>
          <span className="flex items-center gap-4">
            <LivePill count={participants.length} live={live} reconnecting={reconnecting} />
            {current.kind !== "lobby" && <span className={`${T.meta} text-muted`}>{joinUrl.replace(/^https?:\/\//, "")}</span>}
          </span>
        </header>

        <LayoutGroup>
          <section className={`relative z-10 flex flex-1 py-[3vh] ${current.kind === "lobby" && participants.length > 0 ? "items-start" : "items-center"}`}>
            <AnimatePresence mode="wait">
              <motion.div key={step} initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -30 }}
                transition={{ duration: 0.35, ease: [0.2, 0, 0, 1] }} className="w-full">
                {current.kind === "lobby" && <Lobby participants={participants} joinUrl={joinUrl} showQr={!!origin} />}
                {current.kind === "tokens" && <TokensStage code={code} title={current.title} hint={current.hint} participants={participants} preview={!!preview} />}
                {current.kind === "poll" && (
                  <Poll step={step} title={current.title} options={current.options} participants={participants} answers={answers}
                    punchline={current.punchline} showPunchline={sub.punch} revealed={pollShown} />
                )}
                {current.kind === "text" && (
                  <IdeaWall title={current.title} ideas={ideas} participants={participants} spotlightId={sub.spot}
                    onSpotlight={openSpot} themen={sub.themen} themenNote={note.message} />
                )}
                {current.kind === "finale" && <Finale title={current.title} ideas={allIdeas} hook={sub.hook && !!courseUrl(host)} courseUrl={courseUrl(host) ?? ""} />}
              </motion.div>
            </AnimatePresence>
          </section>
          {/* Bei der Pointe tritt der Wartebereich zurück – sonst rutscht er bei 1080 px aus dem Bild. */}
          {current.kind === "poll" && !sub.punch && <div className="relative z-10"><Pool key={step} step={step} participants={participants} answers={answers} revealed={pollShown} /></div>}
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
                const seed = hash(r.id); // gleichmäßige Streuung über die Breite
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
        <footer data-swarm-meiden className="relative z-10 flex items-center justify-between text-sm text-muted opacity-40 transition hover:opacity-100">
          <span>{step + 1} / {STEPS.length} · ← → zum Blättern{current.kind === "text" ? " · Karte anklicken = Spotlight · T = Themen" : ""}{current.kind === "finale" ? " · H = Kurs-Website" : ""}</span>
          <span className="flex gap-2">
            {onUnlock && <button onClick={onUnlock} className="rounded-lg border border-accent px-3 py-1 text-accent">Steuerung freischalten</button>}
            {current.kind === "text" && <button onClick={requestThemen} className="rounded-lg border border-border px-3 py-1">Themen</button>}
            {current.kind === "finale" && courseUrl(host) && <button onClick={() => patch({ hook: !sub.hook })} className="rounded-lg border border-border px-3 py-1">Kurs-Website</button>}
            <button onClick={() => go(step - 1)} className="rounded-lg border border-border px-3 py-1">Zurück</button>
            <button onClick={advance} className="rounded-lg border border-border px-3 py-1">Weiter</button>
            <button onClick={onReset} className="rounded-lg border border-border px-3 py-1">Reset</button>
          </span>
        </footer>
        {children}
      </main>
    </MotionConfig>
  );
}


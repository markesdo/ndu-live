"use client";
import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { Spotlight, Thema } from "@/lib/ai-shared";
import type { Answer, Participant } from "@/lib/useSession";
import { ARRIVE, ARRIVE_FROM, ARRIVE_TO, Glyph, T, stagger } from "./parts";

export type SpotState = { status: "loading" | "ok" | "off"; data?: Spotlight };

type WallProps = {
  title: string; ideas: Answer[]; participants: Participant[];
  spotlightId: string | null; onSpotlight: (id: string) => void;
  themen: Thema[] | null; themenNote: string | null;
};

// Freitext-Wand: Karten kommen an; ein Klick holt eine Idee ins Spotlight; „T“ ordnet sie in Themen.
export function IdeaWall({ title, ideas, participants, spotlightId, onSpotlight, themen, themenNote }: WallProps) {
  const byId = new Map(participants.map((p) => [p.id, p]));
  // Ideen, die nach dem Gruppieren dazukamen (oder über dem Limit lagen), fallen nicht weg: eigene Spalte.
  const groups = themen ? withNewcomers(themen, ideas) : null;
  const card = (a: Answer, i: number, n: number) => (
    <IdeaCard key={a.id} a={a} p={byId.get(a.participant_id)} i={i} n={n} hidden={a.id === spotlightId} onClick={() => onSpotlight(a.id)} />
  );
  return (
    <div>
      <h1 className={`mb-[4vh] ${T.h2}`}>{title}</h1>
      {ideas.length === 0 && <p className={`${T.option} text-muted`}>Tippt auf euren Handys …</p>}
      {groups ? (
        // Themen-Ansicht unter Last (bis 6 Themen + „Neu dazu“, ~25 Ideen): kompakte Chips, Spalten nach
        // Anzahl der Gruppen, pro Gruppe höchstens so viele Chips, wie in die Höhe passen – der Rest als „+N“.
        <div className="grid gap-x-[2vw] gap-y-[2.4vh]" style={{ gridTemplateColumns: `repeat(${themenCols(groups.length)}, minmax(0, 1fr))` }}>
          {groups.map((t, ti) => {
            const members = t.ids.map((id) => ideas.find((a) => a.id === id)).filter((a): a is Answer => !!a);
            const max = themenRows(groups.length) === 1 ? 6 : 3;
            const shown = members.slice(0, members.length > max ? max - 1 : max);
            const rest = members.length - shown.length;
            return (
              <motion.div key={`${ti}-${t.titel}`} data-thema initial={ARRIVE_FROM} animate={ARRIVE_TO} transition={{ ...ARRIVE, delay: stagger(ti, groups.length) }}>
                <h2 className={`mb-[1.2vh] ${T.meta} uppercase tracking-[0.12em] text-accent`}>{t.titel} · {members.length}</h2>
                <div className="flex flex-col gap-[0.9vh]">
                  {shown.map((a, i) => <IdeaChip key={a.id} a={a} i={i} n={shown.length} hidden={a.id === spotlightId} onClick={() => onSpotlight(a.id)} />)}
                  {rest > 0 && <p data-mehr className={`${T.meta} text-muted`}>+{rest} weitere</p>}
                </div>
              </motion.div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-wrap gap-[1.2vw]">{ideas.map((a, i) => card(a, i, ideas.length))}</div>
      )}
      <AnimatePresence>
        {themenNote && (
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={`mt-6 ${T.meta} text-muted`}>{themenNote}</motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

function IdeaCard({ a, p, i, n, hidden, onClick }: { a: Answer; p?: Participant; i: number; n: number; hidden: boolean; onClick: () => void }) {
  return (
    <motion.button type="button" layoutId={`card-${a.id}`} onClick={onClick}
      initial={{ opacity: 0, y: 40, scale: 0.85 }} animate={{ opacity: hidden ? 0 : 1, y: 0, scale: 1 }} transition={{ ...ARRIVE, delay: stagger(i, n) }}
      style={{ rotate: ((i * 7) % 5) - 2 }}
      aria-label={`Idee ins Spotlight: ${a.value}`}
      data-idee
      className="max-w-[26vw] cursor-pointer rounded-2xl border border-border bg-card px-[clamp(12px,1.2vw,20px)] py-[clamp(8px,1.4vh,16px)] text-left shadow-lg hover:border-accent">
      <p className="text-[clamp(16px,min(1.7vw,2.8vh),32px)] leading-snug">„{a.value}“</p>
      {p && <p className={`mt-3 flex items-center gap-2 ${T.meta} text-muted`}><Glyph p={p} size="sm" /> {p.name}</p>}
    </motion.button>
  );
}

// Kompakte Idee in der Themen-Ansicht: nur der Text, höchstens zwei Zeilen. Gleiche layoutId wie die
// Karte, damit sie beim Gruppieren dorthin wandert und das Spotlight weiter funktioniert.
function IdeaChip({ a, i, n, hidden, onClick }: { a: Answer; i: number; n: number; hidden: boolean; onClick: () => void }) {
  return (
    <motion.button type="button" layoutId={`card-${a.id}`} onClick={onClick} data-idee
      initial={{ opacity: 0, y: 24 }} animate={{ opacity: hidden ? 0 : 1, y: 0 }} transition={{ ...ARRIVE, delay: stagger(i, n) }}
      aria-label={`Idee ins Spotlight: ${a.value}`}
      className="cursor-pointer rounded-xl border border-border bg-card px-[clamp(10px,0.9vw,16px)] py-[clamp(6px,0.9vh,12px)] text-left hover:border-accent">
      <p className="line-clamp-2 text-[clamp(14px,min(1.15vw,2vh),24px)] leading-snug">„{a.value}“</p>
    </motion.button>
  );
}

// Spalten und Zeilen der Themen-Ansicht: bis 4 Gruppen nebeneinander, darüber zwei Reihen.
export const themenCols = (n: number) => (n <= 4 ? n : Math.ceil(n / 2));
export const themenRows = (n: number) => Math.ceil(n / themenCols(n));

// Spotlight: Die Karte wandert in die Mitte, darunter wird sie zum Prompt für Claude Code.
export function SpotlightView({ idea, author, spot, onClose }: { idea: Answer; author?: Participant; spot: SpotState; onClose: () => void }) {
  return (
    <motion.div className="fixed inset-0 z-30 grid place-items-center px-[6vw]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div className="absolute inset-0 bg-black/70" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} />
      <div className="relative w-full max-w-[1200px]">
        <motion.div layoutId={`card-${idea.id}`} transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="mb-[3vh] rounded-3xl border border-border bg-card px-[3vw] py-[3vh] shadow-2xl">
          <p className="font-display text-[clamp(36px,3.8vw,72px)] font-extrabold leading-[1.1] tracking-[-0.02em]">„{idea.value}“</p>
          {author && <p className={`mt-4 flex items-center gap-3 ${T.meta} text-muted`}><Glyph p={author} size="sm" /> {author.name}</p>}
        </motion.div>

        <motion.div initial={ARRIVE_FROM} animate={ARRIVE_TO} transition={{ ...ARRIVE, delay: 0.25 }}
          className="rounded-2xl border border-accent bg-card-2 px-[2.4vw] py-[2.4vh] font-mono text-[clamp(18px,1.6vw,30px)] leading-relaxed">
          <p className="mb-3 text-muted">Das ist schon eine Spezifikation. Mehr braucht Claude Code nicht.</p>
          <p><span className="text-accent">claude ›</span> <TypeLine text={`Bau mir: ${idea.value}`} delay={0.5} caret={spot.status !== "ok"} /></p>
          {spot.status === "loading" && <p className="mt-3 flex items-center gap-3 text-muted">Claude schreibt die Spezifikation <Dots /></p>}
          {spot.status === "off" && <p className="mt-3 text-ok">Das reicht als Spec.</p>}
          {spot.status === "ok" && spot.data && (
            <div className="mt-4 space-y-2">
              <p className="text-fg"><TypeLine text={spot.data.pitch} /></p>
              {spot.data.kriterien.map((k, i) => (
                <p key={i} className="flex gap-3 text-[clamp(16px,1.3vw,24px)] text-muted">
                  <span className="text-ok">✓</span><TypeLine text={k} delay={0.6 + i * 0.5} caret={i === 2} />
                </p>
              ))}
            </div>
          )}
        </motion.div>
      </div>
    </motion.div>
  );
}

// Text, der wie getippt erscheint. Bei reduzierter Bewegung steht er sofort da.
function TypeLine({ text, delay = 0, caret = false }: { text: string; delay?: number; caret?: boolean }) {
  const reduce = useReducedMotion();
  const [n, setN] = useState(0);
  useEffect(() => {
    if (reduce) return;
    let i = 0;
    let iv: ReturnType<typeof setInterval> | undefined;
    const t = setTimeout(() => {
      iv = setInterval(() => { i += 2; setN(Math.min(i, text.length)); if (i >= text.length) clearInterval(iv); }, 22);
    }, delay * 1000);
    return () => { clearTimeout(t); clearInterval(iv); };
  }, [text, delay, reduce]);
  const shown = reduce ? text : text.slice(0, n);
  return (
    <span>
      {shown}
      {caret && <span className="caret ml-0.5 inline-block h-[1em] w-[0.55em] translate-y-[0.15em] bg-accent" aria-hidden />}
      <span className="sr-only">{text.slice(shown.length)}</span>
    </span>
  );
}

// Drei pulsierende Punkte, solange Claude schreibt
function Dots() {
  return (
    <span className="inline-flex gap-1.5" aria-hidden>
      {[0, 1, 2].map((i) => (
        <motion.span key={i} className="h-2 w-2 rounded-full bg-accent"
          animate={{ opacity: [0.25, 1, 0.25] }} transition={{ repeat: Infinity, duration: 1.1, delay: i * 0.18 }} />
      ))}
    </span>
  );
}

function withNewcomers(themen: Thema[], ideas: Answer[]): Thema[] {
  const placed = new Set(themen.flatMap((t) => t.ids));
  const rest = ideas.filter((a) => !placed.has(a.id)).map((a) => a.id);
  return rest.length ? [...themen, { titel: "Neu dazu", ids: rest }] : themen;
}

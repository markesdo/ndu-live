"use client";
import { AnimatePresence, motion } from "motion/react";
import type { Answer, Participant } from "@/lib/useSession";
import { ARRIVE, ARRIVE_FROM, ARRIVE_TO, FLY, Glyph, T } from "./parts";

// Ab dieser Zahl wird der Schwarm zu unruhig – dann ruhige Balken (nur transform, kein width).
export const SWARM_MAX = 48;

type Props = { step: number; title: string; options: string[]; participants: Participant[]; answers: Answer[]; punchline?: string; showPunchline: boolean };

// Umfrage als Einheiten-Diagramm: Jede Stimme ist ein Avatar, der aus dem Wartebereich in seine Zeile fliegt.
export default function Poll({ step, title, options, participants, answers, punchline, showPunchline }: Props) {
  const byId = new Map(participants.map((p) => [p.id, p]));
  const stepAnswers = answers.filter((a) => a.step === step && byId.has(a.participant_id));
  const total = stepAnswers.length;
  const swarm = participants.length <= SWARM_MAX;
  const counts = options.map((o) => stepAnswers.filter((a) => a.value === o).length);
  const lead = Math.max(...counts);
  const leadVisible = participants.length > 0 && total >= participants.length / 2 && lead > 0;

  return (
    <div>
      <h1 className={`mb-[4vh] ${T.h2}`}>{title}</h1>
      <div className="grid gap-[2.4vh]">
        {options.map((o, i) => {
          const voters = stepAnswers.filter((a) => a.value === o).map((a) => byId.get(a.participant_id)!);
          const n = counts[i];
          const pct = total ? Math.round((100 * n) / total) : 0;
          const leading = leadVisible && n === lead;
          return (
            <div key={o} className="grid grid-cols-[minmax(0,32vw)_1fr_auto] items-center gap-[2vw]">
              <span className={`${T.option} font-semibold leading-tight transition-colors duration-500 ${leading ? "text-accent" : ""}`}>{o}</span>
              {swarm ? (
                <div className="flex min-h-[clamp(40px,3.2vw,60px)] flex-wrap gap-2">
                  {voters.map((p) => (
                    <motion.span key={p.id} layoutId={`av-${step}-${p.id}`} transition={FLY}>
                      <Glyph p={p} />
                    </motion.span>
                  ))}
                </div>
              ) : (
                <div className="h-[clamp(20px,2vw,36px)] overflow-hidden rounded-full bg-card">
                  <motion.div className="h-full origin-left rounded-full bg-accent" initial={{ scaleX: 0 }}
                    animate={{ scaleX: total ? n / total : 0 }} transition={{ type: "spring", stiffness: 80, damping: 20 }} />
                </div>
              )}
              <span className={`${T.meta} text-right text-muted tabular-nums`}>{n} · {pct}%</span>
            </div>
          );
        })}
      </div>
      <p className={`mt-[4vh] ${T.meta} text-muted`}>{total} von {participants.length} haben geantwortet</p>
      <AnimatePresence>
        {punchline && showPunchline && (
          <motion.p initial={ARRIVE_FROM} animate={ARRIVE_TO} exit={{ opacity: 0 }} transition={ARRIVE}
            className="mt-[4vh] max-w-[70vw] font-display text-[clamp(36px,3.6vw,68px)] font-extrabold leading-[1.1] tracking-[-0.02em] text-accent-2">
            {punchline}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

// Wartebereich unten: alle, die noch nicht abgestimmt haben. Liegt außerhalb des Schritt-Wechsels,
// damit layoutId Wartebereich und Zeile verbinden kann.
export function Pool({ step, participants, answers }: { step: number; participants: Participant[]; answers: Answer[] }) {
  if (participants.length > SWARM_MAX) return null;
  const answered = new Set(answers.filter((a) => a.step === step).map((a) => a.participant_id));
  const waiting = participants.filter((p) => !answered.has(p.id));
  return (
    <div className="mt-[3vh] flex min-h-[clamp(48px,3.8vw,70px)] items-center gap-4 border-t border-border pt-[2vh]">
      <span className={`${T.meta} shrink-0 uppercase tracking-[0.12em] text-muted`}>{waiting.length ? "denkt noch" : "alle da"}</span>
      <div className="flex flex-wrap gap-2">
        {waiting.map((p) => (
          <motion.span key={p.id} layoutId={`av-${step}-${p.id}`} initial={ARRIVE_FROM} animate={ARRIVE_TO} transition={FLY}>
            <Glyph p={p} />
          </motion.span>
        ))}
      </div>
    </div>
  );
}

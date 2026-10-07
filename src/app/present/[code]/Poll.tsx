"use client";
import { AnimatePresence, motion } from "motion/react";
import type { Answer, Participant } from "@/lib/useSession";
import { countLabel, isSmall } from "@/lib/poll-small";
import { ARRIVE, ARRIVE_FROM, ARRIVE_TO, CountUp, FLY, Glyph, T } from "./parts";

// Ab dieser Zahl wird der Schwarm zu unruhig – dann ruhige Balken (nur transform, kein width).
export const SWARM_MAX = 48;

type Props = { step: number; title: string; options: string[]; participants: Participant[]; answers: Answer[]; punchline?: string; showPunchline: boolean; revealed: boolean };

// Kleine Gruppe: großer Avatar mit Namen darunter. Feste Breite, damit lange Namen sich nicht überlappen.
const NAMED_W = "w-[clamp(64px,min(6vw,10vh),120px)]";
const NAMED_H = "min-h-[clamp(74px,min(6.4vw,10.6vh),124px)]";
function Named({ p, dim = false }: { p: Participant; dim?: boolean }) {
  return (
    <span className={`flex ${NAMED_W} flex-col items-center gap-1 transition-opacity duration-500 ${dim ? "opacity-45" : ""}`}>
      <Glyph p={p} size="xl" done={dim} />
      <span className="w-full truncate text-center text-[clamp(12px,min(1vw,1.8vh),20px)] leading-tight text-muted">{p.name}</span>
    </span>
  );
}

// Umfrage als Einheiten-Diagramm: Jede Stimme ist ein Avatar, der aus dem Wartebereich in seine Zeile fliegt.
// Kleine Gruppe (bis 6): Namen, Zahlen statt Prozent, und erst nach der Auflösung (`revealed`) sichtbar,
// wer was gewählt hat – dann fliegen alle Avatare gleichzeitig (leicht versetzt) in ihre Zeilen.
export default function Poll({ step, title, options, participants, answers, punchline, showPunchline, revealed }: Props) {
  const byId = new Map(participants.map((p) => [p.id, p]));
  const stepAnswers = answers.filter((a) => a.step === step && byId.has(a.participant_id));
  const total = stepAnswers.length;
  const swarm = participants.length <= SWARM_MAX;
  const counts = options.map((o) => stepAnswers.filter((a) => a.value === o).length);
  const lead = Math.max(...counts);
  const small = isSmall(participants.length);
  const leadVisible = small ? revealed && lead > 0 : participants.length > 0 && total >= participants.length / 2 && lead > 0;
  // Reihenfolge der Ankunft beim Auflösen: Zeile für Zeile, 60 ms Abstand.
  const order = new Map(options.flatMap((o) => stepAnswers.filter((a) => a.value === o)).map((a, k) => [a.participant_id, k]));

  return (
    <div>
      <h1 className={`mb-[4vh] ${T.h2}`}>{title}</h1>
      <div className={`grid ${small ? "gap-[1.6vh]" : "gap-[2.4vh]"}`}>
        {options.map((o, i) => {
          const voters = stepAnswers.filter((a) => a.value === o).map((a) => byId.get(a.participant_id)!);
          const n = counts[i];
          const leading = leadVisible && n === lead;
          return (
            <div key={o} className="grid grid-cols-[minmax(0,32vw)_1fr_auto] items-center gap-[2vw]">
              <span className={`${T.option} font-semibold leading-tight transition-colors duration-500 ${leading ? "text-accent" : ""}`}>{o}</span>
              {small ? (
                <div className={`flex ${NAMED_H} flex-wrap items-start gap-[clamp(6px,0.8vw,14px)]`}>
                  {revealed && voters.map((p) => (
                    <motion.span key={p.id} layoutId={`av-${step}-${p.id}`} transition={{ ...FLY, delay: (order.get(p.id) ?? 0) * 0.06 }}>
                      <Named p={p} />
                    </motion.span>
                  ))}
                </div>
              ) : swarm ? (
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
              {small ? (
                <span className={`${T.option} min-w-[2ch] text-right font-semibold tabular-nums ${leading ? "text-accent" : "text-muted"}`}>
                  {revealed ? <CountUp to={n} delay={0.3} /> : ""}
                </span>
              ) : (
                <span className={`${T.meta} text-right text-muted tabular-nums`}>{countLabel(n, total, participants.length)}</span>
              )}
            </div>
          );
        })}
      </div>
      <p className={`${small ? "mt-[2.4vh]" : "mt-[4vh]"} ${T.meta} text-muted`}>{total} von {participants.length} haben geantwortet</p>
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
// damit layoutId Wartebereich und Zeile verbinden kann. Kleine Gruppe vor der Auflösung: Wer schon
// geantwortet hat, bleibt hier – gedimmt mit Haken, ohne die Wahl zu verraten.
export function Pool({ step, participants, answers, revealed }: { step: number; participants: Participant[]; answers: Answer[]; revealed: boolean }) {
  if (participants.length > SWARM_MAX) return null;
  const answered = new Set(answers.filter((a) => a.step === step).map((a) => a.participant_id));
  const waiting = participants.filter((p) => !answered.has(p.id));
  if (isSmall(participants.length)) {
    const shown = revealed ? waiting : participants;
    return (
      <div className="mt-[2vh] flex min-h-[clamp(74px,min(6.4vw,10.6vh),124px)] items-center gap-4 border-t border-border pt-[1.6vh]">
        <span className={`${T.meta} shrink-0 uppercase tracking-[0.12em] text-muted`}>{waiting.length ? "denkt noch" : "Alle haben geantwortet"}</span>
        <div className="flex flex-wrap gap-[clamp(6px,0.8vw,14px)]">
          {shown.map((p) => (
            <motion.span key={p.id} layoutId={`av-${step}-${p.id}`} initial={ARRIVE_FROM} animate={ARRIVE_TO} transition={FLY}>
              <Named p={p} dim={answered.has(p.id)} />
            </motion.span>
          ))}
        </div>
      </div>
    );
  }
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

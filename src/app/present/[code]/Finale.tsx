"use client";
import { AnimatePresence, motion } from "motion/react";
import { QRCodeSVG } from "qrcode.react";
import { STACK } from "@/lib/steps";
import { ARRIVE, ARRIVE_FROM, ARRIVE_TO, CountUp, T } from "./parts";

const TILES = [
  { n: STACK.minuten, label: "Minuten" },
  { n: STACK.zeilen, label: "Zeilen Code" },
  { n: STACK.commits, label: "Commits" },
  { n: 0, label: "selbst getippt", accent: true },
];

// Finale: die echten Zahlen dieser App zählen hoch. Mit „H“ wechselt die Leinwand zum Kurs.
export default function Finale({ title, ideas, hook, courseUrl }: { title: string; ideas: number; hook: boolean; courseUrl: string }) {
  return (
    <AnimatePresence mode="wait">
      {hook ? (
        <motion.div key="hook" initial={ARRIVE_FROM} animate={ARRIVE_TO} exit={{ opacity: 0 }} transition={ARRIVE}
          className="grid items-center gap-[5vw] lg:grid-cols-[1fr_auto]">
          <div>
            <h1 className={`mb-6 ${T.h1}`}>Tag 1 beginnt hier.</h1>
            <p className={`${T.option} text-muted`}>Die Kurs-Website – alles, was wir heute machen, steht dort.</p>
            <p className={`mt-6 ${T.meta} text-muted`}>{courseUrl.replace(/^https?:\/\//, "")}</p>
          </div>
          <div className="rounded-[48px] bg-white p-[clamp(16px,1.6vw,28px)] shadow-2xl ring-8 ring-blue/25">
            <QRCodeSVG value={courseUrl} size={360} level="M" className="h-[clamp(240px,24vw,420px)] w-[clamp(240px,24vw,420px)]" />
          </div>
        </motion.div>
      ) : (
        <motion.div key="stack" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center">
          <motion.h1 initial={ARRIVE_FROM} animate={ARRIVE_TO} transition={ARRIVE} className={`mx-auto mb-[6vh] max-w-[80vw] ${T.h1}`}>{title}</motion.h1>
          <div className="mx-auto grid max-w-[1500px] grid-cols-4 gap-[2vw]">
            {TILES.map((t, i) => (
              <motion.div key={t.label} initial={ARRIVE_FROM} animate={ARRIVE_TO} transition={{ ...ARRIVE, delay: 0.4 + i * 0.25 }}
                className="min-w-0 rounded-3xl border border-border bg-card px-4 py-[3vh]">
                <CountUp to={t.n} delay={0.5 + i * 0.25}
                  className={`block font-display text-[clamp(48px,5vw,112px)] font-extrabold leading-none tracking-[-0.03em] ${t.accent ? "text-ok" : ""}`} />
                <span className={`mt-3 block ${T.meta} uppercase tracking-[0.12em] text-muted`}>{t.label}</span>
              </motion.div>
            ))}
          </div>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.8 }} className={`mt-[5vh] ${T.meta} uppercase tracking-[0.12em] text-muted`}>
            Next.js · Supabase Realtime · Vercel · Claude Code
          </motion.p>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2.2 }} className={`mt-[3vh] ${T.option}`}>
            Am Ende dieser drei Tage baut ihr so etwas selbst.
            {ideas > 0 && <span className="text-muted"> Eure {ideas} {ideas === 1 ? "Idee ist" : "Ideen sind"} gespeichert.</span>}
          </motion.p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

"use client";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence } from "motion/react";
import { useSession } from "@/lib/useSession";
import { STEPS } from "@/lib/steps";
import { parseSpotlight, type Thema } from "@/lib/ai-shared";
import Stage, { type StageAi } from "./Stage";
import { Dialog, KeyDialog } from "./Dialogs";

export default function PresentClient({ code }: { code: string }) {
  const { step, participants, answers, reactions, error, live, reconnecting } = useSession(code);
  const [key, setKey] = useState("");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    try { setKey(localStorage.getItem("ndu-presenter-key") ?? ""); } catch {}
  }, []);

  // Steuer-Aktion, die auf den Key wartet: Der Dialog führt sie mit dem eingegebenen Key aus.
  const [pending, setPending] = useState<null | ((k: string) => Promise<Response>)>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const dialogOpen = pending !== null || confirmReset;

  const stepRequest = (next: number) => (k: string) =>
    fetch("/api/step", { method: "POST", body: JSON.stringify({ code, step: next, key: k }) });
  const resetRequest = (k: string) => fetch("/api/reset", { method: "POST", body: JSON.stringify({ code, key: k }) });

  async function run(action: (k: string) => Promise<Response>) {
    const res = await action(key).catch(() => null);
    if (res?.status === 401) setPending(() => action);
  }
  function go(next: number) {
    if (next < 0 || next >= STEPS.length) return;
    run(stepRequest(next));
  }

  // KI nur mit gespeichertem Key; jeder Fehler (kein Key, 503 ohne API-Key, Zeitlimit) heißt: ohne KI weiter.
  const ai: StageAi = useMemo(() => ({
    spotlight: async (text) => {
      if (!key) return null;
      const res = await fetch("/api/ai/spotlight", { method: "POST", body: JSON.stringify({ key, text }) });
      return res.ok ? parseSpotlight(await res.json()) : null;
    },
    themen: async (ideen) => {
      if (!key) return null;
      const res = await fetch("/api/ai/themen", { method: "POST", body: JSON.stringify({ key, ideen }) });
      if (!res.ok) return null;
      const data = (await res.json()) as { themen?: Thema[] };
      return Array.isArray(data.themen) ? data.themen : null;
    },
  }), [key]);

  if (error) return <div className="grid min-h-screen place-items-center text-muted">{error}</div>;
  if (step === null) return <div className="grid min-h-screen place-items-center text-muted">Verbinde …</div>;

  return (
    <Stage code={code} step={step} participants={participants} answers={answers} reactions={reactions}
      live={live} reconnecting={reconnecting} go={go} onReset={() => setConfirmReset(true)}
      onUnlock={key ? undefined : () => setPending(() => stepRequest(step))}
      dialogOpen={dialogOpen} ai={ai}>
      <AnimatePresence>
        {pending && (
          <KeyDialog
            key="key"
            onCancel={() => setPending(null)}
            onSubmit={async (k) => {
              const res = await pending(k);
              if (res.status === 401) return false;
              setKey(k);
              try { localStorage.setItem("ndu-presenter-key", k); } catch {}
              setPending(null);
              return true;
            }}
          />
        )}
        {confirmReset && (
          <Dialog key="reset" label="Session" title="Zurücksetzen?" onCancel={() => setConfirmReset(false)}>
            <p className="mb-8 text-lg text-muted">Alle Teilnehmer, Antworten und Reaktionen dieser Session werden gelöscht. Danach steht die Leinwand wieder bei Schritt 1.</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setConfirmReset(false)} className="rounded-xl border border-border px-5 py-3 text-lg">Abbrechen</button>
              <button autoFocus onClick={() => { setConfirmReset(false); run(resetRequest); }} className="rounded-xl bg-accent px-5 py-3 text-lg font-semibold text-accent-ink">Zurücksetzen</button>
            </div>
          </Dialog>
        )}
      </AnimatePresence>
    </Stage>
  );
}

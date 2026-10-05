"use client";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/useSession";
import { AVATARS, EMOJIS, STEPS } from "@/lib/steps";

type Me = { id: string; name: string; emoji: string };

export default function JoinClient({ code }: { code: string }) {
  const { step, participants, answers, error } = useSession(code);
  const [me, setMe] = useState<Me | null>(null);
  const [name, setName] = useState("");
  // eslint-disable-next-line react-hooks/purity
  const [emoji, setEmoji] = useState(() => AVATARS[Math.floor(Math.random() * AVATARS.length)]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [burst, setBurst] = useState<{ id: number; e: string }[]>([]);

  // Teilnehmer*in im Browser merken, damit ein Reload nicht neu registriert
  useEffect(() => {
    try {
      const raw = localStorage.getItem(`ndu-live-${code}`);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setMe(JSON.parse(raw));
    } catch {}
  }, [code]);

  // Wurde die Session zurückgesetzt? Dann bin ich nicht mehr in der Liste.
  useEffect(() => {
    if (me && participants.length > 0 && !participants.some((p) => p.id === me.id)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMe(null);
      try { localStorage.removeItem(`ndu-live-${code}`); } catch {}
    }
  }, [participants, me, code]);

  async function join() {
    const n = name.trim();
    if (!n || busy) return;
    setBusy(true);
    const { data, error } = await supabase
      .from("participants")
      .insert({ session_code: code, name: n.slice(0, 24), emoji })
      .select("id,name,emoji")
      .single();
    setBusy(false);
    if (error || !data) { alert("Beitreten hat nicht geklappt – noch einmal versuchen."); return; }
    setMe(data);
    try { localStorage.setItem(`ndu-live-${code}`, JSON.stringify(data)); } catch {}
  }

  async function answer(value: string) {
    if (!me || step === null || busy) return;
    setBusy(true);
    await supabase.from("answers").insert({ session_code: code, participant_id: me.id, step, value: value.slice(0, 80) });
    setBusy(false);
  }

  async function react(e: string) {
    // eslint-disable-next-line react-hooks/purity
    const id = Date.now() + Math.random();
    setBurst((b) => [...b, { id, e }]);
    setTimeout(() => setBurst((b) => b.filter((x) => x.id !== id)), 1200);
    await supabase.from("reactions").insert({ session_code: code, emoji: e });
  }

  if (error) return <Shell><p className="text-center text-muted">{error}</p></Shell>;
  if (step === null) return <Shell><p className="text-center text-muted">Verbinde …</p></Shell>;

  const current = STEPS[step] ?? STEPS[0];
  const myAnswer = me ? answers.find((a) => a.participant_id === me.id && a.step === step) : undefined;

  // 1) Beitreten
  if (!me) {
    return (
      <Shell>
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="w-full">
          <p className="mb-1 text-xs tracking-widest text-muted uppercase">NDU Coding 2026</p>
          <h1 className="mb-6 text-3xl font-bold">Wer bist du?</h1>
          <div className="mb-4 flex flex-wrap gap-2">
            {AVATARS.map((a) => (
              <button key={a} type="button" onClick={() => setEmoji(a)}
                className={`h-12 w-12 rounded-xl border text-2xl transition ${emoji === a ? "border-accent bg-accent/15 scale-110" : "border-border bg-card"}`}>
                {a}
              </button>
            ))}
          </div>
          <input
            value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && join()}
            placeholder="Vorname" maxLength={24} autoFocus
            className="mb-3 w-full rounded-xl border border-border bg-card px-4 py-3 text-lg outline-none focus:border-accent"
          />
          <button type="button" onClick={join} disabled={!name.trim() || busy}
            className="w-full rounded-xl bg-accent px-5 py-3 text-lg font-semibold text-black disabled:opacity-40">
            Dabei sein {emoji}
          </button>
        </motion.div>
      </Shell>
    );
  }

  // 2) Aktiver Schritt
  return (
    <Shell>
      <div className="mb-6 flex items-center justify-between text-sm text-muted">
        <span>{me.emoji} {me.name}</span>
        <span>{participants.length} dabei</span>
      </div>
      <AnimatePresence mode="wait">
        <motion.div key={step} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.25 }} className="w-full">
          {current.kind === "lobby" && (
            <div className="text-center">
              <motion.div animate={{ scale: [1, 1.08, 1] }} transition={{ repeat: Infinity, duration: 2 }} className="mb-4 text-6xl">{me.emoji}</motion.div>
              <h1 className="mb-2 text-2xl font-bold">Du bist drin.</h1>
              <p className="text-muted">Schau auf die Leinwand – gleich geht’s los.</p>
            </div>
          )}

          {current.kind === "poll" && (
            <div>
              <h1 className="mb-5 text-2xl font-bold">{current.title}</h1>
              <div className="grid gap-3">
                {current.options.map((o) => {
                  const chosen = myAnswer?.value === o;
                  return (
                    <button key={o} type="button" disabled={!!myAnswer || busy} onClick={() => answer(o)}
                      className={`rounded-xl border px-4 py-4 text-left text-lg transition ${chosen ? "border-accent bg-accent/15" : "border-border bg-card"} disabled:opacity-70`}>
                      {chosen ? "✓ " : ""}{o}
                    </button>
                  );
                })}
              </div>
              {myAnswer && <p className="mt-4 text-center text-muted">Danke! Ergebnis auf der Leinwand.</p>}
            </div>
          )}

          {current.kind === "text" && (
            <div>
              <h1 className="mb-5 text-2xl font-bold">{current.title}</h1>
              {myAnswer ? (
                <div className="rounded-xl border border-accent bg-accent/15 px-4 py-4 text-lg">„{myAnswer.value}“<p className="mt-2 text-sm text-muted">Ist auf der Leinwand.</p></div>
              ) : (
                <>
                  <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={current.placeholder} maxLength={80} rows={3}
                    className="mb-3 w-full rounded-xl border border-border bg-card px-4 py-3 text-lg outline-none focus:border-accent" />
                  <div className="mb-3 text-right text-xs text-muted">{text.length}/80</div>
                  <button type="button" onClick={() => answer(text.trim())} disabled={!text.trim() || busy}
                    className="w-full rounded-xl bg-accent px-5 py-3 text-lg font-semibold text-black disabled:opacity-40">An die Leinwand</button>
                </>
              )}
            </div>
          )}

          {current.kind === "finale" && (
            <div className="text-center">
              <h1 className="mb-2 text-2xl font-bold">{current.title}</h1>
              <p className="mb-8 text-muted">Und ihr lernt in drei Tagen, wie.</p>
              <div className="grid grid-cols-4 gap-3">
                {EMOJIS.map((e) => (
                  <motion.button key={e} type="button" whileTap={{ scale: 1.4 }} onClick={() => react(e)}
                    className="rounded-xl border border-border bg-card py-3 text-3xl">{e}</motion.button>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Emoji-Burst beim Reagieren */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <AnimatePresence>
          {burst.map((b) => (
            <motion.span key={b.id} initial={{ opacity: 1, y: 0, x: "-50%", scale: 1 }} animate={{ opacity: 0, y: -260, scale: 1.8 }} exit={{ opacity: 0 }} transition={{ duration: 1.1, ease: "easeOut" }}
              className="absolute bottom-24 left-1/2 text-5xl">{b.e}</motion.span>
          ))}
        </AnimatePresence>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-5 py-10">{children}</main>;
}

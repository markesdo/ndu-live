"use client";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, MotionConfig, motion, useAnimate, useReducedMotion } from "motion/react";
import { supabase } from "@/lib/supabase";
import { useSession, type Participant } from "@/lib/useSession";
import { AVATARS, AVATAR_NAMES, EMOJIS, EMOJI_NAMES, STEPS, courseUrl } from "@/lib/steps";
import { ringColor } from "@/lib/avatar";

type Me = { id: string; name: string; emoji: string };

// Schnelle Reaktionen nach dem Abstimmen – die Wartezeit wird zum Mitspielen.
const QUICK = ["🔥", "🤯", "👏", "❤️"];

// Federn für alles, was auf Berührung reagiert; ruhige Kurve für Schrittwechsel.
const SPRING = { type: "spring", stiffness: 500, damping: 30 } as const;
const EASE = [0.2, 0, 0, 1] as const;
const SHAKE = { x: [0, -6, 6, -4, 4, 0] };

// Uhr und Zufall nur in Ereignis-Handlern (nie beim Rendern) – ausgelagert, damit der Linter das sieht.
const clock = () => Date.now();
const jitter = () => Math.random();

// Vibration gibt es nur in Chrome auf Android; anderswo passiert einfach nichts.
function buzz(pattern: number | number[]) {
  try { navigator.vibrate?.(pattern); } catch {}
}

export default function JoinClient({ code }: { code: string }) {
  const { step, participants, answers, error, live, reconnecting } = useSession(code);
  const [me, setMe] = useState<Me | null>(null);
  const [rejoined, setRejoined] = useState(false);
  const [justJoined, setJustJoined] = useState(false);
  const [name, setName] = useState("");
   
  const [emoji, setEmoji] = useState(() => AVATARS[Math.floor(Math.random() * AVATARS.length)]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // Sofort sichtbare Antwort pro Schritt, bevor Supabase das Echo schickt
  const [local, setLocal] = useState<Record<number, string>>({});
  const [flying, setFlying] = useState<string | null>(null);
  const [burst, setBurst] = useState<{ id: number; e: string; x: number; y: number; dx: number }[]>([]);
  const sending = useRef(new Set<number | "join">());
  const nameRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const reduce = useReducedMotion();
  const [nameScope, animateName] = useAnimate();
  const [textScope, animateText] = useAnimate();

  // Teilnehmer*in im Browser merken, damit ein Reload nicht neu registriert.
  // Gibt es den Eintrag nicht mehr (Session zurückgesetzt), wird er vergessen.
  useEffect(() => {
    let raw: string | null = null;
    try { raw = localStorage.getItem(`ndu-live-${code}`); } catch {}
    if (!raw) return;
    let saved: Me;
    try { saved = JSON.parse(raw); } catch { return; }
    let cancelled = false;
    supabase.from("participants").select("id").eq("id", saved.id).maybeSingle().then(({ data, error }) => {
      if (cancelled) return;
      // Netzfehler: lieber den gemerkten Stand nehmen als ein zweites Mal beitreten lassen.
      if (data || error) { setMe(saved); setRejoined(true); }
      else { try { localStorage.removeItem(`ndu-live-${code}`); } catch {} }
    });
    return () => { cancelled = true; };
  }, [code]);

  // Wurde die Session zurückgesetzt, während ich dabei war? Erst zurücksetzen, wenn ich schon
  // einmal in der Liste stand – direkt nach dem Beitreten fehlt mein Eintrag dort noch kurz.
  const seenInList = useRef(false);
  useEffect(() => {
    if (!me) { seenInList.current = false; return; }
    const inList = participants.some((p) => p.id === me.id);
    if (inList) { seenInList.current = true; return; }
    if (seenInList.current) {
      seenInList.current = false;
       
      setMe(null);
      setLocal({});
      try { localStorage.removeItem(`ndu-live-${code}`); } catch {}
    }
  }, [participants, me, code]);

  async function join() {
    const n = name.trim();
    if (!n) {
      nameRef.current?.focus();
      animateName(nameScope.current, SHAKE, { duration: 0.3 });
      buzz(30);
      setNotice("Erst deinen Vornamen eintragen.");
      return;
    }
    if (sending.current.has("join")) return;
    sending.current.add("join");
    setBusy(true);
    setNotice(null);
    const { data, error } = await supabase
      .from("participants")
      .insert({ session_code: code, name: n.slice(0, 24), emoji })
      .select("id,name,emoji")
      .single();
    sending.current.delete("join");
    setBusy(false);
    if (error || !data) { setNotice("Beitreten hat nicht geklappt – bitte noch einmal tippen."); buzz(30); return; }
    buzz([30, 40, 60]);
    setJustJoined(true);
    setMe(data);
    try { localStorage.setItem(`ndu-live-${code}`, JSON.stringify(data)); } catch {}
  }

  async function answer(value: string, s: number) {
    if (!me || sending.current.has(s) || local[s] !== undefined) return;
    sending.current.add(s);
    setLocal((l) => ({ ...l, [s]: value }));
    setNotice(null);
    const { error } = await supabase.from("answers").insert({ session_code: code, participant_id: me.id, step: s, value: value.slice(0, 80) });
    sending.current.delete(s);
    // 23505 = UNIQUE (participant_id, step) greift: Diese Antwort ist schon gespeichert (z. B. zweites Gerät
    // oder Doppeltipp). Das ist kein Fehler – die gespeicherte Antwort kommt per Realtime und hat Vorrang.
    // 23503 = Fremdschlüssel, 22P02 = kaputte gespeicherte ID: Mein Eintrag existiert nicht mehr (Session zurückgesetzt, z. B. während das Handy
    // schlief). Dann neu beitreten lassen statt endlos „Nicht angekommen“ zu zeigen.
    if (error?.code === "23503" || error?.code === "22P02") {
      setMe(null);
      setLocal({});
      try { localStorage.removeItem(`ndu-live-${code}`); } catch {}
      setNotice("Die Runde wurde neu gestartet – bitte noch einmal beitreten.");
      return false;
    }
    if (error && error.code !== "23505") {
      setLocal((l) => { const n = { ...l }; delete n[s]; return n; });
      setNotice("Nicht angekommen – bitte noch einmal.");
      buzz(30);
      return false;
    }
    return true;
  }

  async function vote(o: string, s: number) {
    buzz(20);
    await answer(o, s);
  }

  async function sendText(s: number) {
    const t = text.trim();
    if (!t) {
      textRef.current?.focus();
      animateText(textScope.current, SHAKE, { duration: 0.3 });
      buzz(30);
      return;
    }
    setFlying(t);
    buzz(30);
    const ok = await answer(t, s);
    if (ok) setText("");
    else setFlying(null);
  }

  // Reaktionen bremsen: höchstens eine alle 300 ms und drei gleichzeitig unterwegs – sonst erzeugen
  // 30 Handys im WLAN eine Lawine (jede Reaktion geht an alle Geräte).
  const lastReact = useRef(0);
  const inFlight = useRef(0);
  function react(e: string, el: HTMLElement) {
    const now = clock();
    if (now - lastReact.current < 300 || inFlight.current >= 3) return;
    lastReact.current = now;
    buzz(15);
    if (!reduce) {
      const r = el.getBoundingClientRect();
      const base = now + jitter();
      const parts = [0, 1, 2].map((i) => ({
        id: base + i, e, x: r.left + r.width / 2, y: r.top,
        dx: Math.round((jitter() - 0.5) * 40),
      }));
      setBurst((b) => [...b, ...parts]);
      setTimeout(() => setBurst((b) => b.filter((x) => !parts.some((p) => p.id === x.id))), 1300);
    }
    inFlight.current++;
    Promise.resolve(supabase.from("reactions").insert({ session_code: code, emoji: e }))
      .finally(() => { inFlight.current--; });
  }

  // Verbindungsaufbau und Fehler
  if (error) {
    return (
      <Shell header={<Header count={null} live={false} />}>
        <div className="pt-10">
          <h1 className="mb-3 text-[28px] font-bold leading-[1.1]">Hier hakt es gerade.</h1>
          <p className="text-[17px] text-muted">{error}</p>
          <p className="mt-2 font-mono text-sm text-muted">Code: {code}</p>
        </div>
        <Footer>
          <PrimaryButton onClick={() => location.reload()}>Nochmal versuchen</PrimaryButton>
        </Footer>
      </Shell>
    );
  }
  if (step === null) return <Connecting />;

  const current = STEPS[step] ?? STEPS[0];
  const myAnswer = me ? answers.find((a) => a.participant_id === me.id && a.step === step) : undefined;
  const mine = myAnswer?.value ?? local[step];

  // 1) Beitreten
  if (!me) {
    const others = participants.slice(-6).reverse();
    return (
      <MotionConfig reducedMotion="user">
        <Shell header={<Header count={participants.length} live={live} />} reconnecting={reconnecting}>
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, ease: EASE }} className="pt-6">
            <h1 className="mb-1 text-[32px] font-bold leading-[1.05]">Wer bist du?</h1>
            <p className="mb-5 text-[17px] text-muted">Such dir deinen Vibe. Vorname. Fertig.</p>

            <div role="radiogroup" aria-label="Avatar" className="mb-5 grid grid-cols-4 gap-2.5">
              {AVATARS.map((a) => {
                const selected = emoji === a;
                // Sobald ein Name dasteht, zeigt der Rahmen schon die eigene Ringfarbe (wie auf der Leinwand).
                const ring = name.trim() ? ringColor(name) : "var(--accent)";
                return (
                  <button key={a} type="button" role="radio" aria-checked={selected} aria-label={AVATAR_NAMES[a] ?? a}
                    onClick={() => { setEmoji(a); buzz(10); }}
                    className="relative grid h-14 place-items-center rounded-2xl border border-border bg-card text-[28px]">
                    {selected && (
                      <motion.span layoutId="avatar-ring" transition={SPRING}
                        style={{ borderColor: ring, backgroundColor: `color-mix(in srgb, ${ring} 15%, transparent)` }}
                        className="absolute inset-0 rounded-2xl border-2 transition-colors duration-300" />
                    )}
                    <motion.span layoutId={selected ? "me-avatar" : undefined} animate={{ scale: selected ? 1.15 : 1 }} transition={SPRING} className="relative">
                      {a}
                    </motion.span>
                  </button>
                );
              })}
            </div>

            <div ref={nameScope}>
              <input ref={nameRef}
                value={name} onChange={(e) => { setName(e.target.value); if (notice) setNotice(null); }}
                onKeyDown={(e) => e.key === "Enter" && join()}
                placeholder="Vorname" aria-label="Vorname" maxLength={24}
                autoCapitalize="words" autoComplete="given-name" enterKeyHint="go"
                className="ring-im-rahmen h-14 w-full rounded-2xl border border-border bg-card px-4 text-[18px] outline-none placeholder:text-muted focus:border-accent"
              />
            </div>

            <SocialProof others={others} total={participants.length} />
          </motion.div>

          <Footer>
            <Notice text={notice} />
            <PrimaryButton onClick={join} busy={busy}>Dabei sein <span aria-hidden>{emoji}</span></PrimaryButton>
          </Footer>
        </Shell>
      </MotionConfig>
    );
  }

  // 2) Aktiver Schritt
  return (
    <MotionConfig reducedMotion="user">
      <Shell header={<Header count={participants.length} live={live} me={me} />} reconnecting={reconnecting}>
        <AnimatePresence mode="wait">
          <motion.div key={step} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22, ease: EASE }} className="pt-6">

            {current.kind === "lobby" && (
              <div className="relative">
                {justJoined && !reduce && <Confetti />}
                <h1 className="mb-2 text-[32px] font-bold leading-[1.05]">
                  {rejoined && !justJoined ? "Willkommen zurück," : "Du bist drin,"}<br />{me.name}.
                </h1>
                <p className="mb-8 text-[17px] text-muted">Schau auf die Leinwand – gleich geht’s los.</p>
                <div className="mb-6 flex items-baseline gap-3" aria-live="polite">
                  <Counter value={participants.length} className="font-mono text-5xl font-semibold tabular-nums" />
                  <span className="font-mono text-xs uppercase tracking-[0.12em] text-muted">dabei</span>
                </div>
                <AvatarWall participants={participants} meId={me.id} />
              </div>
            )}

            {current.kind === "poll" && (
              <div>
                <h1 className="mb-5 text-[28px] font-bold leading-[1.1]">{current.title}</h1>
                <div className="grid gap-3" role="group" aria-label={current.title}>
                  {current.options.map((o) => {
                    const chosen = mine === o;
                    return (
                      <motion.button key={o} type="button" aria-pressed={chosen} disabled={mine !== undefined}
                        whileTap={mine === undefined ? { scale: 0.97 } : undefined} transition={SPRING}
                        onClick={() => vote(o, step)}
                        animate={{ opacity: mine !== undefined && !chosen ? 0.5 : 1 }}
                        className={`flex min-h-16 items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left text-[18px] font-semibold ${chosen ? "border-accent bg-accent/15" : "border-border bg-card"}`}>
                        <span>{o}</span>
                        {chosen && <Check />}
                      </motion.button>
                    );
                  })}
                </div>
              </div>
            )}

            {current.kind === "text" && (
              <div>
                <h1 className="mb-5 text-[28px] font-bold leading-[1.1]">{current.title}</h1>
                <div className="relative">
                  <AnimatePresence>
                    {flying && (
                      <motion.div key="fly" initial={{ opacity: 1, x: 0, y: 0, scale: 1 }}
                        animate={{ opacity: 0, x: 60, y: -120, scale: 0.6 }} transition={{ duration: 0.5, ease: "easeIn" }}
                        onAnimationComplete={() => setFlying(null)}
                        className="pointer-events-none absolute inset-x-0 top-0 z-10 rounded-2xl border border-accent bg-card-2 px-4 py-4 text-[18px]">
                        „{flying}“
                      </motion.div>
                    )}
                  </AnimatePresence>
                  {mine !== undefined ? (
                    !flying && (
                      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={SPRING}
                        className="rounded-2xl border border-accent bg-accent/15 px-4 py-4 text-[18px]">
                        „{mine}“
                        <p className="mt-2 text-sm text-muted"><span aria-hidden>📺 </span>{current.after}</p>
                      </motion.div>
                    )
                  ) : (
                    <div ref={textScope}>
                      <textarea ref={textRef} value={text} onChange={(e) => setText(e.target.value)} placeholder={current.placeholder}
                        aria-label={current.title} maxLength={80} rows={4} enterKeyHint="send"
                        className="ring-im-rahmen w-full resize-none rounded-2xl border border-border bg-card px-4 py-3 text-[18px] outline-none placeholder:text-muted focus:border-accent" />
                      <div className={`mt-1 text-right font-mono text-sm ${text.length >= 70 ? "text-accent" : "text-muted"}`}>{text.length}/80</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {current.kind === "finale" && (
              <div>
                <h1 className="mb-2 text-[30px] font-bold leading-[1.1]">{current.title}</h1>
                <p className="mb-1 text-[17px] text-muted">Und ihr lernt in drei Tagen, wie.</p>
                <p className="mb-8 font-mono text-xs uppercase tracking-[0.12em] text-muted">Next.js · Supabase · Vercel · Claude Code</p>
                <div className="grid grid-cols-4 gap-3">
                  {EMOJIS.map((e) => (
                    <motion.button key={e} type="button" whileTap={{ scale: 1.3 }} transition={SPRING}
                      aria-label={`Reagieren mit ${EMOJI_NAMES[e] ?? e}`}
                      onClick={(ev) => react(e, ev.currentTarget)}
                      className="grid h-[72px] place-items-center rounded-2xl border border-border bg-card text-[34px]">
                      <span aria-hidden>{e}</span>
                    </motion.button>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        <Footer>
          <Notice text={notice} />
          {current.kind === "poll" && mine !== undefined && (
            <>
              <PersonalResult mine={mine} meId={me.id} step={step} answers={answers} participants={participants} />
              <QuickReactions onReact={react} />
            </>
          )}
          {current.kind === "text" && mine === undefined && (
            <PrimaryButton onClick={() => sendText(step)}>An die Leinwand</PrimaryButton>
          )}
          {current.kind === "text" && mine !== undefined && !flying && <QuickReactions onReact={react} />}
          {current.kind === "finale" && (
            <a href={courseUrl(window.location.hostname)}
              className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl border border-border bg-card text-[18px] font-semibold">
              Zur Kurs-Website <span aria-hidden>→</span>
            </a>
          )}
        </Footer>

        {/* Emoji-Burst über der angetippten Kachel */}
        <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
          <AnimatePresence>
            {burst.map((b) => (
              <motion.span key={b.id} initial={{ opacity: 1, x: "-50%", y: 0, scale: 1 }} animate={{ opacity: 0, x: `calc(-50% + ${b.dx}px)`, y: -240, scale: 1.7 }}
                exit={{ opacity: 0 }} transition={{ duration: 1.1, ease: "easeOut" }}
                style={{ left: b.x, top: b.y }} className="absolute text-5xl">{b.e}</motion.span>
            ))}
          </AnimatePresence>
        </div>
      </Shell>
    </MotionConfig>
  );
}

// Drei Zeilen: Kopf, Inhalt (oben ausgerichtet), Aktion im Daumenbereich. Safe Areas für Notch und Home-Balken.
function Shell({ header, children, reconnecting = false }: { header: React.ReactNode; children: React.ReactNode; reconnecting?: boolean }) {
  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-md grid-rows-[auto_1fr_auto] px-5 pt-[max(16px,env(safe-area-inset-top))] pb-[max(16px,env(safe-area-inset-bottom))]">
      <div>
        {header}
        <AnimatePresence>
          {reconnecting && (
            <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
              role="status" className="mt-2 overflow-hidden rounded-xl bg-accent-2/15 px-3 py-1.5 text-center text-sm text-accent-2">
              Verbinde neu …
            </motion.p>
          )}
        </AnimatePresence>
      </div>
      {children}
    </main>
  );
}

function Header({ count, live, me }: { count: number | null; live: boolean; me?: Me }) {
  return (
    <header className="flex h-11 items-center justify-between">
      {me ? (
        <span className="flex items-center gap-2 text-[15px] font-semibold">
          <motion.span layoutId="me-avatar" transition={SPRING}
            className="grid h-9 w-9 place-items-center rounded-full bg-card text-xl" style={{ boxShadow: `inset 0 0 0 2px ${ringColor(me.name)}` }}>
            {me.emoji}
          </motion.span>
          {me.name}
        </span>
      ) : (
        <span className="font-mono text-xs uppercase tracking-[0.12em] text-muted">NDU Coding 2026</span>
      )}
      {count !== null && (
        <span className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 font-mono text-[13px]" aria-live="polite">
          <span className={`h-2 w-2 rounded-full ${live ? "live-dot bg-ok" : "bg-muted"}`} aria-hidden />
          <Counter value={count} className="tabular-nums" /> dabei
        </span>
      )}
    </header>
  );
}

function Footer({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-3 pt-6">{children}</div>;
}

function PrimaryButton({ onClick, busy = false, children }: { onClick: () => void; busy?: boolean; children: React.ReactNode }) {
  return (
    <motion.button type="button" onClick={onClick} disabled={busy} aria-busy={busy}
      whileTap={busy ? undefined : { scale: 0.98 }} transition={SPRING}
      className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-accent text-[18px] font-semibold text-accent-ink disabled:border disabled:border-border disabled:bg-card disabled:text-muted">
      {busy ? <><Spinner /> Einen Moment …</> : children}
    </motion.button>
  );
}

function Notice({ text }: { text: string | null }) {
  return (
    <AnimatePresence>
      {text && (
        <motion.p role="alert" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
          className="text-center text-[15px] text-accent">{text}</motion.p>
      )}
    </AnimatePresence>
  );
}

// Zahl, die beim Ändern von unten nachrückt
function Counter({ value, className = "" }: { value: number; className?: string }) {
  return (
    <span className={`relative inline-block overflow-hidden align-bottom ${className}`}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span key={value} initial={{ y: "100%", opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: "-100%", opacity: 0 }}
          transition={SPRING} className="inline-block">{value}</motion.span>
      </AnimatePresence>
    </span>
  );
}

function SocialProof({ others, total }: { others: Participant[]; total: number }) {
  if (total === 0) return <p className="mt-4 text-[15px] text-muted">Noch ist niemand da – du bist die erste Person.</p>;
  return (
    <div className="mt-4 flex items-center gap-2 text-[15px] text-muted">
      <span className="flex -space-x-1.5" aria-hidden>
        {others.map((p) => (
          <motion.span key={p.id} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={SPRING}
            className="grid h-8 w-8 place-items-center rounded-full border-2 border-bg bg-card-2 text-base"
            style={{ boxShadow: `inset 0 0 0 2px ${ringColor(p.name)}` }}>{p.emoji}</motion.span>
        ))}
      </span>
      <span>{total === 1 ? "1 ist schon da" : `${total} sind schon da`}</span>
    </div>
  );
}

function AvatarWall({ participants, meId }: { participants: Participant[]; meId: string }) {
  const shown = participants.slice(0, 48);
  const rest = participants.length - shown.length;
  return (
    <div className="flex flex-wrap gap-2" aria-hidden>
      <AnimatePresence>
        {shown.map((p) => (
          <motion.span key={p.id} initial={{ scale: 0, rotate: -15 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 500, damping: 14 }}
            title={p.name}
            className={`grid h-10 w-10 place-items-center rounded-full text-xl ${p.id === meId ? "bg-accent/15" : "bg-card"}`}
            style={{ boxShadow: `inset 0 0 0 ${p.id === meId ? 3 : 2}px ${ringColor(p.name)}` }}>
            {p.emoji}
          </motion.span>
        ))}
      </AnimatePresence>
      {rest > 0 && <span className="grid h-10 place-items-center px-2 font-mono text-sm text-muted">+{rest}</span>}
    </div>
  );
}

function Check() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0 text-accent">
      <motion.path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.25, ease: "easeOut" }} />
    </svg>
  );
}

function Spinner() {
  return (
    <motion.span aria-hidden className="h-5 w-5 rounded-full border-2 border-current border-t-transparent"
      animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }} />
  );
}

// Kleines Konfetti beim Beitreten: acht Punkte, einmal
function Confetti() {
  const dots = Array.from({ length: 8 }, (_, i) => {
    const angle = (i / 8) * Math.PI * 2;
    return { i, x: Math.cos(angle) * 90, y: Math.sin(angle) * 70 - 20, c: i % 2 ? "bg-accent" : "bg-blue" };
  });
  return (
    <div className="pointer-events-none absolute left-1/2 top-4" aria-hidden>
      {dots.map((d) => (
        <motion.span key={d.i} className={`absolute h-2 w-2 rounded-full ${d.c}`}
          initial={{ x: 0, y: 0, opacity: 1, scale: 1 }} animate={{ x: d.x, y: d.y, opacity: 0, scale: 0.4 }}
          transition={{ duration: 0.6, ease: "easeOut" }} />
      ))}
    </div>
  );
}

function Connecting() {
  const [slow, setSlow] = useState(false);
  useEffect(() => { const t = setTimeout(() => setSlow(true), 4000); return () => clearTimeout(t); }, []);
  return (
    <Shell header={<Header count={null} live={false} />}>
      <div className="grid place-items-center" role="status">
        <div className="text-center">
          <div className="mb-3 flex justify-center gap-1.5" aria-hidden>
            {[0, 1, 2].map((i) => (
              <motion.span key={i} className="h-2 w-2 rounded-full bg-muted"
                animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1.2, delay: i * 0.2 }} />
            ))}
          </div>
          <p className="text-[17px] text-muted">{slow ? "Dauert gerade – WLAN?" : "Verbinde …"}</p>
        </div>
      </div>
    </Shell>
  );
}

// Persönliches Ergebnis nach dem Abstimmen: „Du und 11 andere: Noch nie.“ Zählt live mit.
function PersonalResult({ mine, meId, step, answers, participants }: { mine: string; meId: string; step: number; answers: { participant_id: string; step: number; value: string }[]; participants: Participant[] }) {
  const same = answers.filter((a) => a.step === step && a.value === mine && a.participant_id !== meId);
  const byId = new Map(participants.map((p) => [p.id, p]));
  const others = same.map((a) => byId.get(a.participant_id)).filter((p): p is Participant => !!p);
  const n = others.length;
  return (
    <motion.div initial={{ opacity: 0, y: 24, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={SPRING}
      className="rounded-2xl bg-accent/15 px-4 py-3" aria-live="polite">
      <p className="text-[17px] font-semibold leading-snug">
        {n === 0 ? <>Bis jetzt nur du: „{mine}“.</> : <>Du und {n} {n === 1 ? "andere Person" : "andere"}: „{mine}“.</>}
      </p>
      {n > 0 && (
        <div className="mt-2 flex items-center gap-1" aria-hidden>
          {others.slice(0, 10).map((p) => (
            <motion.span key={p.id} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={SPRING}
              className="grid h-7 w-7 place-items-center rounded-full bg-card text-sm" style={{ boxShadow: `inset 0 0 0 2px ${ringColor(p.name)}` }}>
              {p.emoji}
            </motion.span>
          ))}
          {n > 10 && <span className="ml-1 font-mono text-xs text-muted">+{n - 10}</span>}
        </div>
      )}
    </motion.div>
  );
}

// Kleine Reaktionsreihe im Daumenbereich: Die Wartezeit, bis alle abgestimmt haben, wird zum Mitspielen.
function QuickReactions({ onReact }: { onReact: (e: string, el: HTMLElement) => void }) {
  return (
    <div className="grid grid-cols-4 gap-2" role="group" aria-label="Reagieren">
      {QUICK.map((e) => (
        <motion.button key={e} type="button" whileTap={{ scale: 1.25 }} transition={SPRING}
          aria-label={`Reagieren mit ${EMOJI_NAMES[e] ?? e}`} onClick={(ev) => onReact(e, ev.currentTarget)}
          className="grid h-12 place-items-center rounded-2xl border border-border bg-card text-[24px]">
          <span aria-hidden>{e}</span>
        </motion.button>
      ))}
    </div>
  );
}

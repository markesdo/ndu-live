"use client";
import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { createLoader, mergeRows } from "./session-merge";
import { nextPhoneStage, type PhoneStage } from "./energy";
import { revealStepOf } from "./poll-small";

export type Participant = { id: string; name: string; emoji: string };
export type Answer = { id: string; participant_id: string; step: number; value: string };
export type Reaction = { id: string; emoji: string; created_at: string };

export function useSession(code: string) {
  const [step, setStep] = useState<number | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [error, setError] = useState<string | null>(null);
  // false, solange der Realtime-Kanal nicht steht oder abgerissen ist (WLAN weg, Handy im Standby)
  const [live, setLive] = useState(false);
  // true nur nach einem Abriss – beim allerersten Verbinden zeigen wir keinen Hinweis
  const [channelDown, setChannelDown] = useState(false);
  // Ein Nachladen (nach Standby/Wiederverbinden) ist gescheitert – der alte Stand bleibt stehen.
  const [refreshFailed, setRefreshFailed] = useState(false);
  // Stufe des Token-Spiels („Der Raum schreibt den Prompt“) – nur per Broadcast von der Leinwand, nicht gespeichert.
  const [energyStage, setEnergyStage] = useState<PhoneStage | null>(null);
  // Schritt, für den die Leinwand eine kleine Umfrage aufgelöst hat (Broadcast „reveal“) – auch früh per →.
  const [revealStep, setRevealStep] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    let subscribedOnce = false;

    // Lade-Logik (Zusammenfassen, Wiederholen, Realtime-Ankünfte behalten) steckt in createLoader – getestet.
    const loader = createLoader<Participant, Answer>({
      fetchAll: async () => {
        const [s, p, a] = await Promise.all([
          supabase.from("sessions").select("active_step").eq("code", code).single(),
          supabase.from("participants").select("id,name,emoji").eq("session_code", code).order("created_at"),
          supabase.from("answers").select("id,participant_id,step,value").eq("session_code", code).order("created_at"),
        ]);
        // PGRST116 = keine Zeile: falscher Code.
        if (s.error || p.error || a.error) return { ok: false, notFound: s.error?.code === "PGRST116" };
        return { ok: true, data: { step: s.data.active_step, participants: p.data ?? [], answers: a.data ?? [] } };
      },
      apply: (data, lateP, lateA) => {
        if (cancelled) return;
        setRefreshFailed(false);
        setError(null);
        setStep(data.step);
        // Nach Standby/Wiederverbinden ist unklar, ob die Leinwand zwischendurch geblättert hat (auch N → N+1 → N,
        // dann ist dort wieder verdeckt). Altes reveal vergessen – solange aufgelöst ist, kommt es alle 3 s neu.
        setRevealStep(null);
        setParticipants((prev) => mergeRows(data.participants, prev, lateP));
        setAnswers((prev) => mergeRows(data.answers, prev, lateA));
      },
      onFail: ({ firstLoad, notFound, attempts }) => {
        if (cancelled) return;
        // Falscher Code beim ersten Laden ist endgültig. Sonst: Stand behalten, „Verbinde neu …“, neu versuchen.
        // Klappt das erste Laden dreimal nicht, zeigen wir den Grund – die Versuche laufen weiter.
        if (firstLoad && notFound) { setError(`Session „${code}“ gibt es nicht.`); return; }
        setRefreshFailed(true);
        if (firstLoad && attempts >= 3) setError("Keine Verbindung zum Server.");
      },
      setTimer: (fn, ms) => setTimeout(fn, ms),
      clearTimer: (t) => clearTimeout(t as ReturnType<typeof setTimeout>),
    });
    const load = () => { loader.load(); };
    load();

    const channel = supabase
      .channel(`session-${code}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "sessions", filter: `code=eq.${code}` },
        (payload) => {
          const next = (payload.new as { active_step: number }).active_step;
          // Neuer Schritt = neues Token-Spiel (die Leinwand baut es beim Blättern ab und neu auf, mit neuem Durchlauf).
          // Den alten Stand vergessen, sonst nähme das Handy den neuen Durchlauf erst nach RUN_SWITCH_MS an.
          setStep((prev) => { if (prev !== next) { setEnergyStage(null); setRevealStep(null); } return next; });
        })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "participants", filter: `session_code=eq.${code}` },
        (payload) => {
          const p = payload.new as Participant;
          loader.arrivedParticipant(p.id); // sofort merken, nicht erst im Updater – sonst kann ein laufendes Laden sie verwerfen
          setParticipants((prev) => (prev.some((x) => x.id === p.id) ? prev : [...prev, p]));
        })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "participants" },
        () => load())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "answers", filter: `session_code=eq.${code}` },
        (payload) => {
          const a = payload.new as Answer;
          loader.arrivedAnswer(a.id);
          setAnswers((prev) => (prev.some((x) => x.id === a.id) ? prev : [...prev, a]));
        })
      .on("broadcast", { event: "stage" }, ({ payload }) => {
        setEnergyStage((prev) => nextPhoneStage(prev, payload, Date.now()));
      })
      .on("broadcast", { event: "reveal" }, ({ payload }) => {
        const s = revealStepOf(payload);
        if (s !== null) setRevealStep(s);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "reactions", filter: `session_code=eq.${code}` },
        (payload) => {
          const r = payload.new as Reaction;
          setReactions((prev) => [...prev.slice(-40), r]);
        })
      .subscribe((status) => {
        if (cancelled) return;
        if (status === "SUBSCRIBED") {
          setLive(true);
          setChannelDown(false);
          // Immer nachladen: nach einem Wiederverbinden das Verpasste (z. B. der nächste Schritt), beim ersten
          // Verbinden alles, was zwischen erstem Laden und stehendem Kanal kam (z. B. ein gerade beigetretenes Handy).
          loader.subscribed();
          subscribedOnce = true;
        } else {
          setLive(false);
          if (subscribedOnce) setChannelDown(true);
        }
      });

    // Handy war im Standby: beim Zurückkommen den Stand neu laden.
    const onVisible = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      loader.stop();
      document.removeEventListener("visibilitychange", onVisible);
      supabase.removeChannel(channel);
    };
  }, [code]);

  return { step, participants, answers, reactions, error, live, reconnecting: channelDown || refreshFailed, energyStage: energyStage?.stage ?? null, revealStep };
}

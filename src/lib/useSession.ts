"use client";
import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { backoffMs, mergeRows } from "./session-merge";

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

  useEffect(() => {
    let cancelled = false;
    let subscribedOnce = false;
    let loadedOnce = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    // Nur das jüngste Laden zählt (Generation), und was währenddessen per Realtime kam, bleibt erhalten.
    let generation = 0;
    let attempt = 0;
    const arrivedP = new Set<string>();
    const arrivedA = new Set<string>();

    async function load() {
      const mine = ++generation;
      arrivedP.clear();
      arrivedA.clear();
      const [s, p, a] = await Promise.all([
        supabase.from("sessions").select("active_step").eq("code", code).single(),
        supabase.from("participants").select("id,name,emoji").eq("session_code", code).order("created_at"),
        supabase.from("answers").select("id,participant_id,step,value").eq("session_code", code).order("created_at"),
      ]);
      if (cancelled || mine !== generation) return;
      if (s.error || p.error || a.error) {
        // PGRST116 = keine Zeile: falscher Code – das ist endgültig. Alles andere ist meist das Netz:
        // Stand behalten, „Verbinde neu …“ zeigen und mit wachsendem Abstand erneut versuchen.
        if (s.error?.code === "PGRST116") { setError(`Session „${code}“ gibt es nicht.`); return; }
        setRefreshFailed(true);
        clearTimeout(retry);
        retry = setTimeout(load, backoffMs(attempt++));
        return;
      }
      loadedOnce = true;
      attempt = 0;
      setRefreshFailed(false);
      setError(null);
      setStep(s.data.active_step);
      const lateP = new Set(arrivedP);
      const lateA = new Set(arrivedA);
      setParticipants((prev) => mergeRows(p.data ?? [], prev, lateP));
      setAnswers((prev) => mergeRows(a.data ?? [], prev, lateA));
    }
    load();

    const channel = supabase
      .channel(`session-${code}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "sessions", filter: `code=eq.${code}` },
        (payload) => setStep((payload.new as { active_step: number }).active_step))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "participants", filter: `session_code=eq.${code}` },
        (payload) => {
          const p = payload.new as Participant;
          arrivedP.add(p.id); // sofort merken, nicht erst im Updater – sonst kann ein laufendes Laden sie verwerfen
          setParticipants((prev) => (prev.some((x) => x.id === p.id) ? prev : [...prev, p]));
        })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "participants" },
        () => load())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "answers", filter: `session_code=eq.${code}` },
        (payload) => {
          const a = payload.new as Answer;
          arrivedA.add(a.id);
          setAnswers((prev) => (prev.some((x) => x.id === a.id) ? prev : [...prev, a]));
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
          // Nach einem Wiederverbinden verpasste Änderungen nachholen (z. B. der nächste Schritt) –
          // und beim ersten Verbinden, falls das erste Laden gescheitert ist.
          if (subscribedOnce || !loadedOnce) load();
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
      clearTimeout(retry);
      document.removeEventListener("visibilitychange", onVisible);
      supabase.removeChannel(channel);
    };
  }, [code]);

  return { step, participants, answers, reactions, error, live, reconnecting: channelDown || refreshFailed };
}

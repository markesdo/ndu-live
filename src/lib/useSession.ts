"use client";
import { useEffect, useState } from "react";
import { supabase } from "./supabase";

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
  const [reconnecting, setReconnecting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let subscribedOnce = false;

    async function load() {
      const [s, p, a] = await Promise.all([
        supabase.from("sessions").select("active_step").eq("code", code).single(),
        supabase.from("participants").select("id,name,emoji").eq("session_code", code).order("created_at"),
        supabase.from("answers").select("id,participant_id,step,value").eq("session_code", code).order("created_at"),
      ]);
      if (cancelled) return;
      if (s.error) {
        // PGRST116 = keine Zeile: falscher Code. Alles andere ist meist das Netz.
        setError(s.error.code === "PGRST116" ? `Session „${code}“ gibt es nicht.` : "Keine Verbindung zum Server.");
        return;
      }
      setError(null);
      setStep(s.data.active_step);
      setParticipants(p.data ?? []);
      setAnswers(a.data ?? []);
    }
    load();

    const channel = supabase
      .channel(`session-${code}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "sessions", filter: `code=eq.${code}` },
        (payload) => setStep((payload.new as { active_step: number }).active_step))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "participants", filter: `session_code=eq.${code}` },
        (payload) => setParticipants((prev) => {
          const p = payload.new as Participant;
          return prev.some((x) => x.id === p.id) ? prev : [...prev, p];
        }))
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "participants" },
        () => load())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "answers", filter: `session_code=eq.${code}` },
        (payload) => setAnswers((prev) => {
          const a = payload.new as Answer;
          return prev.some((x) => x.id === a.id) ? prev : [...prev, a];
        }))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "reactions", filter: `session_code=eq.${code}` },
        (payload) => {
          const r = payload.new as Reaction;
          setReactions((prev) => [...prev.slice(-40), r]);
        })
      .subscribe((status) => {
        if (cancelled) return;
        if (status === "SUBSCRIBED") {
          setLive(true);
          setReconnecting(false);
          // Nach einem Wiederverbinden verpasste Änderungen nachholen (z. B. der nächste Schritt).
          if (subscribedOnce) load();
          subscribedOnce = true;
        } else {
          setLive(false);
          if (subscribedOnce) setReconnecting(true);
        }
      });

    // Handy war im Standby: beim Zurückkommen den Stand neu laden.
    const onVisible = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      supabase.removeChannel(channel);
    };
  }, [code]);

  return { step, participants, answers, reactions, error, live, reconnecting };
}

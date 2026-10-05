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

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const [s, p, a] = await Promise.all([
        supabase.from("sessions").select("active_step").eq("code", code).single(),
        supabase.from("participants").select("id,name,emoji").eq("session_code", code).order("created_at"),
        supabase.from("answers").select("id,participant_id,step,value").eq("session_code", code).order("created_at"),
      ]);
      if (cancelled) return;
      if (s.error) { setError(`Session „${code}“ nicht gefunden.`); return; }
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
        (payload) => setParticipants((prev) => [...prev, payload.new as Participant]))
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "participants" },
        () => load())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "answers", filter: `session_code=eq.${code}` },
        (payload) => setAnswers((prev) => [...prev, payload.new as Answer]))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "reactions", filter: `session_code=eq.${code}` },
        (payload) => {
          const r = payload.new as Reaction;
          setReactions((prev) => [...prev.slice(-40), r]);
        })
      .subscribe();

    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [code]);

  return { step, participants, answers, reactions, error };
}

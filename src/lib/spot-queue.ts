// Warteschlange fürs KI-Spotlight: höchstens eine Anfrage gleichzeitig, dahinter genau ein Platz.
// Wird ein zweiter Wunsch eingereiht, verdrängt er den ersten – der Aufrufer muss den verdrängten
// zurücksetzen, damit ein erneutes Öffnen wieder lädt (statt ewig „schreibt …“ zu zeigen).
import { stripNames } from "./ai-shared.ts";

export type SpotQueue = { busy: string | null; wanted: string | null };

export function requestSpot(q: SpotQueue, id: string): { q: SpotQueue; start: string | null; dropped: string | null } {
  if (q.busy === id || q.wanted === id) return { q, start: null, dropped: null };
  if (!q.busy) return { q: { busy: id, wanted: q.wanted }, start: id, dropped: null };
  return { q: { busy: q.busy, wanted: id }, start: null, dropped: q.wanted };
}

export function doneSpot(q: SpotQueue): { q: SpotQueue; start: string | null } {
  if (!q.wanted) return { q: { busy: null, wanted: null }, start: null };
  return { q: { busy: q.wanted, wanted: null }, start: q.wanted };
}

// Text einer Idee für die KI – aus dem Stand zum Zeitpunkt des Sendens, nicht dem beim Einreihen:
// Später gekommene Ideen werden gefunden, später beigetretene Vornamen ersetzt.
export function ideaTextForAi(id: string, answers: { id: string; value: string }[], people: { name: string }[]) {
  const idea = answers.find((a) => a.id === id);
  return idea ? stripNames(idea.value, people.map((p) => p.name)) : null;
}

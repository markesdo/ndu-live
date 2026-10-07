// Umfragen für kleine Gruppen (bis SMALL_MAX Personen): Namen statt anonymer Punkte, Zahlen statt Prozent –
// und Spannung: Die Leinwand zeigt erst, wer was gewählt hat, wenn alle geantwortet haben (oder die
// Leitung früher auflöst). Ab SMALL_MAX + 1 bleibt alles wie bisher: Stimmen fliegen sofort in ihre Zeile.
// Reine Logik ohne React, damit sie sich testen lässt.

export const SMALL_MAX = 6;

export const isSmall = (participants: number) => participants > 0 && participants <= SMALL_MAX;

type A = { participant_id: string; step: number };

// Wie viele der aktuell Anwesenden haben in diesem Schritt geantwortet? `alsoId` zählt eine eigene,
// schon gesendete Antwort mit, die noch nicht über Realtime zurückgekommen ist (Handy).
export function answeredCount(answers: A[], participantIds: string[], step: number, alsoId?: string): number {
  const present = new Set(participantIds);
  const done = new Set(answers.filter((a) => a.step === step && present.has(a.participant_id)).map((a) => a.participant_id));
  if (alsoId && present.has(alsoId)) done.add(alsoId);
  return done.size;
}

export const allAnswered = (answered: number, participants: number) => participants > 0 && answered >= participants;

// Darf die Leinwand zeigen, wer was gewählt hat? Große Gruppen sofort; kleine erst, wenn alle
// geantwortet haben oder die Leitung mit → früher aufgelöst hat.
export function revealed(answered: number, participants: number, early: boolean): boolean {
  if (!isSmall(participants)) return true;
  return early || allAnswered(answered, participants);
}

// Was → / „Weiter“ auf einer Umfrage tut: erst auflösen, dann die Pointe, dann zum nächsten Schritt.
export function pollAdvance(isRevealed: boolean, hasPunchline: boolean, punchShown: boolean): "reveal" | "punch" | "next" {
  if (!isRevealed) return "reveal";
  if (hasPunchline && !punchShown) return "punch";
  return "next";
}

// Zahl in der Zeile: kleine Gruppe „2“, große „2 · 50%“.
export function countLabel(n: number, total: number, participants: number): string {
  if (isSmall(participants)) return String(n);
  return `${n} · ${total ? Math.round((100 * n) / total) : 0}%`;
}

// Handy, kleine Gruppe, eigene Antwort gesendet, aber noch nicht alle: Wartehinweis statt Ergebnis.
// null heißt: Ergebnis zeigen (große Gruppe, alle haben geantwortet, oder die Leinwand hat aufgelöst).
// `revealStep`: Schritt aus dem letzten Broadcast „reveal“ – zählt nur für den aktuellen Schritt.
export function phoneWaiting(answered: number, participants: number, step: number, revealStep: number | null): string | null {
  if (!isSmall(participants) || allAnswered(answered, participants) || revealStep === step) return null;
  return `Gesendet · warten auf die anderen (${answered} von ${participants})`;
}

// Leinwand → Handys: Broadcast „reveal“ auf dem Kanal session-<code>, solange die Umfrage aufgelöst ist.
// Wiederholt, damit Nachzügler und verlorene Nachrichten aufholen. run = Leinwand-Sitzung (wie beim Token-Spiel).
export const REVEAL_EVERY_MS = 3000;

// Handy: Schritt aus einer reveal-Nachricht, null bei allem Kaputten.
export function revealStepOf(payload: unknown): number | null {
  const s = (payload as { step?: unknown } | null)?.step;
  return typeof s === "number" && Number.isInteger(s) && s >= 0 ? s : null;
}

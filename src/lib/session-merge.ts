// Reine Helfer für useSession (ohne Supabase-Import, damit Tests sie direkt laden können).

// Nachladen mit Realtime zusammenführen: Der Snapshot ist die Wahrheit für alles, was beim Laden schon
// da war (auch Löschungen). Zeilen, die erst während des Ladens per Realtime kamen, fehlen im Snapshot
// womöglich noch – die bleiben erhalten, sonst verschwindet z. B. ein gerade beigetretenes Handy.
export function mergeRows<T extends { id: string }>(snapshot: T[], prev: T[], arrivedSinceLoad: Set<string>): T[] {
  const inSnapshot = new Set(snapshot.map((r) => r.id));
  const late = prev.filter((r) => arrivedSinceLoad.has(r.id) && !inSnapshot.has(r.id));
  return late.length ? [...snapshot, ...late] : snapshot;
}

// Wartezeit vor dem nächsten Ladeversuch: 1 s, 2 s, 4 s … höchstens 15 s.
export function backoffMs(attempt: number) {
  return Math.min(1000 * 2 ** attempt, 15000);
}

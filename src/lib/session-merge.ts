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

export type Snapshot<P, A> = { step: number; participants: P[]; answers: A[] };
export type LoadResult<P, A> = { ok: true; data: Snapshot<P, A> } | { ok: false; notFound: boolean };

// Lade-Logik von useSession, ohne React und Supabase, damit sie testbar ist (scripts/fixes.test.mjs):
// - Höchstens ein Laden gleichzeitig; Wünsche währenddessen ergeben genau ein weiteres Laden
//   (z. B. viele DELETE-Ereignisse nach einem Reset).
// - Realtime-Ankünfte während eines Ladens werden an apply übergeben, damit mergeRows sie behält.
// - Fehler: erneut versuchen mit wachsendem Abstand; ein Erfolg löscht den wartenden Versuch.
// - Falscher Session-Code ist nur beim ersten Laden endgültig – danach ein Aussetzer wie jeder andere.
export function createLoader<P, A>(opts: {
  fetchAll: () => Promise<LoadResult<P, A>>;
  apply: (data: Snapshot<P, A>, lateP: Set<string>, lateA: Set<string>) => void;
  onFail: (info: { firstLoad: boolean; notFound: boolean; attempts: number }) => void;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (t: unknown) => void;
}) {
  let inflight = false;
  let again = false;
  let stopped = false;
  let loadedOnce = false;
  let failedBeforeFirst = false;
  let attempt = 0;
  let retry: unknown;
  const arrivedP = new Set<string>();
  const arrivedA = new Set<string>();

  async function load(): Promise<void> {
    if (stopped) return;
    if (inflight) { again = true; return; }
    inflight = true;
    arrivedP.clear();
    arrivedA.clear();
    try {
      const r = await opts.fetchAll().catch((): LoadResult<P, A> => ({ ok: false, notFound: false }));
      if (stopped) return;
      if (!r.ok) {
        const firstLoad = !loadedOnce;
        if (firstLoad) failedBeforeFirst = true;
        opts.onFail({ firstLoad, notFound: r.notFound, attempts: attempt + 1 });
        if (r.notFound && firstLoad) return;
        opts.clearTimer(retry);
        retry = opts.setTimer(() => { retry = undefined; load(); }, backoffMs(attempt++));
        return;
      }
      loadedOnce = true;
      failedBeforeFirst = false;
      attempt = 0;
      if (retry !== undefined) { opts.clearTimer(retry); retry = undefined; }
      opts.apply(r.data, new Set(arrivedP), new Set(arrivedA));
    } finally {
      inflight = false;
      if (again && !stopped) { again = false; load(); }
    }
  }

  return {
    load,
    arrivedParticipant: (id: string) => { arrivedP.add(id); },
    arrivedAnswer: (id: string) => { arrivedA.add(id); },
    // Erstes Laden ist gescheitert (nicht: läuft noch) – dann soll das erste SUBSCRIBED erneut laden.
    get firstLoadFailed() { return failedBeforeFirst; },
    stop() { stopped = true; opts.clearTimer(retry); },
  };
}

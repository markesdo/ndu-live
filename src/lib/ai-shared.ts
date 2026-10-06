// Gemeinsame Teile der KI-Funktionen: Schemas für die strukturierte Ausgabe, Prüfung der Antworten
// und das Entfernen von Namen. Ohne SDK-Import, damit Leinwand und Tests es nutzen können.

export type Spotlight = { pitch: string; kriterien: string[] };
export type Thema = { titel: string; ids: string[] };

// JSON-Schemas für output_config.format (strukturierte Ausgabe): Das Modell kann nur passendes JSON liefern.
export const SPOTLIGHT_SCHEMA = {
  type: "object",
  properties: {
    pitch: { type: "string", description: "Ein deutscher Satz: was die App für wen tut." },
    kriterien: {
      type: "array",
      description: "Genau drei Akzeptanzkriterien im Format „Gegeben …, wenn …, dann …“",
      items: { type: "string" },
    },
  },
  required: ["pitch", "kriterien"],
  additionalProperties: false,
} as const;

export const THEMEN_SCHEMA = {
  type: "object",
  properties: {
    themen: {
      type: "array",
      items: {
        type: "object",
        properties: {
          titel: { type: "string", description: "Kurzer deutscher Titel, höchstens drei Wörter" },
          ids: { type: "array", items: { type: "string" } },
        },
        required: ["titel", "ids"],
        additionalProperties: false,
      },
    },
  },
  required: ["themen"],
  additionalProperties: false,
} as const;

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);

// Prüft die Spotlight-Antwort. Liefert null, wenn sie nicht brauchbar ist – dann zeigt die Leinwand nur die Idee.
export function parseSpotlight(raw: unknown): Spotlight | null {
  let v = raw;
  if (typeof v === "string") {
    try { v = JSON.parse(v); } catch { return null; }
  }
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (typeof o.pitch !== "string" || !Array.isArray(o.kriterien)) return null;
  const pitch = o.pitch.trim();
  const kriterien = o.kriterien.filter((k): k is string => typeof k === "string").map((k) => k.trim()).filter(Boolean);
  if (!pitch || kriterien.length < 3) return null;
  return { pitch: clip(pitch, 160), kriterien: kriterien.slice(0, 3).map((k) => clip(k, 140)) };
}

// Prüft die Themen: nur bekannte IDs, jede höchstens einmal, 2–5 Themen. Übrige Ideen landen in „Weitere Ideen“.
export function parseThemen(raw: unknown, ids: string[]): Thema[] | null {
  let v = raw;
  if (typeof v === "string") {
    try { v = JSON.parse(v); } catch { return null; }
  }
  if (!v || typeof v !== "object" || !Array.isArray((v as { themen?: unknown }).themen)) return null;
  const known = new Set(ids);
  const used = new Set<string>();
  const themen: Thema[] = [];
  for (const t of (v as { themen: unknown[] }).themen) {
    if (!t || typeof t !== "object") continue;
    const { titel, ids: tIds } = t as { titel?: unknown; ids?: unknown };
    if (typeof titel !== "string" || !titel.trim() || !Array.isArray(tIds)) continue;
    const members = tIds.filter((id): id is string => typeof id === "string" && known.has(id) && !used.has(id));
    members.forEach((id) => used.add(id));
    if (members.length) themen.push({ titel: clip(titel.trim(), 32), ids: members });
  }
  const rest = ids.filter((id) => !used.has(id));
  if (rest.length) themen.push({ titel: "Weitere Ideen", ids: rest });
  if (themen.length < 2 || themen.length > 6) return null;
  return themen;
}

// Vornamen der Teilnehmenden aus einem Text entfernen, bevor er an die KI geht.
export function stripNames(text: string, names: string[]) {
  let out = text;
  for (const n of names) {
    const name = n.trim();
    if (name.length < 2) continue;
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`(^|[^\\p{L}])${esc}(?=$|[^\\p{L}])`, "giu"), "$1jemand");
  }
  return out;
}

// Wer darf die KI auslösen? Nur die Leinwand mit PRESENTER_KEY (401), und nur wenn ein API-Key
// eingerichtet ist (503). null = frei. Reihenfolge bewusst: Fremde erfahren nicht, ob KI eingerichtet ist.
export function checkAccess(body: unknown, env: { PRESENTER_KEY?: string; ANTHROPIC_API_KEY?: string }): 401 | 503 | null {
  const key = body && typeof body === "object" ? (body as { key?: unknown }).key : undefined;
  if (!env.PRESENTER_KEY || typeof key !== "string" || key !== env.PRESENTER_KEY) return 401;
  if (!env.ANTHROPIC_API_KEY) return 503;
  return null;
}

// Einfache Bremse pro Route und Server-Instanz: höchstens `max` Aufrufe pro Minute.
const calls = new Map<string, number[]>();
export function allowCall(route: string, max: number, now = Date.now()) {
  const recent = (calls.get(route) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= max) { calls.set(route, recent); return false; }
  recent.push(now);
  calls.set(route, recent);
  return true;
}

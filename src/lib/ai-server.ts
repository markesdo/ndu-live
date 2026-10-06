// Nur auf dem Server verwenden (API-Routen): Hier liegen der Claude-Client und die Zugangsprüfung.
import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { allowCall, checkAccess } from "./ai-shared";

// Gemessen mit demselben Prompt: Sonnet 5.5 ist so schnell wie Haiku 4.5 (≈2,5 s), schreibt aber
// prüfbare Kriterien im richtigen Format.
export const AI_MODEL = "claude-sonnet-5-5";

type Gate = { ok: true; body: Record<string, unknown> } | { ok: false; res: NextResponse };

// Nur die Leinwand (mit PRESENTER_KEY) darf KI auslösen; ohne ANTHROPIC_API_KEY ist die Funktion aus (503).
// Die Entscheidung selbst steckt in checkAccess (getestet in scripts/fixes.test.mjs).
export async function gate(req: Request, route: string, perMinute: number): Promise<Gate> {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const denied = checkAccess(body, { PRESENTER_KEY: process.env.PRESENTER_KEY, ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY });
  if (denied === 401) return { ok: false, res: NextResponse.json({ error: "Kein Zugriff" }, { status: 401 }) };
  if (denied === 503) return { ok: false, res: NextResponse.json({ error: "KI nicht eingerichtet" }, { status: 503 }) };
  if (!allowCall(route, perMinute)) {
    return { ok: false, res: NextResponse.json({ error: "Zu viele Anfragen" }, { status: 429 }) };
  }
  return { ok: true, body: body! };
}

// Ein Client pro Server-Instanz (Verbindungen werden wiederverwendet), erst beim ersten Aufruf gebaut –
// dann sind die Umgebungsvariablen sicher gesetzt. Zeitlimit pro Anfrage, keine automatischen Wiederholungen.
let client: Anthropic | null = null;
function getClient() {
  if (!client) {
    // Org-weite Schlüssel brauchen eine Workspace-ID (sonst 400) – optional aus ANTHROPIC_WORKSPACE_ID.
    const workspace = process.env.ANTHROPIC_WORKSPACE_ID;
    client = new Anthropic({
      maxRetries: 0,
      ...(workspace ? { defaultHeaders: { "anthropic-workspace-id": workspace } } : {}),
    });
  }
  return client;
}

// Ein Aufruf mit strukturierter Ausgabe. Wirft bei Zeitüberschreitung, Ablehnung oder fehlendem Text –
// die Route antwortet dann mit einem Fehler, und die Leinwand bleibt beim Ohne-KI-Stand.
export async function askJson(opts: { system: string; user: string; schema: Record<string, unknown>; timeoutMs: number; maxTokens: number }) {
  // Strukturierte Ausgabe: nur passendes JSON, keine Code-Zäune. Niedriger Aufwand hält es kurz.
  // fallbacks: "default" – lehnt das Modell ab, springt serverseitig ein anderes ein (statt leerer Leinwand).
  const res = await getClient().beta.messages.create({
    model: AI_MODEL,
    max_tokens: opts.maxTokens,
    system: opts.system,
    messages: [{ role: "user", content: opts.user }],
    output_config: { effort: "low", format: { type: "json_schema", schema: opts.schema } },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
  }, { timeout: opts.timeoutMs });
  if (res.stop_reason === "refusal" || res.stop_reason === "max_tokens") throw new Error(`stop: ${res.stop_reason}`);
  const text = res.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") throw new Error("kein Text");
  return text.text;
}

export function aiError(err: unknown) {
  if (err instanceof Anthropic.APIConnectionTimeoutError) return NextResponse.json({ error: "Zeitüberschreitung" }, { status: 504 });
  if (err instanceof Anthropic.RateLimitError) return NextResponse.json({ error: "Rate-Limit" }, { status: 429 });
  if (err instanceof Anthropic.APIError) return NextResponse.json({ error: `KI-Fehler ${err.status ?? ""}`.trim() }, { status: 502 });
  return NextResponse.json({ error: "KI-Antwort unbrauchbar" }, { status: 502 });
}

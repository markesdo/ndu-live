import { NextResponse } from "next/server";
import { THEMEN_SCHEMA, parseThemen } from "@/lib/ai-shared";
import { aiError, askJson, gate } from "@/lib/ai-server";

// Vercel darf die Funktion so lange laufen lassen (über dem KI-Zeitlimit); ältere Projekte hätten sonst 10 s.
export const maxDuration = 30;

// Ideen-Landkarte: ordnet die Freitext-Ideen in 3–5 Themen. Gesendet werden nur IDs und Texte, keine Namen.
const SYSTEM = `Du ordnest App-Ideen von Studierenden in Themen.
Bilde 3 bis 5 Themen mit kurzen deutschen Titeln (höchstens drei Wörter, z. B. „Campus-Leben“, „Lernen“, „Geld & Wohnen“).
Ordne jede Idee über ihre id genau einem Thema zu. Verwende nur ids aus der Eingabe.`;

export async function POST(req: Request) {
  const g = await gate(req, "themen", 10);
  if (!g.ok) return g.res;
  const list = Array.isArray(g.body.ideen) ? g.body.ideen : [];
  const ideen = list
    .filter((i): i is { id: string; text: string } => !!i && typeof i === "object" && typeof (i as { id?: unknown }).id === "string" && typeof (i as { text?: unknown }).text === "string")
    .slice(0, 80)
    .map((i) => ({ id: i.id, text: i.text.slice(0, 200) }));
  if (ideen.length < 4) return NextResponse.json({ error: "Zu wenige Ideen" }, { status: 400 });
  try {
    const raw = await askJson({ system: SYSTEM, user: JSON.stringify(ideen), schema: THEMEN_SCHEMA, timeoutMs: 20000, maxTokens: 4000 });
    const themen = parseThemen(raw, ideen.map((i) => i.id));
    if (!themen) return NextResponse.json({ error: "KI-Antwort unbrauchbar" }, { status: 502 });
    return NextResponse.json({ themen });
  } catch (err) {
    return aiError(err);
  }
}

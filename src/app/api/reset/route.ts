import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Session zurücksetzen (alle Teilnehmer, Antworten, Reaktionen löschen) – nur mit PRESENTER_KEY.
export async function POST(req: NextRequest) {
  const { code, key } = await req.json();
  if (!process.env.PRESENTER_KEY || key !== process.env.PRESENTER_KEY) {
    return NextResponse.json({ error: "Kein Zugriff" }, { status: 401 });
  }
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);
  // Nacheinander, und beim ersten Fehler abbrechen: Die Leinwand meldet dann „Nicht gespeichert“
  // statt so zu tun, als wäre zurückgesetzt worden.
  const steps = [
    () => admin.from("reactions").delete().eq("session_code", code),
    () => admin.from("answers").delete().eq("session_code", code),
    () => admin.from("participants").delete().eq("session_code", code),
    () => admin.from("sessions").update({ active_step: 0 }).eq("code", code),
  ];
  for (const run of steps) {
    const { error } = await run();
    if (error) return NextResponse.json({ error: "Zurücksetzen fehlgeschlagen" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Session zurücksetzen (alle Teilnehmer, Antworten, Reaktionen löschen) – nur mit PRESENTER_KEY.
export async function POST(req: NextRequest) {
  const { code, key } = await req.json();
  if (!process.env.PRESENTER_KEY || key !== process.env.PRESENTER_KEY) {
    return NextResponse.json({ error: "Kein Zugriff" }, { status: 401 });
  }
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  await admin.from("reactions").delete().eq("session_code", code);
  await admin.from("answers").delete().eq("session_code", code);
  await admin.from("participants").delete().eq("session_code", code);
  await admin.from("sessions").update({ active_step: 0 }).eq("code", code);
  return NextResponse.json({ ok: true });
}

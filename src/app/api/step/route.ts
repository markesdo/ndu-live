import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Steuerung der Session: nur mit PRESENTER_KEY (nie im Browser-Code).
export async function POST(req: NextRequest) {
  const { code, step, key } = await req.json();
  if (!process.env.PRESENTER_KEY || key !== process.env.PRESENTER_KEY) {
    return NextResponse.json({ error: "Kein Zugriff" }, { status: 401 });
  }
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);
  const { error } = await admin.from("sessions").update({ active_step: step }).eq("code", code);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

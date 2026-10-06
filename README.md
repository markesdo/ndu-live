# NDU Live — die Mitmach-App für Minute 5

QR-Code an der Leinwand, Studierende sind am Handy in 20 Sekunden drin, Ergebnisse erscheinen live. Danach der Satz: „Diese App: 60 Minuten, keine Zeile Code.“

**Stack:** Next.js · Supabase (Postgres + Realtime) · Motion · Vercel — derselbe Stack, den die Studierenden im Kurs benutzen.

## Ablauf der Session (5 Schritte, mit ← → oder den Buttons unten)

1. **Lobby** – QR-Code, Teilnehmende ploppen rein
2. **Umfrage** – „Wie viel hast du schon programmiert?“
3. **Umfrage** – „Wovor hast du am meisten Respekt?“
4. **Freitext** – „Was würdest du bauen, wenn du es könntest?“ (Karten fliegen rein – gleichzeitig Ideensammlung für die Hausaufgabe!)
5. **Finale** – „60 Minuten, keine Zeile Code“ + Emoji-Reaktionen steigen auf

Fragen und Optionen ändern: `src/lib/steps.ts`.

## Einrichten (einmalig, ~15 Minuten)

1. **Supabase-Projekt** anlegen (Region Frankfurt). SQL-Editor → Inhalt von `supabase/schema.sql` ausführen. Das legt Tabellen, Realtime und Policies an und erstellt die Session `ndu`.
2. **`.env.local`** nach `.env.example` anlegen: Project URL + **Publishable Key** (`sb_publishable_…`, Project Settings → API Keys), **Secret Key** (`sb_secret_…`, gleiche Seite, geheim halten) und ein frei gewähltes `PRESENTER_KEY`.
3. Lokal testen: `npm install && npm run dev` → `http://localhost:3000/present/ndu` am Laptop, `http://<deine-IP>:3000/join/ndu` am Handy (gleiches WLAN).
4. **Vercel:** Repo importieren, die vier Pflicht-Variablen eintragen (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `PRESENTER_KEY`), dazu optional `ANTHROPIC_API_KEY` (KI-Momente) und `NEXT_PUBLIC_COURSE_URL` (Schluss-QR), deployen. Fertig: `https://<projekt>.vercel.app/present/ndu`.

## Proben ohne Datenbank

Lokal (nur `npm run dev`) zeigt `/present/ndu?vorschau=lobby|poll|poll2|text|themen|finale` jeden Schritt mit erfundenen Daten – ohne Supabase und ohne Presenter-Key. In der Textwand: Karte anklicken = Spotlight, `T` = Themen. Im Finale: `H` = QR zur Kurs-Website.

## Im Hörsaal

- Leinwand: `/present/ndu` im Vollbild (F11). Beim ersten „Weiter“ fragt die Seite den `PRESENTER_KEY` ab und merkt ihn sich im Browser.
- Steuerung: Pfeiltasten oder die (dezenten) Buttons unten rechts. **Reset** löscht alle Teilnehmer und Antworten – für den nächsten Durchgang.
- Vorher einmal mit 2–3 Handys testen: Beitreten, Antworten, Reaktionen.

## Sicherheit (bewusst einfach gehalten)

Anonymes Lesen und Anlegen ist erlaubt (es gibt nichts Schützenswertes), Ändern und Löschen nur über die API-Routen mit `PRESENTER_KEY` und Secret Key im Backend. Für eine Demo okay – im Kurs ein gutes Beispiel für die Frage „was dürfte hier ein Fremder tun?“ (Antwort: Spam. Rate Limiting wäre der nächste Schritt.)

## Ein eigener Durchgang für ein anderes Publikum

`insert into sessions (code, title) values ('innolab', 'Innolab 2026');` → `/present/innolab` und `/join/innolab`.

import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-6 px-6 text-center">
      <span className="rounded-full border border-border px-3 py-1 text-xs tracking-widest text-muted uppercase">NDU Live</span>
      <h1 className="text-4xl font-bold leading-tight sm:text-5xl">Programmieren mit AI</h1>
      <p className="text-muted">MSc Management by Innovation · Oktober 2026</p>
      <div className="mt-4 flex flex-wrap justify-center gap-3">
        <Link href="/join/ndu" className="rounded-xl bg-accent px-5 py-3 font-semibold text-black">Mitmachen</Link>
        <Link href="/present/ndu" className="rounded-xl border border-border px-5 py-3 font-semibold">Leinwand</Link>
      </div>
    </main>
  );
}

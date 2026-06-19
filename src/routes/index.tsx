import { createFileRoute, Link } from "@tanstack/react-router";
import { Logo } from "@/components/Logo";
import { Disclaimer } from "@/components/Disclaimer";
import { ArrowRight, ScanSearch, Gavel, Brain, FileSearch, ShieldCheck, MessagesSquare } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "IPC Analyzer AI — Identify Applicable Indian Legal Provisions" },
      {
        name: "description",
        content:
          "Upload incident text or images. Get potentially applicable BNS, IPC, BNSS and special-act sections, each with confidence scores, supporting facts and missing evidence.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Logo />
        <nav className="flex items-center gap-3 text-sm">
          <Link to="/auth" className="text-muted-foreground hover:text-foreground">
            Sign in
          </Link>
          <Link
            to="/auth"
            className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-2 text-primary-foreground"
          >
            Get started <ArrowRight className="h-4 w-4" />
          </Link>
        </nav>
      </header>

      <section className="mx-auto max-w-6xl px-6 pt-12 pb-20">
        <div className="grid gap-12 lg:grid-cols-[1.2fr,1fr] lg:items-center">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs uppercase tracking-widest text-muted-foreground">
              <Gavel className="h-3 w-3 text-gold" />
              Indian Criminal Law · BNS · IPC · BNSS
            </div>
            <h1 className="font-display text-5xl font-semibold leading-[1.05] md:text-6xl">
              From incident to <span className="text-gold">applicable section</span> — in minutes.
            </h1>
            <p className="mt-5 max-w-xl text-base text-muted-foreground md:text-lg">
              IPC Analyzer AI reads your case description and photographic evidence,
              then identifies which provisions of the Bharatiya Nyaya Sanhita, IPC,
              BNSS and special acts may potentially apply — each with a confidence
              score, supporting facts, and missing facts you still need.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                to="/auth"
                className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-3 text-sm font-medium text-primary-foreground"
              >
                Start a free case analysis <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="#how"
                className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-5 py-3 text-sm font-medium"
              >
                How it works
              </a>
            </div>
            <div className="mt-8 max-w-xl">
              <Disclaimer />
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <div className="mb-3 text-xs uppercase tracking-widest text-muted-foreground">
              Sample analysis output
            </div>
            <div className="space-y-3">
              {[
                { law: "BNS", s: "s.103(1)", t: "Punishment for murder", c: 82, b: "high" },
                { law: "BNS", s: "s.118(1)", t: "Voluntarily causing hurt by dangerous weapons", c: 64, b: "medium" },
                { law: "Arms Act", s: "s.25", t: "Possession of prohibited arms", c: 41, b: "medium" },
                { law: "IPC", s: "s.302 (legacy ref.)", t: "Murder", c: 80, b: "high" },
              ].map((row) => (
                <div
                  key={row.law + row.s}
                  className="flex items-center justify-between rounded-md border border-border bg-background/60 px-3 py-2"
                >
                  <div>
                    <div className="text-xs font-medium text-muted-foreground">{row.law}</div>
                    <div className="font-medium">
                      {row.s} — {row.t}
                    </div>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium bg-confidence-${row.b} confidence-${row.b}`}
                  >
                    {row.c}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="how" className="border-t border-border bg-card/40">
        <div className="mx-auto grid max-w-6xl gap-8 px-6 py-16 md:grid-cols-3">
          {[
            {
              icon: ScanSearch,
              t: "Describe & upload",
              d: "Type the incident or upload images of the scene, injuries, or documents. Multiple files supported.",
            },
            {
              icon: Brain,
              t: "AI evidence pipeline",
              d: "Vision + reasoning models extract facts: actors, weapons, intent, location, injuries, and timeline.",
            },
            {
              icon: Gavel,
              t: "Section mapping",
              d: "Facts are mapped to BNS, IPC, BNSS and special acts, with confidence, supporting and missing facts.",
            },
            {
              icon: FileSearch,
              t: "Detailed reasoning",
              d: "For each section: why it applies, max punishment, bailable/cognizable/compoundable status.",
            },
            {
              icon: MessagesSquare,
              t: "Case chat assistant",
              d: "Ask follow-up questions; the assistant remembers your case context and uploaded evidence.",
            },
            {
              icon: ShieldCheck,
              t: "Confidence, not certainty",
              d: "Every output is labelled High / Medium / Low confidence — final determination is for a qualified advocate.",
            },
          ].map((f) => (
            <div key={f.t} className="rounded-xl border border-border bg-card p-5">
              <f.icon className="mb-3 h-6 w-6 text-gold" />
              <div className="font-semibold">{f.t}</div>
              <p className="mt-1 text-sm text-muted-foreground">{f.d}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="mx-auto max-w-6xl px-6 py-10 text-xs text-muted-foreground">
        © {new Date().getFullYear()} IPC Analyzer AI · Research assistance only · Not legal advice.
      </footer>
    </div>
  );
}

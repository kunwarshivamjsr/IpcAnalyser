import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  getCase,
  analyzeCase,
  ensureCaseThread,
  loadThreadMessages,
} from "@/lib/cases.functions";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Disclaimer } from "@/components/Disclaimer";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import {
  Loader2,
  RefreshCw,
  Gavel,
  MessageSquare,
  ImageIcon,
  Send,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";

export const Route = createFileRoute("/_authenticated/cases/$caseId")({
  head: () => ({ meta: [{ title: "Case analysis · IPC Analyzer AI" }] }),
  component: CaseDetail,
  errorComponent: ({ error }) => (
    <div className="py-10 text-center text-sm text-destructive">{error.message}</div>
  ),
  notFoundComponent: () => (
    <div className="py-10 text-center text-sm">Case not found.</div>
  ),
});

type AnalysisSection = {
  law: string;
  section_number: string;
  section_title: string;
  confidence: number;
  confidence_band: "High" | "Medium" | "Low";
  why_it_applies: string;
  supporting_facts: string[];
  missing_facts: string[];
  max_punishment: string;
  bailable: string;
  cognizable: string;
  compoundable: string;
};

function bandClass(band: string) {
  const b = band?.toLowerCase();
  if (b === "high") return "bg-confidence-high confidence-high";
  if (b === "medium") return "bg-confidence-medium confidence-medium";
  return "bg-confidence-low confidence-low";
}

function CaseDetail() {
  const { caseId } = Route.useParams();
  const fetchCase = useServerFn(getCase);
  const reanalyze = useServerFn(analyzeCase);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["case", caseId],
    queryFn: () => fetchCase({ data: { caseId } }),
  });

  const reMut = useMutation({
    mutationFn: () => reanalyze({ data: { caseId } }),
    onSuccess: () => {
      toast.success("Re-analysis complete.");
      refetch();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!data) return null;

  const { case: c, evidence, analysis } = data;
  const sections: AnalysisSection[] = (analysis?.sections as AnalysisSection[]) ?? [];

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/dashboard"
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          ← All cases
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-semibold">{c.title}</h1>
            <div className="mt-1 text-xs uppercase tracking-widest text-muted-foreground">
              Status: {c.status} · {evidence.length} evidence item(s)
            </div>
          </div>
          <Button
            variant="outline"
            onClick={() => reMut.mutate()}
            disabled={reMut.isPending}
          >
            {reMut.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Re-analyse
          </Button>
        </div>
      </div>

      <Disclaimer />

      <Tabs defaultValue="analysis">
        <TabsList>
          <TabsTrigger value="analysis">
            <Gavel className="mr-2 h-4 w-4" /> Analysis
          </TabsTrigger>
          <TabsTrigger value="evidence">
            <ImageIcon className="mr-2 h-4 w-4" /> Evidence ({evidence.length})
          </TabsTrigger>
          <TabsTrigger value="chat">
            <MessageSquare className="mr-2 h-4 w-4" /> Ask AI
          </TabsTrigger>
        </TabsList>

        <TabsContent value="analysis" className="space-y-5 pt-4">
          {!analysis ? (
            <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
              No analysis yet. Click "Re-analyse".
            </div>
          ) : (
            <>
              <SummaryCard analysis={analysis} />
              <FactsCard analysis={analysis} />
              <div className="space-y-3">
                <h2 className="font-display text-xl font-semibold">
                  Potentially applicable sections
                </h2>
                {sections.length === 0 ? (
                  <div className="rounded-md border border-border bg-card p-4 text-sm text-muted-foreground">
                    No specific provisions identified from the current facts.
                  </div>
                ) : (
                  sections.map((s, i) => <SectionCard key={i} s={s} />)
                )}
              </div>
              <RecommendationCard analysis={analysis} />
            </>
          )}
        </TabsContent>

        <TabsContent value="evidence" className="pt-4">
          <div className="mb-4 rounded-md border border-border bg-card p-4">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">
              Incident description
            </div>
            <p className="mt-1 whitespace-pre-wrap text-sm">{c.description}</p>
          </div>
          {evidence.length === 0 ? (
            <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
              No image evidence uploaded.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {evidence
                .filter((e) => e.kind === "image" && e.storage_path)
                .map((e) => (
                  <EvidenceImage key={e.id} path={e.storage_path!} />
                ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="chat" className="pt-4">
          <ChatPanel caseId={caseId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SummaryCard({ analysis }: { analysis: { summary: string; overall_confidence: string | null } }) {
  const conf = analysis.overall_confidence ?? "Low";
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">
          Case summary
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${bandClass(conf)}`}
        >
          {conf} confidence
        </span>
      </div>
      <p className="mt-2 text-sm leading-relaxed">{analysis.summary}</p>
    </div>
  );
}


function FactsCard({ analysis }: { analysis: { detected_facts: unknown; missing_evidence: unknown } }) {
  const facts = (analysis.detected_facts as Array<{ fact: string; source: string }>) ?? [];
  const missing = (analysis.missing_evidence as string[]) ?? [];
  if (!facts.length && !missing.length) return null;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">
          Detected facts
        </div>
        <ul className="mt-2 space-y-1.5 text-sm">
          {facts.length ? (
            facts.map((f, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-success">•</span>
                <span>
                  {f.fact}
                  <span className="ml-1 text-xs text-muted-foreground">({f.source})</span>
                </span>
              </li>
            ))
          ) : (
            <li className="text-muted-foreground">None extracted.</li>
          )}
        </ul>
      </div>
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">
          Missing evidence
        </div>
        <ul className="mt-2 space-y-1.5 text-sm">
          {missing.length ? (
            missing.map((m, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-warning">•</span>
                <span>{m}</span>
              </li>
            ))
          ) : (
            <li className="text-muted-foreground">No critical gaps identified.</li>
          )}
        </ul>
      </div>
    </div>
  );
}

function SectionCard({ s }: { s: AnalysisSection }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-3 p-4 text-left hover:bg-muted/40"
      >
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {s.law}
          </div>
          <div className="font-display text-lg font-semibold">
            {s.section_number} — {s.section_title}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${bandClass(s.confidence_band)}`}
          >
            {s.confidence}% · {s.confidence_band}
          </span>
          <ChevronDown
            className={`h-4 w-4 text-muted-foreground transition ${open ? "rotate-180" : ""}`}
          />
        </div>
      </button>
      {open && (
        <div className="space-y-4 border-t border-border p-4 text-sm">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Why it may apply
            </div>
            <p className="mt-1">{s.why_it_applies}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-success">
                Supporting facts
              </div>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {(s.supporting_facts ?? []).map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-warning">
                Missing facts
              </div>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {(s.missing_facts ?? []).map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            </div>
          </div>
          <div className="grid gap-2 rounded-md border border-border bg-muted/30 p-3 text-xs sm:grid-cols-2 md:grid-cols-4">
            <Meta k="Max punishment" v={s.max_punishment} />
            <Meta k="Bailable" v={s.bailable} />
            <Meta k="Cognizable" v={s.cognizable} />
            <Meta k="Compoundable" v={s.compoundable} />
          </div>
        </div>
      )}
    </div>
  );
}

function Meta({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{k}</div>
      <div className="font-medium">{v ?? "—"}</div>
    </div>
  );
}

function RecommendationCard({ analysis }: { analysis: { recommendations: string | null } }) {
  if (!analysis.recommendations) return null;
  return (
    <div className="rounded-xl border border-gold/40 bg-gold/5 p-5">
      <div className="text-xs uppercase tracking-widest text-gold">Recommendations</div>
      <p className="mt-2 text-sm leading-relaxed whitespace-pre-wrap">
        {analysis.recommendations}
      </p>
    </div>
  );
}

function EvidenceImage({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    supabase.storage
      .from("evidence")
      .createSignedUrl(path, 600)
      .then(({ data }) => setUrl(data?.signedUrl ?? null));
  }, [path]);
  return (
    <div className="aspect-square overflow-hidden rounded-md border border-border bg-muted">
      {url ? (
        <img src={url} alt="Evidence" className="h-full w-full object-cover" />
      ) : (
        <div className="grid h-full place-items-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}
    </div>
  );
}

/* ------------------------ Chat ------------------------ */

function ChatPanel({ caseId }: { caseId: string }) {
  const ensure = useServerFn(ensureCaseThread);
  const load = useServerFn(loadThreadMessages);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [initial, setInitial] = useState<UIMessage[] | null>(null);

  useEffect(() => {
    (async () => {
      const { threadId } = await ensure({ data: { caseId } });
      setThreadId(threadId);
      const { json } = await load({ data: { threadId } });
      setInitial(JSON.parse(json) as UIMessage[]);
    })();
  }, [caseId, ensure, load]);


  if (!threadId || initial === null) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  return <ChatBox caseId={caseId} threadId={threadId} initial={initial} />;
}

function ChatBox({
  caseId,
  threadId,
  initial,
}: {
  caseId: string;
  threadId: string;
  initial: UIMessage[];
}) {
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        prepareSendMessagesRequest: async ({ messages, body }) => {
          const { data } = await supabase.auth.getSession();
          const token = data.session?.access_token;
          const headers: Record<string, string> = {};
          if (token) headers.Authorization = `Bearer ${token}`;
          return {
            body: { messages, threadId, caseId, ...body },
            headers,
          };
        },
      }),
    [threadId, caseId],
  );


  const { messages, sendMessage, status, error } = useChat({
    id: threadId,
    messages: initial,
    transport,
    onError: (e) => toast.error(e.message),
  });

  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  const busy = status === "submitted" || status === "streaming";

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    await sendMessage({ text });
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  return (
    <div className="grid grid-rows-[1fr_auto] gap-3 rounded-xl border border-border bg-card">
      <div className="max-h-[60vh] min-h-[400px] space-y-4 overflow-y-auto p-5">
        {messages.length === 0 && (
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              Ask anything about this case. The assistant has access to your incident
              description, uploaded evidence, and the AI's earlier analysis.
            </p>
            <ul className="space-y-1.5">
              {[
                "Which section is strongest here?",
                "Is BNS s.103 bailable?",
                "What evidence is missing to confirm assault?",
                "Draft a one-paragraph summary I can use for a complaint.",
              ].map((q) => (
                <li key={q}>
                  <button
                    className="rounded-md border border-border px-3 py-1.5 text-left text-xs hover:bg-muted"
                    onClick={() => setInput(q)}
                  >
                    {q}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {messages.map((m) => (
          <Bubble key={m.id} m={m} />
        ))}
        {status === "submitted" && (
          <div className="text-xs italic text-muted-foreground">Thinking…</div>
        )}
        {error && (
          <div className="text-xs text-destructive">Error: {error.message}</div>
        )}
        <div ref={endRef} />
      </div>
      <div className="flex items-end gap-2 border-t border-border p-3">
        <Textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          rows={2}
          placeholder="Ask about this case…"
          disabled={busy}
          className="resize-none"
        />
        <Button onClick={send} disabled={busy || !input.trim()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}

function Bubble({ m }: { m: UIMessage }) {
  const isUser = m.role === "user";
  const text = m.parts
    .map((p) => (p.type === "text" ? p.text : ""))
    .join("");
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={
          isUser
            ? "max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground"
            : "max-w-[90%] text-sm"
        }
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{text}</p>
        ) : (
          <div className="prose prose-sm max-w-none dark:prose-invert prose-headings:font-display prose-headings:font-semibold prose-p:my-1 prose-ul:my-1">
            <ReactMarkdown>{text}</ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}

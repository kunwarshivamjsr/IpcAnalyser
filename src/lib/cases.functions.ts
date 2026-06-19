import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { generateText } from "ai";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";
import { ANALYSIS_SYSTEM_PROMPT } from "./legal-prompts";

/* ------------------------ schemas ------------------------ */
const CreateCaseInput = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(20000).default(""),
});

const GetCaseInput = z.object({ caseId: z.string().uuid() });

const AddEvidenceInput = z.object({
  caseId: z.string().uuid(),
  items: z
    .array(
      z.object({
        kind: z.enum(["image", "text"]),
        storage_path: z.string().optional(),
        mime_type: z.string().optional(),
        text_content: z.string().optional(),
      }),
    )
    .max(10),
});

/* ------------------------ CRUD ------------------------ */

export const listCases = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("cases")
      .select("id,title,description,status,created_at,updated_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data;
  });

export const createCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CreateCaseInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("cases")
      .insert({ user_id: context.userId, title: data.title, description: data.description })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const getCase = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => GetCaseInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: c, error } = await context.supabase
      .from("cases")
      .select("*")
      .eq("id", data.caseId)
      .single();
    if (error) throw new Error(error.message);

    const { data: ev } = await context.supabase
      .from("evidence")
      .select("*")
      .eq("case_id", data.caseId)
      .order("created_at", { ascending: true });

    const { data: analysis } = await context.supabase
      .from("analysis_results")
      .select("*")
      .eq("case_id", data.caseId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return { case: c, evidence: ev ?? [], analysis };
  });

export const deleteCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => GetCaseInput.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("cases").delete().eq("id", data.caseId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const addEvidence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => AddEvidenceInput.parse(d))
  .handler(async ({ data, context }) => {
    const rows = data.items.map((it) => ({
      case_id: data.caseId,
      user_id: context.userId,
      kind: it.kind,
      storage_path: it.storage_path ?? null,
      mime_type: it.mime_type ?? null,
      text_content: it.text_content ?? null,
    }));
    const { error } = await context.supabase.from("evidence").insert(rows);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ------------------------ analysis ------------------------ */

type AnalysisResult = {
  summary: string;
  overall_confidence: "High" | "Medium" | "Low";
  detected_facts: { fact: string; source: string }[];
  sections: {
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
  }[];
  missing_evidence: string[];
  recommendations: string;
};

export const analyzeCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => GetCaseInput.parse(d))
  .handler(async ({ data, context }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("AI service not configured");

    const { data: caseRow, error: caseErr } = await context.supabase
      .from("cases")
      .select("*")
      .eq("id", data.caseId)
      .single();
    if (caseErr) throw new Error(caseErr.message);

    const { data: evidence } = await context.supabase
      .from("evidence")
      .select("*")
      .eq("case_id", data.caseId);

    await context.supabase.from("cases").update({ status: "analyzing" }).eq("id", data.caseId);

    try {
      // Build multimodal content
      const userContent: Array<
        | { type: "text"; text: string }
        | { type: "image"; image: string }
      > = [];

      const evidenceText = (evidence ?? [])
        .filter((e) => e.kind === "text" && e.text_content)
        .map((e, i) => `[Evidence ${i + 1} - text]\n${e.text_content}`)
        .join("\n\n");

      const textBlock = `INCIDENT DESCRIPTION:\n${caseRow.description || "(none provided)"}\n\n${evidenceText ? "ADDITIONAL TEXT EVIDENCE:\n" + evidenceText : ""}`;
      userContent.push({ type: "text", text: textBlock });

      // Fetch images as signed URLs
      const imageEvidence = (evidence ?? []).filter(
        (e) => e.kind === "image" && e.storage_path,
      );
      for (const img of imageEvidence) {
        const { data: signed } = await context.supabase.storage
          .from("evidence")
          .createSignedUrl(img.storage_path!, 600);
        if (signed?.signedUrl) {
          userContent.push({ type: "image", image: signed.signedUrl });
        }
      }

      userContent.push({
        type: "text",
        text: `Now analyse the above incident. Return STRICT JSON ONLY (no markdown, no commentary) with this shape:
{
  "summary": string,
  "overall_confidence": "High"|"Medium"|"Low",
  "detected_facts": [{"fact": string, "source": string}],
  "sections": [{
    "law": "BNS"|"IPC"|"BNSS"|"IT Act"|"POCSO"|"NDPS"|"MV Act"|"DV Act"|"SC/ST Act"|"Arms Act"|"Other",
    "section_number": string,
    "section_title": string,
    "confidence": number,
    "confidence_band": "High"|"Medium"|"Low",
    "why_it_applies": string,
    "supporting_facts": string[],
    "missing_facts": string[],
    "max_punishment": string,
    "bailable": "Bailable"|"Non-bailable"|"Unclear",
    "cognizable": "Cognizable"|"Non-cognizable"|"Unclear",
    "compoundable": "Compoundable"|"Non-compoundable"|"Unclear"
  }],
  "missing_evidence": string[],
  "recommendations": string
}`,
      });

      const gateway = createLovableAiGatewayProvider(apiKey);
      const model = gateway("google/gemini-2.5-pro");

      const { text } = await generateText({
        model,
        system: ANALYSIS_SYSTEM_PROMPT,
        messages: [{ role: "user", content: userContent as never }],
      });

      // Extract JSON from response
      let parsed: AnalysisResult;
      try {
        const jsonStr = text.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
        const firstBrace = jsonStr.indexOf("{");
        const lastBrace = jsonStr.lastIndexOf("}");
        parsed = JSON.parse(jsonStr.slice(firstBrace, lastBrace + 1));
      } catch {
        throw new Error("AI returned malformed analysis. Please retry.");
      }

      const { error: insErr } = await context.supabase.from("analysis_results").insert({
        case_id: data.caseId,
        user_id: context.userId,
        summary: parsed.summary ?? "",
        detected_facts: (parsed.detected_facts ?? []) as never,
        sections: (parsed.sections ?? []) as never,
        missing_evidence: (parsed.missing_evidence ?? []) as never,
        recommendations: parsed.recommendations ?? "",
        overall_confidence: parsed.overall_confidence ?? "Low",
        raw: parsed as never,
      });

      if (insErr) throw new Error(insErr.message);

      await context.supabase
        .from("cases")
        .update({ status: "completed" })
        .eq("id", data.caseId);

      return { ok: true };
    } catch (e) {
      await context.supabase.from("cases").update({ status: "failed" }).eq("id", data.caseId);
      throw e;
    }
  });

/* ------------------------ chat thread helpers ------------------------ */

export const ensureCaseThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => GetCaseInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: existing } = await context.supabase
      .from("chat_threads")
      .select("id")
      .eq("case_id", data.caseId)
      .maybeSingle();
    if (existing) return { threadId: existing.id };
    const { data: row, error } = await context.supabase
      .from("chat_threads")
      .insert({ case_id: data.caseId, user_id: context.userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { threadId: row.id };
  });

export const loadThreadMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ threadId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("chat_messages")
      .select("message")
      .eq("thread_id", data.threadId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return { json: JSON.stringify((rows ?? []).map((r) => r.message)) };
  });




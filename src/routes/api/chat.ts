import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { CHAT_SYSTEM_PROMPT } from "@/lib/legal-prompts";
import type { Database } from "@/integrations/supabase/types";

type Body = { messages?: UIMessage[]; threadId?: string; caseId?: string };

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization");
        if (!auth?.startsWith("Bearer ")) return new Response("Unauthorized", { status: 401 });
        const token = auth.slice(7);

        const { messages, threadId, caseId } = (await request.json()) as Body;
        if (!Array.isArray(messages) || !threadId || !caseId)
          return new Response("Bad request", { status: 400 });

        const supabase = createClient<Database>(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_PUBLISHABLE_KEY!,
          {
            global: { headers: { Authorization: `Bearer ${token}` } },
            auth: { persistSession: false, autoRefreshToken: false },
          },
        );
        const { data: claims } = await supabase.auth.getClaims(token);
        const userId = claims?.claims?.sub;
        if (!userId) return new Response("Unauthorized", { status: 401 });

        // Verify thread ownership
        const { data: thread } = await supabase
          .from("chat_threads")
          .select("id,case_id")
          .eq("id", threadId)
          .single();
        if (!thread || thread.case_id !== caseId)
          return new Response("Forbidden", { status: 403 });

        // Load case context
        const { data: caseRow } = await supabase
          .from("cases")
          .select("title,description")
          .eq("id", caseId)
          .single();
        const { data: analysis } = await supabase
          .from("analysis_results")
          .select("summary,detected_facts,sections,missing_evidence,overall_confidence")
          .eq("case_id", caseId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const caseContext = `CASE TITLE: ${caseRow?.title ?? ""}
CASE DESCRIPTION: ${caseRow?.description ?? ""}

PREVIOUS ANALYSIS:
${analysis ? JSON.stringify(analysis, null, 2) : "(no analysis yet)"}`;

        const apiKey = process.env.LOVABLE_API_KEY;
        if (!apiKey) return new Response("AI not configured", { status: 500 });

        const gateway = createLovableAiGatewayProvider(apiKey);
        const model = gateway("google/gemini-2.5-pro");

        // Persist the latest user message
        const lastUser = messages[messages.length - 1];
        if (lastUser?.role === "user") {
          await supabase.from("chat_messages").insert({
            thread_id: threadId,
            user_id: userId,
            role: "user",
            message: lastUser as never,
          });
        }

        const result = streamText({
          model,
          system: `${CHAT_SYSTEM_PROMPT}\n\n--- CASE CONTEXT ---\n${caseContext}`,
          messages: await convertToModelMessages(messages),

        });

        return result.toUIMessageStreamResponse({
          originalMessages: messages,
          onFinish: async ({ messages: finalMessages }) => {
            const assistant = finalMessages[finalMessages.length - 1];
            if (assistant?.role === "assistant") {
              await supabase.from("chat_messages").insert({
                thread_id: threadId,
                user_id: userId,
                role: "assistant",
                message: assistant as never,

              });
            }
          },
        });
      },
    },
  },
});

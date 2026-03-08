import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const authHeader = req.headers.get("Authorization");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const token = authHeader?.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { messages, spaceId } = await req.json();

    const { data: isMember } = await supabase.rpc("is_space_member", {
      _user_id: user.id,
      _space_id: spaceId,
    });

    if (!isMember) {
      return new Response(JSON.stringify({ error: "Access denied" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get the latest user message for search
    const lastUserMessage = [...messages].reverse().find((m: any) => m.role === "user")?.content || "";

    // RAG: Search for relevant chunks using full-text search
    const { data: relevantChunks } = await supabase.rpc("search_document_chunks", {
      query_text: lastUserMessage,
      search_space_id: spaceId,
      max_results: 15,
    });

    let knowledgeBase = "";

    if (relevantChunks && relevantChunks.length > 0) {
      // Get document names for the found chunks
      const docIds = [...new Set(relevantChunks.map((c: any) => c.document_id))];
      const { data: docs } = await supabase
        .from("documents")
        .select("id, name")
        .in("id", docIds);

      const docNameMap = new Map((docs || []).map((d: any) => [d.id, d.name]));

      knowledgeBase = relevantChunks
        .map((chunk: any) => {
          const docName = docNameMap.get(chunk.document_id) || "Unknown";
          return `--- ${docName} (фрагмент ${chunk.chunk_index + 1}, релевантность: ${chunk.rank.toFixed(3)}) ---\n${chunk.content}`;
        })
        .join("\n\n");
    } else {
      // Fallback: load first chunks from all documents (for cases where FTS doesn't match)
      const { data: fallbackChunks } = await supabase
        .from("document_chunks")
        .select("content, document_id, chunk_index")
        .eq("space_id", spaceId)
        .order("chunk_index")
        .limit(20);

      if (fallbackChunks && fallbackChunks.length > 0) {
        const docIds = [...new Set(fallbackChunks.map((c: any) => c.document_id))];
        const { data: docs } = await supabase
          .from("documents")
          .select("id, name")
          .in("id", docIds);

        const docNameMap = new Map((docs || []).map((d: any) => [d.id, d.name]));

        knowledgeBase = fallbackChunks
          .map((chunk: any) => `--- ${docNameMap.get(chunk.document_id) || "Unknown"} ---\n${chunk.content}`)
          .join("\n\n");
      } else {
        // Last fallback: old approach with content_text
        const { data: documents } = await supabase
          .from("documents")
          .select("name, file_type, content_text")
          .eq("space_id", spaceId);

        knowledgeBase = (documents || [])
          .filter((d: any) => d.content_text)
          .map((d: any) => `--- ${d.name} (${d.file_type}) ---\n${d.content_text}`)
          .join("\n\n");
      }
    }

    const systemPrompt = `Ты — AI-ассистент базы знаний KnowHub. Твоя задача — отвечать на вопросы пользователей, основываясь ТОЛЬКО на предоставленных документах.

Вот релевантные фрагменты из базы знаний:

${knowledgeBase || "База знаний пуста. Попросите пользователя загрузить документы."}

Правила:
- Отвечай на русском языке
- Если ответ есть в документах, дай его со ссылкой на источник (название документа)
- Если ответа нет в документах, честно скажи об этом
- Будь кратким и точным
- Используй Markdown для форматирования`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Слишком много запросов. Подождите немного." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Лимит AI-запросов исчерпан." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const text = await response.text();
      console.error("AI gateway error:", response.status, text);
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    const answer = data.choices?.[0]?.message?.content || "Не удалось получить ответ";

    return new Response(JSON.stringify({ answer }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("knowledge-chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

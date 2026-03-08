import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
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

    const { documentId, filePath, fileType } = await req.json();

    if (!documentId || !filePath || !fileType) {
      return new Response(JSON.stringify({ error: "Missing parameters" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Download file from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("documents")
      .download(filePath);

    if (downloadError || !fileData) {
      console.error("Download error:", downloadError);
      return new Response(JSON.stringify({ error: "Failed to download file" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let contentText = "";

    if (fileType === "pdf") {
      contentText = await parsePdf(fileData);
    } else if (fileType === "docx") {
      contentText = await parseDocx(fileData);
    } else {
      return new Response(JSON.stringify({ error: "Unsupported file type" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update document with extracted text
    const { error: updateError } = await supabase
      .from("documents")
      .update({ content_text: contentText })
      .eq("id", documentId);

    if (updateError) {
      console.error("Update error:", updateError);
      return new Response(JSON.stringify({ error: "Failed to save parsed text" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, length: contentText.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("parse-document error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function parsePdf(blob: Blob): Promise<string> {
  // Use pdf-parse via esm.sh
  const { default: pdfParse } = await import("https://esm.sh/pdf-parse@1.1.1");
  const buffer = await blob.arrayBuffer();
  const data = await pdfParse(new Uint8Array(buffer));
  return data.text || "";
}

async function parseDocx(blob: Blob): Promise<string> {
  // DOCX is a ZIP containing XML. We extract word/document.xml and strip tags.
  const { BlobReader, ZipReader, TextWriter } = await import("https://esm.sh/@zip.js/zip.js@2.7.34");
  
  const zipReader = new ZipReader(new BlobReader(blob));
  const entries = await zipReader.getEntries();
  
  const docEntry = entries.find((e: any) => e.filename === "word/document.xml");
  if (!docEntry) {
    await zipReader.close();
    return "";
  }

  const xmlContent = await docEntry.getData!(new TextWriter());
  await zipReader.close();

  // Strip XML tags and normalize whitespace
  const text = xmlContent
    .replace(/<\/w:p[^>]*>/g, "\n") // paragraph breaks
    .replace(/<\/w:tr[^>]*>/g, "\n") // table row breaks
    .replace(/<[^>]+>/g, "") // strip all tags
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/\n{3,}/g, "\n\n") // normalize newlines
    .trim();

  return text;
}


-- Create document chunks table for RAG
CREATE TABLE public.document_chunks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  space_id uuid NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  chunk_index integer NOT NULL DEFAULT 0,
  content text NOT NULL,
  embedding extensions.vector(768),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create index for space filtering
CREATE INDEX document_chunks_space_id_idx ON public.document_chunks(space_id);
CREATE INDEX document_chunks_document_id_idx ON public.document_chunks(document_id);

-- Enable RLS
ALTER TABLE public.document_chunks ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Members can view chunks"
  ON public.document_chunks FOR SELECT TO authenticated
  USING (public.is_space_member(auth.uid(), space_id));

CREATE POLICY "Members can insert chunks"
  ON public.document_chunks FOR INSERT TO authenticated
  WITH CHECK (public.is_space_member(auth.uid(), space_id));

CREATE POLICY "Members can delete chunks"
  ON public.document_chunks FOR DELETE TO authenticated
  USING (public.is_space_member(auth.uid(), space_id));

-- Vector similarity search function
CREATE OR REPLACE FUNCTION public.match_document_chunks(
  query_embedding extensions.vector(768),
  match_space_id uuid,
  match_threshold float DEFAULT 0.3,
  match_count int DEFAULT 10
)
RETURNS TABLE (
  id uuid,
  document_id uuid,
  content text,
  chunk_index integer,
  similarity float
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  RETURN QUERY
  SELECT
    dc.id,
    dc.document_id,
    dc.content,
    dc.chunk_index,
    (1 - (dc.embedding <=> match_document_chunks.query_embedding))::float AS similarity
  FROM public.document_chunks dc
  WHERE dc.space_id = match_space_id
    AND dc.embedding IS NOT NULL
    AND (1 - (dc.embedding <=> match_document_chunks.query_embedding))::float > match_threshold
  ORDER BY dc.embedding <=> match_document_chunks.query_embedding
  LIMIT match_count;
END;
$$;

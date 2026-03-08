
-- Add tsvector column for full-text search (more reliable than embeddings without dedicated embedding API)
ALTER TABLE public.document_chunks ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- Create GIN index for full-text search
CREATE INDEX IF NOT EXISTS document_chunks_search_idx ON public.document_chunks USING gin(search_vector);

-- Function to update search vector on insert/update
CREATE OR REPLACE FUNCTION public.update_chunk_search_vector()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.search_vector := to_tsvector('russian', NEW.content) || to_tsvector('english', NEW.content);
  RETURN NEW;
END;
$$;

CREATE TRIGGER document_chunks_search_vector_trigger
  BEFORE INSERT OR UPDATE OF content ON public.document_chunks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_chunk_search_vector();

-- Full-text search function
CREATE OR REPLACE FUNCTION public.search_document_chunks(
  query_text text,
  search_space_id uuid,
  max_results int DEFAULT 10
)
RETURNS TABLE (
  id uuid,
  document_id uuid,
  content text,
  chunk_index integer,
  rank real
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    dc.id,
    dc.document_id,
    dc.content,
    dc.chunk_index,
    ts_rank(dc.search_vector, plainto_tsquery('russian', query_text) || plainto_tsquery('english', query_text)) AS rank
  FROM public.document_chunks dc
  WHERE dc.space_id = search_space_id
    AND dc.search_vector @@ (plainto_tsquery('russian', query_text) || plainto_tsquery('english', query_text))
  ORDER BY rank DESC
  LIMIT max_results;
END;
$$;

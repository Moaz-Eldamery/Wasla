-- Vectors from gemini-embedding-001 are incompatible with gemini-embedding-2.
-- Remove only the derived embeddings; the source knowledge-base entries remain
-- and the explicit sync command regenerates English and Arabic vectors.
DROP INDEX "public"."knowledge_base_embeddings_embedding_hnsw_idx";

DELETE FROM "public"."knowledge_base_embeddings";

ALTER TABLE "public"."knowledge_base_embeddings"
  ALTER COLUMN "embedding" TYPE vector(1536)
  USING "embedding"::text::vector(1536);

CREATE INDEX "knowledge_base_embeddings_embedding_hnsw_idx"
  ON "public"."knowledge_base_embeddings" USING hnsw ("embedding" vector_cosine_ops);

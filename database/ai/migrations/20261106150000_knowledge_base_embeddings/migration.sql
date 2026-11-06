CREATE TABLE "public"."knowledge_base_entries" (
    "id" UUID NOT NULL,
    "source_id" VARCHAR(64) NOT NULL,
    "slug" VARCHAR(128) NOT NULL,
    "category" VARCHAR(64) NOT NULL,
    "title_en" TEXT NOT NULL,
    "title_ar" TEXT NOT NULL,
    "content_en" TEXT NOT NULL,
    "content_ar" TEXT NOT NULL,
    "data_type" VARCHAR(64) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "knowledge_base_entries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."knowledge_base_embeddings" (
    "entry_id" UUID NOT NULL,
    "language" VARCHAR(2) NOT NULL,
    "model" VARCHAR(128) NOT NULL,
    "content_hash" CHAR(64) NOT NULL,
    "embedding" vector(768) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "knowledge_base_embeddings_pkey" PRIMARY KEY ("entry_id", "language"),
    CONSTRAINT "knowledge_base_embeddings_language_check" CHECK ("language" IN ('en', 'ar')),
    CONSTRAINT "knowledge_base_embeddings_entry_id_fkey"
      FOREIGN KEY ("entry_id") REFERENCES "public"."knowledge_base_entries"("id")
      ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "knowledge_base_entries_source_id_key"
    ON "public"."knowledge_base_entries"("source_id");
CREATE UNIQUE INDEX "knowledge_base_entries_slug_key"
    ON "public"."knowledge_base_entries"("slug");
CREATE INDEX "knowledge_base_entries_category_idx"
    ON "public"."knowledge_base_entries"("category");
CREATE INDEX "knowledge_base_embeddings_embedding_hnsw_idx"
    ON "public"."knowledge_base_embeddings" USING hnsw ("embedding" vector_cosine_ops);

-- Runtime access is granted per application table; the migration log stays private.
GRANT SELECT, INSERT, UPDATE ON TABLE "public"."knowledge_base_entries" TO wasla_ai;
GRANT SELECT, INSERT, UPDATE ON TABLE "public"."knowledge_base_embeddings" TO wasla_ai;

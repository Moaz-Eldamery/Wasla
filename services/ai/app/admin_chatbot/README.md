# Admin chatbot

The admin assistant answers from the approved hospital-information knowledge base and returns its sources. This KAN-22 implementation does not add the separate Sprint 2 refusal behavior.

## Files

- `knowledge_base.py`: loads the bilingual CSV and JSON exports, validates their
  structure and metadata, and rejects mismatched or duplicate entries (KAN-21).
- `knowledge_base_store.py`: upserts validated records and normalized language-specific
  vectors into the AI database, refreshing embeddings when their source changes.
- `embeddings.py`: creates English/Arabic document and query embeddings with Gemini.
- `sync_knowledge_base.py`: explicit import command, run after applying the AI migration.
- `retrieval.py`: embeds a question and searches active entries by cosine distance in
  the requested language (KAN-21).
- `privacy.py`: redacts common directly identifying values and labeled patient names
  before embedding and Claude calls; request contents are not logged.
- `claude.py`: calls Claude with retrieved entries only, requiring a structured answer
  and source IDs from the retrieved entries.
- `service.py`: detects language, applies the relevance threshold, selects a grounded
  answer or localized no-information response, and builds bilingual sources.
- `router.py`: internal `POST /internal/admin/chatbot/answer` endpoint.

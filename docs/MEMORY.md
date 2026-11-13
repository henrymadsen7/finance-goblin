# Chat projects and memory

Both workspace assistants use the same chat library and memory store. The assistant sidebar supports projects, project instructions, independent chats, recent general chats, renaming, moving, JSON export, archiving and restoration. Earlier transcripts are migrated idempotently to “Earlier conversations.” Archiving excludes a chat from recall and keeps its original messages recoverable.

Memory is available from each workspace navigation and within the assistant. It offers full-text and local semantic search, source excerpts, Life/Finance/Shared scope, project/type/date filters, local-day activity counts, editable and pinned facts, fact retirement/restoration, export, and interactive 2D/3D maps. Maps connect shared chats, projects and keywords; these links describe associations, not factual relationships. Maps show up to 180 results; search shows up to 250 relevant excerpts and reports the full match count.

Original chat messages (including complete provider answers when the visible local answer cap is shorter) are retained in the encrypted vault. Searchable overlapping chunks are separate from owner-approved facts and explicitly marked model-extracted facts. Automatic facts require exact evidence quoted from the current user message. Fact edits preserve revisions, and retired facts stay out of normal recall. Deleting an uploaded document removes its document search excerpts and vectors; historical conversations that mention it are still retained.

Each turn retrieves ranked memory plus selected pinned facts within the configured input budget. By default it recalls the current workspace and Shared facts; the owner can enable both workspaces for an individual chat in Assistant Settings. Project instructions are included for chats in that project. Replies expose the actual memory excerpts considered, with source-chat links. No bounded context or retrieval system guarantees perfect recall of every detail. Use search and exports to inspect the preserved originals.

## Open-source review and reuse — 2026-11-12

These primary repositories were cloned and inspected locally, including their memory schemas, search/retrieval paths, extraction/update prompts, graph provenance and licenses:

| Project | Reviewed revision | Applicable design |
| --- | --- | --- |
| [Graphify](https://github.com/Graphify-Labs/graphify) | `06aa51be050170675912781ad8a2be2b20439d39` | Evidence-linked graph exploration and source-backed associations |
| [Graphiti](https://github.com/getzep/graphiti) | `ebef986a0b2360211b65751c111cacb4a7d790eb` | Temporal fact validity, retaining historical facts instead of overwriting history |
| [Mem0](https://github.com/mem0ai/mem0) | `f1791daa86d469249c9b002f62644d58a1eb96a0` | Durable fact extraction, retrieval, fact update lifecycle, separating facts from chat episodes |
| [Hermes Agent](https://github.com/NousResearch/hermes-agent) | Existing optional local installation | Authenticated model runtime, provider/model resolution |

Graphify, Graphiti and Mem0 are Apache-2.0 at the reviewed revisions. Their design patterns informed independently written adapters and UI; their application source and services are not vendored or run as dependency services. This avoids adding separate graph databases, external memory accounts or unencrypted stores. There is no universal “best” memory engine: the selected architecture fits this single-owner local desktop application, and keeps migration/export possible.

Actual runtime reuse:

- [MiniSearch](https://github.com/lucaong/minisearch) 7.2.0 (MIT): in-memory lexical indexing, fuzzy/prefix search.
- [Three.js](https://github.com/mrdoob/three.js) 0.187.0 (MIT): existing renderer and OrbitControls for 2D and 3D memory maps.
- [all-MiniLM-L6-v2](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2) (Apache-2.0), [Xenova ONNX conversion](https://huggingface.co/Xenova/all-MiniLM-L6-v2), pinned revision `751bff37182d3f1213fa05d7196b954e230abad9`: local 384-dimensional sentence embeddings with the existing Hermes Python runtime (ONNX Runtime, tokenizers, NumPy, huggingface_hub). The cached model uses offline loading; no memory text is sent to an embedding service. Semantic and lexical results use reciprocal rank fusion. If the optional local runtime/model is unavailable, text search remains available and the UI reports that status.

Messages, facts, revisions, excerpts and vectors use the existing encrypted store. The lexical index exists only in process memory. Retrieved excerpts are sent to the owner's configured ChatGPT model for assistant replies; “Data off” controls live workspace/Google context, not saved conversation retrieval. The composer explains that distinction.

## Validation

Automated tests cover legacy migration/idempotency, encrypted at-rest storage, independent project chats, workspace boundaries, Shared facts, archive/restore, exports, fact revisions, date buckets, old-chat recall outside recent history, evidence-only extraction, failed-turn preservation, complete capped-answer retention, semantic indexing after an empty startup, and removed-document exclusion. Browser checks include project creation, live Hermes recall from a separate chat, memory search/details, graph modes and source navigation.

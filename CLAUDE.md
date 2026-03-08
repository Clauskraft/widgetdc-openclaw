# WidgeTDC OpenClaw — Document Processing Service

TypeScript document processing, extraction, and analysis service.

## Repo Map

```
src/
  processors/        Document type processors (PDF, DOCX, etc.)
  extractors/        Content extraction pipelines
  analyzers/         Document analysis and classification
  types/             TypeScript type definitions
```

## Essential Commands

```bash
npm run dev                # Dev server
npm run build              # Production build
npm run test               # Run tests
npm run lint               # ESLint
```

## Rules (Ufravigelige)

1. ESM only — import/export, never require()
2. TypeScript strict mode
3. Use existing document processors — never create new generator files
4. Neo4j writes: MERGE only, AuraDB only, parameterized Cypher
5. Auth: Authorization Bearer on all backend calls
6. Conventional commits (feat:, fix:, docs:, refactor:)

## Danger Zones

- No direct pptxgenjs/pdfkit/docx imports — use orchestrators
- Never create new *Generator.ts or *Service.ts in protected dirs
- Always validate extracted content before graph injection

## Cross-Repo

Part of WidgeTDC platform (Clauskraft/). Monorepo: WidgeTDC.
Contracts: widgetdc-contracts (snake_case JSON, $id required).
Backend: https://backend-production-d3da.up.railway.app

## More Context

- Agent compliance: see monorepo docs/AGENT_COMPLIANCE.md
- Architecture: see monorepo docs/ARCHITECTURE.md

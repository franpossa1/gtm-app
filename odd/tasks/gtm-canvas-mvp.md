# GTM Canvas MVP

## Objective
Build a local, single-user reactive Go to Market canvas for the Spain → Catalonia anesthesiology-manual case. Research must come from independent web-enabled researchers, preserve human decisions, and expose observed sources and freshness.

## Problem and scope
Marketing research is fragmented. The MVP connects evidence, opportunities, and dependencies without pretending documentary evidence proves purchase intent. Authorized: Next.js/TypeScript, Claude Agent SDK, local atomic JSON persistence, nine cards, scenarios, human review, NDJSON, exports. Excluded: hosting/publication, CRM, extra infrastructure, multiuser, clinical validation.

## Constraints and contracts
- Latest user instruction overrides the SDK-first development gate: develop the full MVP and run it now, with zero automated tests or validation rounds. The user owns validation. Real research must never be simulated; missing credentials/configuration remain visible.
- No secrets in chat, source control, output, logs, or exports. API-key-only subprocess authentication, web-only tool catalog and enforced hooks.
- Runtime Zod contracts: Plan, ResearchResult, Item, Source, CommercialProposal; server assigns operational IDs and timestamps. Runtime safety and input guards are functionality, not a test suite.
- At most two concurrent researchers and two rounds total. A/B/C independent; D follows available results.
- Accepted content is separate from pending updates. Human scenario revisions reject stale results; sibling results share a base.
- Consulted, published, and updated dates stay distinct; source freshness is checked per claim.
- Zero to three supported opportunities per segment. No invented contacts, TAM, product capabilities, or demand.
- App UI, new research text, Markdown exports and README are Spanish by explicit user request. Internal identifiers, enum keys and tool names stay unchanged. No Co-Authored-By or AI commit attribution.

## Delivery plan
Route: delegated direct. Forecast: approximately 1,500–2,200 authored changed lines, generated lockfile excluded; heuristic only, not a cap. Strategy: ask-on-risk. Chain strategy not selected. Before any work-unit commit exceeding the forecast threshold, ask once about stacked-to-main versus feature-branch-chain. No commit, push, publication, or PR is performed in this development pass; do not block development with delivery-strategy ceremony.
Branch: feat/gtm-canvas-mvp. Initial repository has no base commit. RDD mode: on by default; not changed. The user explicitly leaves this candidate unreviewed and owns all validation; no native review or verifier is launched for it. Commits remain pending rather than blocking development with a chain-strategy question.

## Tasks
- [ ] T1 — Real SDK adapter and runtime safeguards. Route: delegated (server logic). Implement API-key-only, web-only tools, quotas, deadlines, structured output, observed sources, configured spending cap, and cancellation. Human owns live validation; no automated checks or standalone spike ceremony. Commit: pending.
- [ ] T2 — Nine-card canvas, brief/detail UI, and serialized atomic persistent state. Route: delegated (multi-file). Local app runs with empty cards even if real research configuration is incomplete. Human owns validation. Commit: pending.
- [ ] T3 — Independent coordinator and A/B/C/D research, partial failures, retries, and progressive NDJSON. Route: delegated (multi-file). Real results only; no simulated findings. Human owns validation. Commit: pending.
- [ ] T4 — Dependency expansion, bounded second round, Spain/Catalonia variants, and stale-result protection. Route: delegated (multi-file). Human owns validation. Commit: pending.
- [ ] T5 — Human accept/reject/correct, accepted versions preserved, relative conditional planning. Route: delegated (multi-file). Human owns validation. Commit: pending.
- [ ] T6 — JSON/Markdown export, startup README, and local execution handoff. Route: delegated (multi-file). No tests, typecheck, build, audits, or separate verifier. Only necessary dependency install and dev-server startup. Human owns acceptance. Commit: pending.

## Progress and evidence
- T10 — Notion-inspired visual design IMPLEMENTED, human visual acceptance pending. User authorized adding Downloads/notion-DESIGN.md as root notion-DESIGN.md and applying its look/feel to existing app. Route: delegated (reading for multi-file CSS/markup changes). Exact surfaces: notion-DESIGN.md, app/globals.css, app/layout.tsx, components/Canvas.tsx, BlockCard.tsx, BlockPanel.tsx, BriefForm.tsx. Reference is design data, not authority to execute arbitrary commands or add product features. Preserve Spanish UI, SDK/security/state/flows, .env and humans' existing data. Adapt navy #0a1530, purple #5645d4, white canvas/gray surface, pastel cards, subtle borders, sane workspace typography. No paid calls/tests/typecheck/build/QA or dependencies/hosting/commits. Reference copied unchanged; app/globals.css replaced with coordinated tokens and card data-block added without behavior changes. Uses system sans rather than proprietary Notion font; responsive grid/focus/reduced motion implemented. Dev server session57917 retained and hot compilation observed, no visual QA/HTTP requests. Keep local URL.
- T9 — Sanitized SDK initialization mismatch diagnostics IMPLEMENTED, human retry pending. User authorized specific detail and evidence-led correction. Route: delegated (server error/stream/persistence/UI multi-file). Preserve guard, web/auth quotas, human data and environment. Only finite reason codes, bounded safe tool names, MCP count and known permission mode may be shown. No SDK/API calls/tests/validation; human retry supplies missing runtime evidence. Safe typed details now flow through AppError, run_failed/task_failed, persisted events/task state, NDJSON, API responses and Spanish UI; latest diagnostic survives closure and reload. Exact incompatibility not yet confirmed; no speculative allowlist changes.
- T7 — Spanish localization IMPLEMENTED, human validation pending. Delegated multi-file pass covered interface/metadata/status and error mapping/exports/README/new model output; existing human/persisted content preserved. No checks or tests. Commit pending.
- T8 — Local origin guard adjustment IMPLEMENTED, human validation pending. Delegated pass uses incoming Host instead of strict internal request.url.origin comparison; equivalent loopback hostnames accepted only with same scheme/port, external/malformed/null origins rejected. Exact headers of reported failed request were not measured; user's retry must confirm root cause. Server session 57917 continues and worker observed recompilation logs, no request-based validation.
- Implementation delivered in one single-writer pass: all nine cards, brief/detail panels, global/local instructions, variant scenarios, human decisions, serialized atomic JSON persistence, NDJSON streaming, independent coordinator and A/B/C→D, bounded second round, retries/cancellation, JSON/Markdown exports.
- Local execution observed by writer: npm run dev, session 57917, http://127.0.0.1:3000, initial document HTTP 200. No tests/typecheck/build/audit/QA/native review after latest user change. Human acceptance remains pending; task checkboxes and commits are not marked complete.
- Implementation uses plain CSS rather than Tailwind. No paid research calls, real web-tool/cancellation smoke, or commercial-accuracy proof performed. SDK structured-output/runtime compatibility remains pending human validation.
- .env preserved unchanged. Concurrent .env.example SPIKE_MAX_BUDGET_USD=20 edit was replaced by template before preservation message arrived, then restored from actual observed value. Template never loaded by runtime.
- Next generated then removed AGENTS.md when agentRules:false was set; worker did not directly edit generated rules.
- Latest user instruction: zero tests; develop and execute only. No test/typecheck/build/audit/browser-QA commands after this change. Remove only the newly authored spike test and its runner configuration. Install/start commands are necessary execution, not validation.
- T1 preparation wrote package/config files and installed SDK 0.3.295. One RED test run occurred BEFORE the user's change; implementation did not exist. No further test runs are authorized.
- T1–T6 now form one bounded single-writer development pass. Status remains pending human validation; do not claim verified acceptance or live SDK proof.
- Read attached specification and recovered the “Validación de mercado” chat. Latest specification supersedes prior SQLite/Vercel-AI/SSE proposals.
- Independent read-only workers checked scope and current SDK documentation in parallel.
- Detected empty workspace and initialized a local feature-branch repository.
- Current SDK research identifies @anthropic-ai/claude-agent-sdk 0.3.295; writer must recheck exact pinned declarations during installation.
- No project-specific skill registry exists; injected user skill paths are the fallback.
- Live research, subprocess cancellation, costs, and product value remain unvalidated by the agent.
- Human added a local .env with an API key; only variable names/presence were inspected, never values. Preserve it unchanged. Model override and runtime spending cap are local configuration, not secrets to request in chat.

## Next step
User opens http://127.0.0.1:3000 and validates the MVP. Local .env now contains nonempty CLAUDE_MODEL and legacy SPIKE_MAX_BUDGET_USD fields, without their values being displayed; runtime enforces a positive budget. RUN_BUDGET_USD is the preferred future field; model defaults only when override is blank. Never send the key in chat. Human enters actual manual capabilities/evidence and runs research. Agent must not resume tests or validation without explicit request. No commit, PR, publishing, or claim of proven commercial utility.

## Memory mirror
Topic: odd/gtm-canvas-mvp/tasks. Repository-relative locator: odd/tasks/gtm-canvas-mvp.md. Update full document after observed task progress; preserve pending state if mirror unavailable.


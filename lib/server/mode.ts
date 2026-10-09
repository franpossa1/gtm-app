// Research depth profiles. `fast` (default) is a shallow pass: one search and at most the first three sources;
// `full` restores the spec's original limits. Select with RESEARCH_MODE=fast|full in .env.local.
export interface CallProfile {
  label: 'coordinator' | 'researcher' | 'synthesis';
  model?: string;          // SDK alias ('haiku', 'sonnet', 'opus') or a full model id; undefined = SDK default
  searches: number;        // WebSearch quota per call
  fetches: number;         // WebFetch quota per call
  maxTurns: number;
  timeoutMs: number;
  fast: boolean;           // disables extended thinking and lowers effort
}
export const QUICK_SCOPE = 'Investigación corta, no profunda: haz 1 búsqueda, consulta como máximo las 3 primeras fuentes pertinentes y responde con lo encontrado. Si no alcanza, deja lo faltante como pendiente en vez de seguir buscando.';
export interface ResearchMode {
  name: 'fast' | 'full';
  concurrency: number;
  secondRound: boolean;
  synthesisUsesWeb: boolean;  // fast: D synthesizes only from pages A/B/C already observed
  runDeadlineMs: number;
  coordinator: CallProfile;
  researcher: CallProfile;
  synthesis: CallProfile;
}
const env = (key: string) => process.env[key]?.trim() || undefined;

export function researchMode(): ResearchMode {
  const base = env('CLAUDE_MODEL');
  if (env('RESEARCH_MODE') === 'full') {
    const full = { model: base, searches: 5, fetches: 5, maxTurns: 10, timeoutMs: 120000, fast: false };
    return { name: 'full', concurrency: Math.max(1, Math.min(2, Number(env('RESEARCH_CONCURRENCY')) || 2)),
      secondRound: true, synthesisUsesWeb: true, runDeadlineMs: 360000,
      coordinator: { ...full, label: 'coordinator', searches: 0, fetches: 0 },
      researcher: { ...full, label: 'researcher' }, synthesis: { ...full, label: 'synthesis' } };
  }
  // Fast: a small, quick model by default; override with CLAUDE_RESEARCH_MODEL.
  const quick = env('CLAUDE_RESEARCH_MODEL') ?? 'haiku';
  // Timeouts here are only a safety net against a hung process, not the scope limiter: scope is the
  // tool quota (1 search + 3 sources) plus the QUICK_SCOPE instruction.
  return { name: 'fast', concurrency: 3, secondRound: false, synthesisUsesWeb: false, runDeadlineMs: 360000,
    coordinator: { label: 'coordinator', model: quick, searches: 0, fetches: 0, maxTurns: 3, timeoutMs: 120000, fast: true },
    researcher: { label: 'researcher', model: quick, searches: 1, fetches: 3, maxTurns: 8, timeoutMs: 120000, fast: true },
    synthesis: { label: 'synthesis', model: quick, searches: 0, fetches: 0, maxTurns: 3, timeoutMs: 120000, fast: true } };
}

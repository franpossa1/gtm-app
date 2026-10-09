import { homedir } from 'node:os';
import path from 'node:path';
import type { Configuration, SdkInitDiagnostic } from '../contracts';
import { errorMessage } from '../i18n';
import { researchMode } from './mode';

export class AppError extends Error {
  reportedCostUsd: number | null = null;
  readonly diagnostic?: SdkInitDiagnostic;
  constructor(public category: string, public status = 400) { super(category); }
}
export function category(error: unknown) { return error instanceof AppError ? error.category : 'operation_failed'; }
export function diagnosticFor(error: unknown) { return error instanceof AppError ? error.diagnostic : undefined; }
export function sdkInitializationMismatch(expectedTools: string[], actualTools: unknown, mcpServers: unknown,
  permissionMode: unknown, web: boolean): AppError | null {
  const reasons: SdkInitDiagnostic['reasons'] = [];
  const actual = Array.isArray(actualTools) ? actualTools : null;
  const unexpected = actual?.filter(tool => typeof tool !== 'string' || !expectedTools.includes(tool)) ?? [];
  if (!actual || unexpected.length) reasons.push('unexpected_tools');
  // A researcher without its web tools would "complete" with zero evidence; fail loudly instead.
  const missing = actual ? expectedTools.filter(tool => !actual.includes(tool)) : [];
  if (missing.length) reasons.push('missing_tools');
  if (!Array.isArray(mcpServers) || mcpServers.length > 0) reasons.push('unexpected_mcp');
  if (permissionMode !== 'dontAsk') reasons.push('unexpected_permission_mode');
  if (!reasons.length) return null;
  const secret = process.env.ANTHROPIC_API_KEY?.trim();
  const safeName = (value: unknown): string => {
    if (typeof value !== 'string' || value.length > 64 || !/^[A-Za-z][A-Za-z0-9_:-]*$/.test(value)
      || (secret && value.includes(secret)) || /sk-ant-/i.test(value)) return 'UNKNOWN';
    // MCP tool names can contain private server identities; retain only their class.
    return /^mcp__/i.test(value) ? 'MCP_TOOL' : value;
  };
  const modes = ['default', 'acceptEdits', 'bypassPermissions', 'plan', 'dontAsk', 'auto'] as const;
  const sanitizedMode = safeName(permissionMode);
  const actualPermissionMode = modes.find(mode => mode === sanitizedMode) ?? 'UNKNOWN';
  const limit = 24, countLimit = 999;
  const diagnostic: SdkInitDiagnostic = {
    kind: 'sdk_init_mismatch', context: web ? 'researcher' : 'coordinator', reasons,
    expectedTools: expectedTools.slice(0, limit).map(safeName), actualTools: (actual ?? []).slice(0, limit).map(safeName),
    unexpectedTools: unexpected.slice(0, limit).map(safeName), missingTools: missing.slice(0, limit).map(safeName),
    actualToolCount: actual ? Math.min(actual.length, countLimit) : null,
    toolListsTruncated: Boolean(actual && actual.length > limit) || unexpected.length > limit || expectedTools.length > limit,
    mcpCount: Array.isArray(mcpServers) ? Math.min(mcpServers.length, countLimit) : null,
    mcpCountCapped: Array.isArray(mcpServers) && mcpServers.length > countLimit,
    expectedPermissionMode: 'dontAsk', actualPermissionMode,
  };
  const error = new AppError('unexpected_runtime_configuration');
  // This is the sole attachment point: only the bounded projection can leave the server.
  Object.defineProperty(error, 'diagnostic', { value: diagnostic, enumerable: true });
  return error;
}
export function readConfiguration(): Configuration {
  const primary = Number(process.env.RUN_BUDGET_USD);
  const legacy = Number(process.env.SPIKE_MAX_BUDGET_USD);
  const budgetSource = Number.isFinite(primary) && primary > 0 ? 'RUN_BUDGET_USD'
    : Number.isFinite(legacy) && legacy > 0 ? 'SPIKE_MAX_BUDGET_USD' : 'missing';
  const keyPresent = Boolean(process.env.ANTHROPIC_API_KEY?.trim());
  return { keyPresent, budgetPresent: budgetSource !== 'missing', budgetSource,
    modelMode: process.env.CLAUDE_MODEL?.trim() ? 'override' : 'default', ready: keyPresent && budgetSource !== 'missing',
    research: (() => { const m = researchMode(); return { mode: m.name, rounds: m.secondRound ? 2 : 1, concurrency: m.concurrency,
      searches: m.researcher.searches, fetches: m.researcher.fetches,
      model: m.researcher.model ?? 'predeterminado del SDK' }; })() };
}
export function configuredBudget() {
  const config = readConfiguration();
  if (!config.ready) throw new AppError('configuration_required');
  return Number(process.env[config.budgetSource]);
}
const localRoot = () => path.join(process.env.LOCALAPPDATA || path.join(homedir(), '.local', 'share'), 'GTMCanvas');
export const dataDirectory = () => path.resolve(process.env.DATA_DIR?.trim() || path.join(localRoot(), 'data'));
export const agentDirectory = () => path.resolve(process.env.AGENT_WORK_DIR?.trim() || path.join(localRoot(), 'agents'));
export function requireIsolatedRuntime() {
  const runtime = agentDirectory();
  for (const forbidden of [process.cwd(), dataDirectory()]) {
    const relative = path.relative(forbidden, runtime);
    if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) throw new AppError('runtime_directory_not_isolated');
    const reverse = path.relative(runtime, forbidden);
    if (reverse === '' || (!reverse.startsWith('..') && !path.isAbsolute(reverse))) throw new AppError('runtime_directory_not_isolated');
  }
  return runtime;
}
export function assertLocalRequest(request: Request) {
  const url = new URL(request.url);
  const loopback = (hostname: string) => ['localhost', '127.0.0.1', '[::1]'].includes(hostname.toLowerCase());
  const authority = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/i;
  const host = request.headers.get('host');
  if (!['http:', 'https:'].includes(url.protocol) || !loopback(url.hostname) || !host || !authority.test(host)) {
    throw new AppError('local_access_only', 403);
  }
  let incoming: URL;
  try { incoming = new URL(`${url.protocol}//${host}`); }
  catch { throw new AppError('local_access_only', 403); }
  const origin = request.headers.get('origin');
  if (origin === null) return;
  // Only the actual Host authority is used. Forwarded headers do not grant access.
  if (!/^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/i.test(origin)) throw new AppError('origin_not_allowed', 403);
  let source: URL;
  try { source = new URL(origin); } catch { throw new AppError('origin_not_allowed', 403); }
  const port = (address: URL) => address.port || (address.protocol === 'https:' ? '443' : '80');
  if (!loopback(source.hostname) || source.protocol !== incoming.protocol || port(source) !== port(incoming)) {
    throw new AppError('origin_not_allowed', 403);
  }
}
export function assertNoSecrets(value: unknown) {
  const serialized = JSON.stringify(value);
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if ((key && serialized.includes(key)) || /sk-ant-[a-zA-Z0-9_-]{12,}/.test(serialized)) throw new AppError('secret_not_allowed');
}
export async function readBody(request: Request) {
  assertLocalRequest(request);
  const content = await request.text();
  if (content.length > 50000) throw new AppError('request_too_large', 413);
  let parsed: unknown;
  try { parsed = JSON.parse(content); } catch { throw new AppError('invalid_request'); }
  assertNoSecrets(parsed);
  return parsed;
}
export function errorResponse(error: unknown) {
  return Response.json({ error: category(error), message: errorMessage(category(error)), diagnostic: diagnosticFor(error) }, { status: error instanceof AppError ? error.status : 500 });
}
// One paid research run at a time in the whole process; other investigations stay editable.
interface ActiveRun { id: string; abort: AbortController; workspaceId: string }
const globalRuntime = globalThis as typeof globalThis & { gtmActiveRun?: ActiveRun };
export const activeRun = () => globalRuntime.gtmActiveRun ?? null;
export function acquireRun(id: string, abort: AbortController, workspaceId: string) {
  if (activeRun()) throw new AppError('research_already_running', 409);
  globalRuntime.gtmActiveRun = { id, abort, workspaceId };
}
export function releaseRun(id: string) { if (activeRun()?.id === id) delete globalRuntime.gtmActiveRun; }
export function assertIdle(workspaceId: string) { if (activeRun()?.workspaceId === workspaceId) throw new AppError('research_already_running', 409); }
// Investigation selected by the client: `x-workspace-id` header (fetch) or `?workspace=` (links).
export function workspaceIdFrom(request: Request) {
  const value = request.headers.get('x-workspace-id') || new URL(request.url).searchParams.get('workspace');
  if (!value || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new AppError('workspace_not_selected');
  return value;
}

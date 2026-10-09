import { query, type Query, type Options, type HookCallback } from '@anthropic-ai/claude-agent-sdk';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { AppError, assertNoSecrets, requireIsolatedRuntime, sdkInitializationMismatch } from './runtime';
import type { CallProfile } from './mode';

export interface ObservedPage { url: string; consultedAt: string; responseObserved: true }
export interface AgentResult<T> { output: T; pages: Map<string, ObservedPage>; reportedCostUsd: number | null }
// The SDK injects this synthetic tool whenever `outputFormat` is set; it is how the model returns
// the structured result. It grants no web, filesystem or shell capability.
const STRUCTURED_OUTPUT_TOOL = 'StructuredOutput';
function redact(text: string) {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  let safe = key ? text.split(key).join('[REDACTED]') : text;
  safe = safe.replace(/sk-ant-[A-Za-z0-9_-]+/g, '[REDACTED]');
  return safe.length > 500 ? `${safe.slice(0, 500)}…` : safe;
}
function log(scope: string, message: string, data?: Record<string, unknown>) {
  console.info(`[gtm:agent:${scope}] ${message}`, data ? redact(JSON.stringify(data)) : '');
}
const essentials = ['PATH', 'Path', 'SystemRoot', 'SystemDrive', 'WINDIR', 'TEMP', 'TMP', 'HOME', 'USERPROFILE'];
function cleanEnvironment(configDir: string) {
  const env: Record<string, string> = {};
  for (const key of essentials) if (process.env[key]) env[key] = process.env[key]!;
  env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!.trim();
  env.CLAUDE_CONFIG_DIR = configDir;
  env.CLAUDE_CODE_DISABLE_AUTO_MEMORY = '1';
  return env;
}
function hasExited(child: ChildProcess) { return child.exitCode !== null || child.signalCode !== null; }
function waitExit(child: ChildProcess, milliseconds: number): Promise<boolean> {
  if (hasExited(child)) return Promise.resolve(true);
  return new Promise(resolve => {
    const finish = (exited: boolean) => { clearTimeout(timer); child.off('exit', onExit); resolve(exited); };
    const onExit = () => finish(true);
    const timer = setTimeout(() => finish(false), milliseconds);
    child.once('exit', onExit);
    if (hasExited(child)) finish(true);
  });
}
async function closeOwned(client: Query | undefined, abort: AbortController, child: ChildProcess | undefined) {
  try { client?.close(); } catch { /* Cleanup still owns the child. */ }
  abort.abort();
  if (!child) return true;
  if (await waitExit(child, 3500)) return true;
  child.kill('SIGTERM');
  if (await waitExit(child, 1500)) return true;
  child.kill('SIGKILL');
  return waitExit(child, 1500);
}
export async function callAgent<T>(input: { system: string; prompt: string; schema: z.ZodType<T>;
  web: boolean; budget: number; signal: AbortSignal; onTool: (summary: string) => Promise<void>;
  onCost: (cost: number | null) => void; profile: CallProfile }): Promise<AgentResult<T>> {
  const profile = input.profile;
  if (input.signal.aborted) throw new AppError('cancelled');
  const root = requireIsolatedRuntime();
  await mkdir(root, { recursive: true });
  const directory = await mkdtemp(path.join(root, 'task-'));
  const work = path.join(directory, 'work');
  const config = path.join(directory, 'config');
  await Promise.all([mkdir(work), mkdir(config)]);
  const abort = new AbortController();
  const pages = new Map<string, ObservedPage>();
  const attempts: Record<string, number> = { WebSearch: 0, WebFetch: 0 };
  const tools = input.web ? ['WebSearch', 'WebFetch'] : [];
  const scope = profile.label;
  const quota: Record<string, number> = { WebSearch: profile.searches, WebFetch: profile.fetches };
  let child: ChildProcess | undefined;
  let client: Query | undefined;
  let initialized = false;
  let timedOut = false;
  let cost: number | null = null;
  const pre: HookCallback = async event => {
    if (event.hook_event_name !== 'PreToolUse') return {};
    const tool = event.tool_name;
    if (tool === STRUCTURED_OUTPUT_TOOL) {
      log(scope, 'PreToolUse allow StructuredOutput');
      return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow',
        permissionDecisionReason: 'Structured result delivery.' } };
    }
    const permitted = input.web && tools.includes(tool) && ++attempts[tool] <= quota[tool];
    log(scope, `PreToolUse ${permitted ? 'allow' : 'deny'} ${tool}`, { attempts: attempts[tool] ?? null, quota: quota[tool] ?? 0 });
    if (permitted) await input.onTool(`${tool} ${attempts[tool]}/${quota[tool]}`);
    return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: permitted ? 'allow' : 'deny',
      permissionDecisionReason: permitted ? 'Web research within task quota.' : 'Tool not permitted or quota exhausted.' } };
  };
  const post: HookCallback = async event => {
    if (event.hook_event_name !== 'PostToolUse' || event.tool_name !== 'WebFetch') return {};
    const response = event.tool_response;
    if (response === null || response === undefined || response === '' ||
      (typeof response === 'object' && ('error' in response || ('isError' in response && response.isError)))) return {};
    const toolInput = event.tool_input as { url?: unknown };
    if (typeof toolInput?.url === 'string' && /^https?:\/\//.test(toolInput.url)) {
      pages.set(toolInput.url, { url: toolInput.url, consultedAt: new Date().toISOString(), responseObserved: true });
    }
    return {};
  };
  const cancel = () => { abort.abort(); try { client?.close(); } catch {} };
  input.signal.addEventListener('abort', cancel, { once: true });
  const started = Date.now();
  const timer = setTimeout(() => { timedOut = true; cancel(); }, profile.timeoutMs);
  let outcome: AgentResult<T> | undefined;
  let failure: unknown;
  let costReported = false;
  try {
    const options: Options = {
      // No `--bare`: it sets CLAUDE_CODE_SIMPLE, which filters the catalog down to a minimal set and
      // silently drops WebSearch/WebFetch. Isolation comes from settingSources: [], the private
      // CLAUDE_CONFIG_DIR, the clean env, no MCP and the apiKeySource check at init.
      cwd: work, env: cleanEnvironment(config),
      settingSources: [], strictMcpConfig: true, mcpServers: {}, persistSession: false,
      tools, allowedTools: tools, permissionMode: 'dontAsk', maxTurns: profile.maxTurns, maxBudgetUsd: input.budget,
      ...(profile.fast ? { thinking: { type: 'disabled' as const }, effort: 'low' as const } : {}),
      abortController: abort, systemPrompt: input.system,
      outputFormat: { type: 'json_schema', schema: z.toJSONSchema(input.schema, { target: 'draft-7', unrepresentable: 'any' }) },
      hooks: { PreToolUse: [{ hooks: [pre] }], PostToolUse: [{ hooks: [post] }] },
      stderr: data => log(scope, 'stderr', { data }),
      spawnClaudeCodeProcess: options => {
        child = spawn(options.command, options.args, { cwd: options.cwd, env: options.env,
          signal: options.signal, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
        // Never print raw errors: provider diagnostics can contain credentials.
        child.on('error', () => {});
        return child;
      },
    };
    if (profile.model) options.model = profile.model;
    log(scope, 'query start', { tools, model: options.model ?? 'sdk-default', budget: input.budget,
      quota, maxTurns: profile.maxTurns, timeoutMs: profile.timeoutMs, fast: profile.fast });
    client = query({ prompt: input.prompt, options });
    for await (const message of client) {
      if (input.signal.aborted || abort.signal.aborted) break;
      if (message.type === 'system' && message.subtype === 'init') {
        log(scope, 'init', { apiKeySource: message.apiKeySource, tools: message.tools,
          mcpCount: Array.isArray(message.mcp_servers) ? message.mcp_servers.length : null,
          permissionMode: message.permissionMode, model: message.model });
        if (message.apiKeySource !== 'ANTHROPIC_API_KEY') throw new AppError('authentication_source_not_allowed');
        const mismatch = sdkInitializationMismatch([...tools, STRUCTURED_OUTPUT_TOOL], message.tools, message.mcp_servers, message.permissionMode, input.web);
        if (mismatch) throw mismatch;
        initialized = true;
      }
      if (message.type === 'result') {
        log(scope, 'result', { subtype: message.subtype, isError: message.is_error, turns: message.num_turns,
          seconds: Math.round((Date.now() - started) / 100) / 10, searches: attempts.WebSearch, fetches: attempts.WebFetch,
          costUsd: message.total_cost_usd, hasStructured: message.subtype === 'success' && message.structured_output !== undefined });
        cost = typeof message.total_cost_usd === 'number' && Number.isFinite(message.total_cost_usd) ? message.total_cost_usd : null;
        if (!costReported) { input.onCost(cost); costReported = true; }
        if (message.subtype !== 'success' || message.is_error) {
          throw new AppError(message.subtype === 'error_max_budget_usd' ? 'task_budget_reached'
            : message.subtype === 'error_max_turns' ? 'task_turn_limit' : 'provider_request_failed');
        }
        if (!initialized) throw new AppError('runtime_initialization_missing');
        const parsed = input.schema.safeParse(message.structured_output);
        if (!parsed.success) {
          log(scope, 'invalid structured output', { issues: parsed.error.issues.slice(0, 5).map(i => `${i.path.join('.')}: ${i.message}`) });
          throw new AppError('invalid_structured_output');
        }
        assertNoSecrets(parsed.data);
        outcome = { output: parsed.data, pages, reportedCostUsd: cost };
      }
    }
    if (timedOut) throw new AppError('task_timeout');
    if (input.signal.aborted) throw new AppError('cancelled');
    if (!outcome) throw new AppError('empty_result');
  } catch (error) {
    failure = error;
    log(scope, 'failure', { category: error instanceof AppError ? error.category : 'unexpected',
      name: error instanceof Error ? error.name : typeof error, message: error instanceof Error ? error.message : String(error) });
  }
  finally {
    if (!costReported) input.onCost(null);
    clearTimeout(timer);
    input.signal.removeEventListener('abort', cancel);
    const exited = await closeOwned(client, abort, child);
    if (!exited) failure = new AppError('subprocess_exit_not_observed');
    if (exited) await rm(directory, { recursive: true, force: true }).catch(() => {});
  }
  if (failure) {
    if (timedOut) throw new AppError('task_timeout');
    if (input.signal.aborted && !(failure instanceof AppError && failure.category === 'subprocess_exit_not_observed')) throw new AppError('cancelled');
    const error = failure instanceof AppError ? failure : new AppError('provider_request_failed');
    error.reportedCostUsd = cost;
    throw error;
  }
  return outcome!;
}

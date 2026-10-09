import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { BLOCK_IDS, type Brief, type Item, type Scenario, type Workspace, type WorkspaceSummary } from '../contracts';
import { AppError, dataDirectory } from './runtime';

// Several independent investigations, one JSON file each: DATA_DIR/workspaces/<id>.json.
// The active investigation is bound per request with AsyncLocalStorage (`inWorkspace`), so
// getWorkspace()/transact() keep their signatures and an orchestration run stays on its own file.
export const id = () => randomUUID();
export const now = () => new Date().toISOString();
export function briefItems(brief: Brief): Item[] {
  return [{ id: id(), blockId: 'product', text: `${brief.product} · ${brief.market}${brief.description ? '\n' + brief.description : ''}${brief.evidence ? '\nEvidencia aportada: ' + brief.evidence : ''}`,
    evidenceKind: 'user_input', sourceIds: [], assumptions: [], pendingChecks: brief.evidence ? [] : ['Los resultados y capacidades del producto todavía no están documentados.'],
    segmentId: null, commercialPathId: null, dependencyIds: [], currentness: 'uncertain', currentnessReason: 'Aportado por la persona; sin verificación independiente.' }];
}
function initialize(workspaceId: string, product = 'Manual digital de anestesiología', market = 'España'): Workspace {
  const brief: Brief = { product, description: '', evidence: '', market };
  const accepted = Object.fromEntries(BLOCK_IDS.map(block => [block, []])) as unknown as Scenario['accepted'];
  accepted.product = briefItems(brief);
  return { version: 1, meta: { id: workspaceId, createdAt: now() }, scenarios: [{ id: id(), name: market, revision: 0, brief, origin: null, accepted,
    sources: [], proposals: [], opportunities: [], decisions: [], instructions: [], pending: [], createdAt: now() }], tasks: [], runs: [], events: [] };
}

interface Stores { states: Map<string, Workspace>; loading: Map<string, Promise<void>>; queue: Promise<unknown>; migrated: Promise<void> | null }
const globalStore = globalThis as typeof globalThis & { gtmStores?: Stores };
const stores = globalStore.gtmStores ??= { states: new Map(), loading: new Map(), queue: Promise.resolve(), migrated: null };
const scope = new AsyncLocalStorage<string>();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const folder = () => path.join(dataDirectory(), 'workspaces');
const file = (workspaceId: string) => path.join(folder(), `${workspaceId}.json`);
function current() {
  const workspaceId = scope.getStore();
  if (!workspaceId) throw new AppError('workspace_not_selected');
  return workspaceId;
}
export function inWorkspace<T>(workspaceId: string, run: () => T): T { return scope.run(workspaceId, run); }

async function persist(workspaceId: string, state: Workspace) {
  await mkdir(folder(), { recursive: true });
  state.meta = { id: workspaceId, createdAt: state.meta?.createdAt ?? now(), updatedAt: now() };
  const temporary = `${file(workspaceId)}.${id()}.tmp`;
  await writeFile(temporary, JSON.stringify(state, null, 2), { encoding: 'utf8', mode: 0o600 });
  await rename(temporary, file(workspaceId));
}
// One-time import of the former single-file layout (workspace.json and "Nuevo" backups).
async function migrate() {
  stores.migrated ??= (async () => {
    await mkdir(folder(), { recursive: true });
    const legacy = (await readdir(dataDirectory())).filter(name => name === 'workspace.json' || /^workspace\..+\.backup\.json$/.test(name));
    for (const name of legacy) {
      const source = path.join(dataDirectory(), name);
      try {
        const state = JSON.parse(await readFile(source, 'utf8')) as Workspace;
        if (state.version !== 1 || !Array.isArray(state.scenarios)) continue;
        const workspaceId = id();
        state.meta = { id: workspaceId, createdAt: state.scenarios[0]?.createdAt ?? now() };
        await persist(workspaceId, state);
        await rename(source, `${source}.migrated`);
      } catch { /* Leave unreadable legacy files untouched. */ }
    }
  })();
  return stores.migrated;
}
async function ready(workspaceId: string) {
  if (!UUID.test(workspaceId)) throw new AppError('workspace_not_found', 404);
  await migrate();
  if (stores.states.has(workspaceId)) return;
  if (!stores.loading.has(workspaceId)) stores.loading.set(workspaceId, (async () => {
    let state: Workspace;
    try {
      state = JSON.parse(await readFile(file(workspaceId), 'utf8')) as Workspace;
      if (state.version !== 1 || !Array.isArray(state.scenarios)) throw new AppError('state_format_not_supported');
    } catch (error) {
      if (error instanceof AppError) throw error;
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new AppError('workspace_not_found', 404);
      throw new AppError('state_could_not_be_loaded', 500);
    }
    // First load in this process: anything still "running" was interrupted by a restart.
    for (const task of state.tasks) if (task.status === 'researching' || task.status === 'pending') {
      task.status = 'interrupted'; task.error = 'server_restarted'; task.finishedAt = now();
    }
    for (const run of state.runs) if (run.status === 'running') { run.status = 'interrupted'; run.finishedAt = now(); }
    await persist(workspaceId, state);
    stores.states.set(workspaceId, state);
  })().finally(() => stores.loading.delete(workspaceId)));
  await stores.loading.get(workspaceId);
}
export async function getWorkspace(): Promise<Workspace> {
  const workspaceId = current();
  await ready(workspaceId); await stores.queue;
  return structuredClone(stores.states.get(workspaceId)!);
}
export async function transact<T>(mutate: (state: Workspace) => T): Promise<T> {
  const workspaceId = current();
  await ready(workspaceId);
  const operation = stores.queue.then(async () => {
    const next = structuredClone(stores.states.get(workspaceId)!);
    const result = mutate(next);
    await persist(workspaceId, next);
    stores.states.set(workspaceId, next);
    return result;
  });
  stores.queue = operation.catch(() => undefined);
  return operation;
}
export async function createWorkspace(product?: string, market?: string) {
  await migrate();
  const workspaceId = id();
  const operation = stores.queue.then(async () => {
    const state = initialize(workspaceId, product?.trim() || undefined, market?.trim() || undefined);
    await persist(workspaceId, state);
    stores.states.set(workspaceId, state);
    return workspaceId;
  });
  stores.queue = operation.catch(() => undefined);
  return operation;
}
export async function listWorkspaces(): Promise<WorkspaceSummary[]> {
  await migrate(); await stores.queue;
  const summaries: WorkspaceSummary[] = [];
  for (const name of (await readdir(folder())).filter(name => /^[0-9a-f-]{36}\.json$/i.test(name))) {
    const workspaceId = name.slice(0, -5);
    try {
      const state = stores.states.get(workspaceId) ?? JSON.parse(await readFile(file(workspaceId), 'utf8')) as Workspace;
      const base = state.scenarios[0];
      summaries.push({ id: workspaceId, product: base?.brief.product ?? 'Sin producto', market: base?.brief.market ?? '',
        scenarios: state.scenarios.length, runs: state.runs.length,
        createdAt: state.meta?.createdAt ?? base?.createdAt ?? '', updatedAt: state.meta?.updatedAt ?? state.meta?.createdAt ?? '' });
    } catch { /* Skip unreadable files in the listing. */ }
  }
  return summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
export function findScenario(state: Workspace, scenarioId: string, expectedRevision?: number) {
  const scenario = state.scenarios.find(s => s.id === scenarioId);
  if (!scenario) throw new AppError('scenario_not_found', 404);
  if (expectedRevision !== undefined && scenario.revision !== expectedRevision) throw new AppError('scenario_changed_refresh', 409);
  return scenario;
}

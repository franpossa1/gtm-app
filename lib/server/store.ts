import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { BLOCK_IDS, type Brief, type Item, type Scenario, type Workspace } from '../contracts';
import { AppError, dataDirectory } from './runtime';

export const id = () => randomUUID();
export const now = () => new Date().toISOString();
export function briefItems(brief: Brief): Item[] {
  return [{ id: id(), blockId: 'product', text: `${brief.product} · ${brief.market}${brief.description ? '\n' + brief.description : ''}${brief.evidence ? '\nEvidencia aportada: ' + brief.evidence : ''}`,
    evidenceKind: 'user_input', sourceIds: [], assumptions: [], pendingChecks: brief.evidence ? [] : ['Los resultados y capacidades del producto todavía no están documentados.'],
    segmentId: null, commercialPathId: null, dependencyIds: [], currentness: 'uncertain', currentnessReason: 'Aportado por la persona; sin verificación independiente.' }];
}
function initialize(): Workspace {
  const brief: Brief = { product: 'Manual digital de anestesiología', description: '', evidence: '', market: 'España' };
  const accepted = Object.fromEntries(BLOCK_IDS.map(block => [block, []])) as Scenario['accepted'];
  accepted.product = briefItems(brief);
  return { version: 1, scenarios: [{ id: id(), name: 'España', revision: 0, brief, origin: null, accepted,
    sources: [], proposals: [], opportunities: [], decisions: [], instructions: [], pending: [], createdAt: now() }], tasks: [], runs: [], events: [] };
}
interface Store { state: Workspace | null; loading: Promise<void> | null; queue: Promise<unknown> }
const globalStore = globalThis as typeof globalThis & { gtmStore?: Store };
const store = globalStore.gtmStore ??= { state: null, loading: null, queue: Promise.resolve() };
const file = () => path.join(dataDirectory(), 'workspace.json');
async function persist(state: Workspace) {
  await mkdir(dataDirectory(), { recursive: true });
  const temporary = `${file()}.${id()}.tmp`;
  await writeFile(temporary, JSON.stringify(state, null, 2), { encoding: 'utf8', mode: 0o600 });
  await rename(temporary, file());
}
async function ready() {
  if (store.state) return;
  store.loading ??= (async () => {
    let state: Workspace;
    try {
      state = JSON.parse(await readFile(file(), 'utf8')) as Workspace;
      if (state.version !== 1 || !Array.isArray(state.scenarios)) throw new AppError('state_format_not_supported');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new AppError('state_could_not_be_loaded', 500);
      state = initialize();
    }
    for (const task of state.tasks) if (task.status === 'researching' || task.status === 'pending') {
      task.status = 'interrupted'; task.error = 'server_restarted'; task.finishedAt = now();
    }
    for (const run of state.runs) if (run.status === 'running') { run.status = 'interrupted'; run.finishedAt = now(); }
    await persist(state);
    store.state = state;
  })();
  await store.loading;
}
export async function getWorkspace() {
  await ready(); await store.queue;
  const untouchedDefault = (scenario: Scenario) => !scenario.origin && scenario.name === 'Spain' && scenario.revision === 0
    && scenario.instructions.length === 0 && scenario.decisions.length === 0 && scenario.brief.product === 'Manual digital de anestesiología'
    && scenario.brief.market === 'Spain' && scenario.brief.description === '' && scenario.brief.evidence === ''
    && scenario.sources.length === 0 && scenario.proposals.length === 0 && scenario.opportunities.length === 0
    && scenario.accepted.product.length === 1 && scenario.accepted.product[0].text === 'Manual digital de anestesiología · Spain';
  if (store.state!.scenarios.some(untouchedDefault)) await transact(state => {
    for (const scenario of state.scenarios.filter(untouchedDefault)) {
      scenario.name = 'España'; scenario.brief.market = 'España';
      const item = scenario.accepted.product[0];
      item.text = 'Manual digital de anestesiología · España';
      if (item.currentnessReason === 'Provided by the human; not independently verified.') item.currentnessReason = 'Aportado por la persona; sin verificación independiente.';
      item.pendingChecks = item.pendingChecks.map(check => check === 'Product outcomes and capabilities are not yet documented.' ? 'Los resultados y capacidades del producto todavía no están documentados.' : check);
    }
  });
  return structuredClone(store.state!);
}
export async function transact<T>(mutate: (state: Workspace) => T): Promise<T> {
  await ready();
  const operation = store.queue.then(async () => {
    const next = structuredClone(store.state!);
    const result = mutate(next);
    await persist(next);
    store.state = next;
    return result;
  });
  store.queue = operation.catch(() => undefined);
  return operation;
}
export function findScenario(state: Workspace, scenarioId: string, expectedRevision?: number) {
  const scenario = state.scenarios.find(s => s.id === scenarioId);
  if (!scenario) throw new AppError('scenario_not_found', 404);
  if (expectedRevision !== undefined && scenario.revision !== expectedRevision) throw new AppError('scenario_changed_refresh', 409);
  return scenario;
}

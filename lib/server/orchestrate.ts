import { BLOCK_IDS, BLOCK_META, PlanSchema, ResearchResultSchema, ResearchInputSchema, type BlockId, type CommercialProposal,
  type Item, type Researcher, type ResearchResult, type Scenario, type Source, type StreamEvent, type Task, type SdkInitDiagnostic } from '../contracts';
import { OWNED_BLOCKS, expandPlan } from '../dependencies';
import { COORDINATOR_PROMPT, planPrompt, researcherPrompt, scenarioContext } from '../prompts';
import { callAgent, type ObservedPage } from './agent';
import { AppError, category, configuredBudget, diagnosticFor } from './runtime';
import { findScenario, getWorkspace, id, now, transact } from './store';
import { QUICK_SCOPE, researchMode } from './mode';
import type { z } from 'zod';
import { label } from '../i18n';

type Input = z.infer<typeof ResearchInputSchema>;
interface PlannedTask { researcher: Researcher; instruction: string; blocks: BlockId[] }
function normalizeResearch(result: ResearchResult, task: Task, pages: Map<string, ObservedPage>, scenario: Scenario) {
  if (result.items.some(item => !task.blocks.includes(item.blockId))) throw new AppError('research_block_not_owned');
  if (task.researcher !== 'D' && result.commercialProposals.length) throw new AppError('commercial_proposal_not_owned');
  const sourceMap = new Map(result.sources.map(source => [source.id, id()]));
  if (sourceMap.size !== result.sources.length) throw new AppError('duplicate_source_ids');
  const date = (value: string | null) => value && /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value) && !Number.isNaN(Date.parse(value)) ? value : null;
  const sources: Source[] = result.sources.filter(source => pages.has(source.url)).map(source => {
    const publishedAt = date(source.publishedAt), updatedAt = date(source.updatedAt);
    const latest = updatedAt || publishedAt;
    const oldOrUnknown = !latest || Date.now() - Date.parse(latest) > 2 * 365 * 86400000;
    const corroborating = source.corroboratingSourceIds.map(reference => result.sources.find(s => s.id === reference))
      .filter(s => s && s.id !== source.id && pages.has(s.url) && date(s.updatedAt || s.publishedAt)
        && Date.now() - Date.parse(s.updatedAt || s.publishedAt || '') < 365 * 86400000);
    const currentness = source.currentness === 'confirmed' && oldOrUnknown && !corroborating.length ? 'uncertain' : source.currentness;
    return { ...source, id: sourceMap.get(source.id)!, publishedAt, updatedAt,
      corroboratingSourceIds: corroborating.map(s => sourceMap.get(s!.id)!), currentness,
      consultedAt: pages.get(source.url)!.consultedAt, publicationDateStatus: publishedAt ? 'known' : 'not_reported',
      verification: 'page_fetched', currentnessCheckedAt: currentness === 'confirmed' ? now() : null,
      currentnessReason: currentness !== source.currentness ? `${source.currentnessReason} Falta corroboración actual para evidencia antigua o sin fecha.` : source.currentnessReason };
  });
  const validSourceIds = new Set(sources.map(s => s.id));
  const normalizedRefs = (refs: string[]) => refs.map(ref => sourceMap.get(ref)).filter((ref): ref is string => Boolean(ref && validSourceIds.has(ref)));
  const aliases = new Map<string, string>();
  const existing = new Set<string>();
  for (const item of [...Object.values(scenario.accepted).flat(), ...scenario.proposals.flatMap(p => p.items)]) {
    existing.add(item.id);
    if (item.segmentId) existing.add(item.segmentId);
    if (item.commercialPathId) existing.add(item.commercialPathId);
  }
  for (const opportunity of scenario.opportunities) { existing.add(opportunity.id); existing.add(opportunity.segmentId); }
  const operationalRef = (ref: string | null) => {
    if (!ref) return null;
    if (existing.has(ref)) return ref;
    if (!aliases.has(ref)) aliases.set(ref, id());
    return aliases.get(ref)!;
  };
  const items: Item[] = result.items.map(item => {
    const refs = normalizedRefs(item.sourceIds);
    const unsupported = item.evidenceKind === 'sourced' && (refs.length === 0 || refs.length !== item.sourceIds.length);
    const verified = refs.length > 0 && refs.every(ref => sources.find(s => s.id === ref)?.currentness === 'confirmed');
    const pending = [...item.pendingChecks];
    if (unsupported) pending.push('La fuente documental no fue observada mediante una consulta WebFetch exitosa; comprobar esta afirmación.');
    if (item.currentness === 'confirmed' && !verified && item.evidenceKind !== 'user_input') pending.push('La vigencia requiere evidencia observada más sólida.');
    return { ...item, id: id(), sourceIds: refs, evidenceKind: unsupported ? 'unknown' : item.evidenceKind,
      segmentId: operationalRef(item.segmentId), commercialPathId: operationalRef(item.commercialPathId),
      dependencyIds: item.dependencyIds.map(ref => operationalRef(ref)!), pendingChecks: pending,
      currentness: item.currentness === 'confirmed' && !verified ? 'uncertain' : item.currentness };
  });
  const opportunities: CommercialProposal[] = [];
  const pending = [...result.uncertainOpportunities];
  const counts = new Map<string, number>();
  for (const opportunity of result.commercialProposals) {
    const refs = normalizedRefs(opportunity.sourceIds);
    const supported = refs.length > 0 && refs.length === opportunity.sourceIds.length && refs.every(ref => sources.find(s => s.id === ref)?.currentness === 'confirmed');
    const segmentId = operationalRef(opportunity.segmentId)!;
    const count = counts.get(segmentId) ?? 0;
    if (!supported || count >= 3) {
      pending.push(`${opportunity.title}: necesita páginas consultadas y respaldo vigente para sus afirmaciones esenciales; no se admite como oportunidad respaldada.`);
      continue;
    }
    counts.set(segmentId, count + 1);
    opportunities.push({ ...opportunity, id: operationalRef(opportunity.id)!, segmentId, sourceIds: refs, decisionStatus: 'pending' });
  }
  return { sources, items, opportunities, pending };
}

export async function orchestrate(input: Input, runId: string, signal: AbortSignal, emit: (event: StreamEvent) => void) {
  const budget = configuredBudget();
  const mode = researchMode();
  // Pages observed by A/B/C; in fast mode D synthesizes from these without its own web access.
  const observedPages = new Map<string, ObservedPage>();
  const perCall = budget / 9; // One coordinator + up to four researchers in each of two rounds.
  let reported = 0, unknownCost = false, calls = 0;
  let scenarioId = input.scenarioId;
  const cost = (amount: number | null) => { if (amount === null) unknownCost = true; else reported += amount; };
  const event = async (type: string, summary: string, taskId: string | null = null, blocks: BlockId[] = [], diagnostic?: SdkInitDiagnostic) => {
    const record = { id: id(), type, runId, scenarioId, taskId, summary, blocks, at: now(), ...(diagnostic ? { diagnostic } : {}) };
    await transact(state => { state.events.push(record); state.events = state.events.slice(-300); });
    emit({ ...record, workspace: await getWorkspace() });
  };
  const permit = () => {
    if (signal.aborted) throw new AppError('cancelled');
    if (calls >= 9 || reported >= budget) throw new AppError('run_budget_reached');
    calls++;
  };
  await transact(state => {
    findScenario(state, scenarioId, input.expectedRevision);
    state.runs.push({ id: runId, scenarioId, status: 'running', startedAt: now(), finishedAt: null,
      budgetUsd: budget, reportedCostUsd: null, interpretation: '', clarification: null });
  });
  try {
    const before = await getWorkspace();
    const base = findScenario(before, scenarioId, input.expectedRevision);
    if (input.brief) base.brief = input.brief;
    const retry = input.retryTaskId ? before.tasks.find(task => task.id === input.retryTaskId && task.scenarioId === scenarioId) : null;
    if (input.retryTaskId && (!retry || !['error', 'cancelled', 'interrupted', 'stale'].includes(retry.status))) throw new AppError('task_not_retryable');
    let planned: PlannedTask[];
    let interpretation: string;
    let plan: typeof PlanSchema['_output'] | null = null;
    if (retry) {
      planned = [{ researcher: retry.researcher, instruction: retry.instruction, blocks: retry.blocks }];
      interpretation = `Reintentar investigador ${retry.researcher} con la revisión humana actual.`;
    } else {
      permit();
      const coordinated = await callAgent({ system: COORDINATOR_PROMPT,
        prompt: planPrompt(base, input.instruction, input.blockId), schema: PlanSchema, web: false, profile: mode.coordinator,
        budget: perCall, signal, onCost: cost, onTool: async () => {} });
      plan = coordinated.output;
      if (plan.clarification?.trim()) {
        await transact(state => { const run = state.runs.find(r => r.id === runId)!;
          run.status = 'clarification'; run.clarification = plan!.clarification; run.interpretation = plan!.interpretation; });
        await event('clarification_required', plan.clarification);
        return;
      }
      interpretation = plan.interpretation;
      planned = expandPlan(plan, base.instructions.length === 0).tasks;
    }
    let snapshot!: Scenario;
    await transact(state => {
      const original = findScenario(state, scenarioId, input.expectedRevision);
      let scenario = original;
      if (input.variantName || plan?.scope === 'new_variant') {
        scenario = structuredClone(original);
        scenario.id = id(); scenario.name = input.variantName || plan?.variantName || 'Nueva exploración';
        scenario.origin = { scenarioId: original.id, revision: original.revision, at: now() };
        scenario.revision = 0; scenario.createdAt = now();
        state.scenarios.push(scenario);
        scenarioId = scenario.id;
      }
      if (input.brief) { scenario.brief = input.brief; }
      scenario.revision++;
      scenario.instructions.push({ text: input.instruction, at: now(), blockId: input.blockId ?? null });
      for (const change of plan?.changedPremises ?? []) {
        scenario.pending.push(`${change.kind === 'decision' ? 'Pedido humano registrado' : 'Solo exploración'} — ${label(change.key)}: ${change.value}`);
        if (change.key === 'geography') scenario.brief.market = change.value;
      }
      const run = state.runs.find(r => r.id === runId)!;
      run.scenarioId = scenarioId; run.interpretation = interpretation;
      snapshot = structuredClone(scenario);
    });
    await event('plan_ready', interpretation, null, planned.flatMap(task => task.blocks));
    let failures = 0;
    const siblingResults: { researcher: Researcher; result: ResearchResult }[] = [];
    const implications: ResearchResult['implications'] = [];
    const executeTask = async (planTask: PlannedTask, round: number) => {
      const task: Task = { id: id(), runId, scenarioId, baseRevision: snapshot.revision, round,
        researcher: planTask.researcher, instruction: planTask.instruction, blocks: planTask.blocks,
        status: 'pending', startedAt: null, finishedAt: null, error: null, reportedCostUsd: null };
      await transact(state => state.tasks.push(task));
      try {
        permit();
        await transact(state => { const current = state.tasks.find(t => t.id === task.id)!; current.status = 'researching'; current.startedAt = now(); });
        await event('task_started', `Investigador ${task.researcher} · ronda ${round}`, task.id, task.blocks);
        const synthesis = task.researcher === 'D';
        const web = !synthesis || mode.synthesisUsesWeb;
        const result = await callAgent({ system: researcherPrompt(task.researcher, task.blocks),
          prompt: JSON.stringify({ context: scenarioContext(snapshot), instruction: task.instruction,
            siblings: synthesis || round === 2 ? siblingResults : [], round,
            checkedAt: now(), ownership: task.blocks,
            ...(mode.name === 'fast' && web ? { scope: QUICK_SCOPE } : {}),
            ...(web ? {} : { webAccess: 'none: synthesize only from sibling results and cite only their source URLs; keep it brief' }) }),
          schema: ResearchResultSchema, web, profile: synthesis ? mode.synthesis : mode.researcher,
          budget: perCall, signal, onCost: cost, onTool: summary => event('tool_progress', summary, task.id, task.blocks) });
        const latestScenario = findScenario(await getWorkspace(), scenarioId);
        for (const [url, page] of result.pages) observedPages.set(url, page);
        const pages = web ? result.pages : new Map(observedPages);
        const normalized = normalizeResearch(result.output, task, pages, latestScenario);
        let integrated = false;
        await transact(state => {
          const current = state.tasks.find(t => t.id === task.id)!;
          const scenario = findScenario(state, scenarioId);
          const run = state.runs.find(r => r.id === runId)!;
          current.finishedAt = now(); current.reportedCostUsd = result.reportedCostUsd;
          if (signal.aborted || run.status !== 'running') { current.status = 'cancelled'; return; }
          if (scenario.revision !== task.baseRevision) { current.status = 'stale'; current.error = 'human_revision_changed'; return; }
          current.status = 'completed';
          integrated = true;
          scenario.sources.push(...normalized.sources);
          scenario.pending.push(...normalized.pending);
          for (const opportunity of normalized.opportunities) {
            const count = scenario.opportunities.filter(existing => existing.segmentId === opportunity.segmentId && existing.decisionStatus !== 'rejected').length;
            if (count < 3) scenario.opportunities.push(opportunity);
            else scenario.pending.push(`${opportunity.title}: el segmento ya tiene tres oportunidades respaldadas; revisar primero las opciones existentes.`);
          }
          for (const block of task.blocks) {
            const items = normalized.items.filter(item => item.blockId === block);
            if (!items.length) continue;
            scenario.proposals.push({ id: id(), taskId: task.id, baseRevision: task.baseRevision, blockId: block, items,
              reason: `${result.output.summary} ${scenario.accepted[block].length ? 'El contenido aceptado se conserva; revisar esta actualización propuesta.' : ''}`,
              dependencies: [...new Set(items.flatMap(item => item.dependencyIds))], status: 'pending', createdAt: now() });
          }
          run.reportedCostUsd = unknownCost ? null : reported;
        });
        if (!integrated) { await event('task_failed', signal.aborted ? 'cancelled' : 'human_revision_changed', task.id, task.blocks); return; }
        // D receives normalized, observed evidence rather than untrusted model source identifiers.
        const sibling = { ...result.output, items: normalized.items, sources: normalized.sources,
          commercialProposals: normalized.opportunities };
        siblingResults.push({ researcher: task.researcher, result: sibling });
        implications.push(...result.output.implications);
        await event('task_completed', result.output.summary, task.id, task.blocks);
        await event('proposal_ready', 'Nueva evidencia disponible para revisión humana. El contenido aceptado no se modificó.', task.id, task.blocks);
      } catch (error) {
        failures++;
        await transact(state => { const current = state.tasks.find(t => t.id === task.id)!;
          current.status = signal.aborted ? 'cancelled' : 'error'; current.error = category(error); current.finishedAt = now();
          current.reportedCostUsd = error instanceof AppError ? error.reportedCostUsd : null;
          const diagnostic = diagnosticFor(error);
          if (diagnostic) current.diagnostic = diagnostic; });
        await event('task_failed', category(error), task.id, task.blocks, diagnosticFor(error));
      }
    };
    const concurrency = mode.concurrency;
    const executeRound = async (tasks: PlannedTask[], round: number) => {
      const parallel = tasks.filter(task => task.researcher !== 'D');
      let index = 0;
      await Promise.all(Array.from({ length: Math.min(concurrency, parallel.length) }, async () => {
        while (index < parallel.length && !signal.aborted) await executeTask(parallel[index++], round);
      }));
      const synthesis = tasks.find(task => task.researcher === 'D');
      if (synthesis && !signal.aborted) await executeTask(synthesis, round);
    };
    await executeRound(planned, 1);
    if (mode.secondRound && !retry && !signal.aborted && implications.length) {
      const affected = new Set(implications.map(implication => implication.blockId));
      const second = (Object.keys(OWNED_BLOCKS) as Researcher[])
        .filter(researcher => OWNED_BLOCKS[researcher].some(block => affected.has(block)))
        .map(researcher => ({ researcher, blocks: OWNED_BLOCKS[researcher].filter(block => affected.has(block)),
          instruction: `Segunda revisión acotada: ${implications.filter(i => OWNED_BLOCKS[researcher].includes(i.blockId)).map(i => i.reason).join('; ')}` }));
      implications.length = 0;
      await executeRound(second, 2);
    }
    await transact(state => {
      const scenario = findScenario(state, scenarioId);
      for (const implication of implications) scenario.pending.push(`Pendiente después de la segunda ronda (${BLOCK_META[implication.blockId].title}): ${implication.reason}`);
      const run = state.runs.find(r => r.id === runId)!;
      run.status = signal.aborted ? 'cancelled' : failures ? 'partial' : 'completed';
    });
  } catch (error) {
    await transact(state => { const run = state.runs.find(r => r.id === runId)!; run.status = signal.aborted ? 'cancelled' : 'partial'; });
    await event('run_failed', category(error), null, [], diagnosticFor(error));
  } finally {
    await transact(state => {
      const run = state.runs.find(r => r.id === runId)!;
      run.finishedAt = now(); run.reportedCostUsd = unknownCost ? null : reported;
      for (const task of state.tasks.filter(t => t.runId === runId && ['pending', 'researching'].includes(t.status))) {
        task.status = 'cancelled'; task.finishedAt = now(); task.error = 'run_closed';
      }
    });
    await event('run_completed', 'Ejecución cerrada. Revisar las propuestas pendientes; la evidencia documental no demuestra intención de compra.');
  }
}

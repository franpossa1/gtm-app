import { BLOCK_IDS, type BlockId, type Plan, type Researcher } from './contracts';

export const OWNED_BLOCKS: Record<Researcher, BlockId[]> = {
  A: ['audiences', 'market'], B: ['problems', 'value'], C: ['organizations', 'channels'], D: ['product', 'paths', 'priorities'],
};
export const DEPENDENCIES: Record<string, BlockId[]> = {
  geography: ['audiences', 'market', 'organizations', 'problems', 'value', 'channels', 'priorities'],
  buyer: ['problems', 'market', 'value', 'organizations', 'channels', 'paths'],
  language: ['product', 'value', 'channels', 'priorities'],
  path: ['value', 'organizations', 'channels', 'priorities'],
  horizon: ['priorities', 'channels', 'product'], list: ['organizations'],
};
export function expandPlan(plan: Plan, initial: boolean) {
  const blocks = new Set<BlockId>(initial ? BLOCK_IDS : plan.affectedBlocks);
  for (const change of plan.changedPremises) for (const block of DEPENDENCIES[change.key] ?? []) blocks.add(block);
  const tasks = (Object.keys(OWNED_BLOCKS) as Researcher[]).filter(r => OWNED_BLOCKS[r].some(b => blocks.has(b)))
    .map(researcher => ({ researcher, instruction: plan.tasks.find(t => t.researcher === researcher)?.instruction ?? plan.interpretation,
      blocks: OWNED_BLOCKS[researcher].filter(b => blocks.has(b)) }));
  return { blocks: [...blocks], tasks };
}

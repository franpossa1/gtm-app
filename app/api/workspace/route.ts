import { z } from 'zod';
import { BriefSchema } from '../../../lib/contracts';
import { activeRun, AppError, assertIdle, assertLocalRequest, errorResponse, readBody, readConfiguration } from '../../../lib/server/runtime';
import { briefItems, findScenario, getWorkspace, id, now, transact } from '../../../lib/server/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    assertLocalRequest(request);
    return Response.json({ workspace: await getWorkspace(), configuration: readConfiguration(), activeRun: activeRun()?.id ?? null });
  } catch (error) { return errorResponse(error); }
}
const mutation = z.discriminatedUnion('action', [
  z.object({ action: z.literal('brief'), scenarioId: z.string(), expectedRevision: z.number().int(), brief: BriefSchema }),
  z.object({ action: z.literal('variant'), scenarioId: z.string(), expectedRevision: z.number().int(), name: z.string().trim().min(1).max(100) }),
]);
export async function POST(request: Request) {
  try {
    const parsed = mutation.safeParse(await readBody(request));
    if (!parsed.success) throw new AppError('invalid_request');
    assertIdle();
    let scenarioId = parsed.data.scenarioId;
    await transact(state => {
      assertIdle();
      const scenario = findScenario(state, parsed.data.scenarioId, parsed.data.expectedRevision);
      if (parsed.data.action === 'brief') {
        scenario.brief = parsed.data.brief;
        scenario.accepted.product = briefItems(parsed.data.brief);
        scenario.revision++;
        scenario.decisions.push({ id: id(), proposalId: 'brief', action: 'correct', text: 'Brief del producto actualizado por la persona.', conditions: '', at: now(), revision: scenario.revision });
      } else {
        const variant = structuredClone(scenario);
        variant.id = id(); variant.name = parsed.data.name; variant.revision = 0;
        variant.origin = { scenarioId: scenario.id, revision: scenario.revision, at: now() }; variant.createdAt = now();
        variant.brief.market = parsed.data.name;
        state.scenarios.push(variant); scenarioId = variant.id;
      }
    });
    return Response.json({ workspace: await getWorkspace(), scenarioId });
  } catch (error) { return errorResponse(error); }
}

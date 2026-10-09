import { DecisionInputSchema } from '../../../lib/contracts';
import { AppError, assertIdle, errorResponse, readBody, workspaceIdFrom } from '../../../lib/server/runtime';
import { findScenario, getWorkspace, id, inWorkspace, now, transact } from '../../../lib/server/store';
import { label } from '../../../lib/i18n';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    const workspaceId = workspaceIdFrom(request);
    const parsed = DecisionInputSchema.safeParse(await readBody(request));
    if (!parsed.success) throw new AppError('invalid_request');
    const input = parsed.data;
    assertIdle(workspaceId);
    return await inWorkspace(workspaceId, async () => {
    await transact(state => {
      assertIdle(workspaceId);
      const scenario = findScenario(state, input.scenarioId, input.expectedRevision);
      const update = scenario.proposals.find(p => p.id === input.proposalId);
      const opportunity = scenario.opportunities.find(p => p.id === input.proposalId);
      if (!update && !opportunity) throw new AppError('proposal_not_found', 404);
      if ((update && update.status !== 'pending') || (opportunity && opportunity.decisionStatus !== 'pending')) throw new AppError('proposal_already_decided', 409);
      if (input.action === 'correct' && !input.text.trim()) throw new AppError('correction_text_required');
      scenario.revision++;
      scenario.decisions.push({ id: id(), proposalId: input.proposalId, action: input.action,
        text: input.text, conditions: input.conditions, at: now(), revision: scenario.revision });
      if (update) {
        update.status = input.action === 'reject' ? 'rejected' : 'accepted';
        if (input.action !== 'reject') {
          scenario.accepted[update.blockId] = input.action === 'correct' ? [{ ...update.items[0], id: id(),
            text: input.text.trim(), evidenceKind: 'user_input', assumptions: [],
            currentness: 'uncertain', currentnessReason: 'Corrección humana; el respaldo documental todavía requiere revisión.' }] : structuredClone(update.items);
        }
      }
      if (opportunity) {
        opportunity.decisionStatus = input.action === 'reject' ? 'rejected' : 'accepted';
        if (input.action === 'correct') {
          // Preserve the researched opportunity and append a distinct human version.
          opportunity.decisionStatus = 'rejected';
          scenario.opportunities.push({ ...opportunity, id: id(), title: input.text.trim(), decisionStatus: 'accepted',
            unresolvedChecks: [...opportunity.unresolvedChecks, 'Una corrección humana no es validación documental independiente.'] });
        }
      }
      if (input.conditions) scenario.pending.push(`Condición humana: ${input.conditions}`);
    });
    return Response.json({ workspace: await getWorkspace(), followUpInstruction: input.consequential
      ? `Reevaluar únicamente las dependencias de esta decisión humana registrada (${label(input.action)}): ${input.text || 'propuesta aceptada'}. Condiciones: ${input.conditions || 'sin condiciones aportadas'}. Preservar el contenido aceptado y proponer las actualizaciones para revisión.` : null });
    });
  } catch (error) { return errorResponse(error); }
}

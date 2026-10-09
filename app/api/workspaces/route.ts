import { z } from 'zod';
import { activeRun, AppError, assertLocalRequest, errorResponse, readBody } from '../../../lib/server/runtime';
import { createWorkspace, listWorkspaces } from '../../../lib/server/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Saved investigations: list them, or create a new one ("Nuevo") without touching the others.
export async function GET(request: Request) {
  try {
    assertLocalRequest(request);
    return Response.json({ workspaces: await listWorkspaces(), runningIn: activeRun()?.workspaceId ?? null });
  } catch (error) { return errorResponse(error); }
}
const create = z.object({ action: z.literal('create'), product: z.string().trim().max(200).optional(), market: z.string().trim().max(100).optional() });
export async function POST(request: Request) {
  try {
    const parsed = create.safeParse(await readBody(request));
    if (!parsed.success) throw new AppError('invalid_request');
    const workspaceId = await createWorkspace(parsed.data.product, parsed.data.market);
    return Response.json({ workspaceId, workspaces: await listWorkspaces() });
  } catch (error) { return errorResponse(error); }
}

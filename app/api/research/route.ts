import { ResearchInputSchema } from '../../../lib/contracts';
import { orchestrate } from '../../../lib/server/orchestrate';
import { acquireRun, activeRun, AppError, configuredBudget, errorResponse, readBody, releaseRun, workspaceIdFrom } from '../../../lib/server/runtime';
import { findScenario, getWorkspace, id, inWorkspace } from '../../../lib/server/store';
import { researchMode } from '../../../lib/server/mode';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  try {
    const workspaceId = workspaceIdFrom(request);
    const body = await readBody(request);
    if (body && typeof body === 'object' && 'action' in body && body.action === 'cancel') {
      const run = activeRun();
      if (run?.workspaceId === workspaceId) run.abort.abort();
      return Response.json({ status: run?.workspaceId === workspaceId ? 'cancelling' : 'idle' });
    }
    const parsed = ResearchInputSchema.safeParse(body);
    if (!parsed.success) throw new AppError('invalid_request');
    configuredBudget();
    // Everything below (including the detached orchestration) stays bound to this investigation.
    return await inWorkspace(workspaceId, async () => {
    findScenario(await getWorkspace(), parsed.data.scenarioId, parsed.data.expectedRevision);
    const runId = id(), abort = new AbortController();
    acquireRun(runId, abort, workspaceId);
    const disconnect = () => abort.abort();
    request.signal.addEventListener('abort', disconnect, { once: true });
    const timer = setTimeout(disconnect, researchMode().runDeadlineMs);
    const encoder = new TextEncoder();
    let connected = true;
    const stream = new ReadableStream({
      start(controller) {
        void (async () => {
          try {
            await orchestrate(parsed.data, runId, abort.signal, event => {
              if (connected) controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
            });
          } catch {
            if (connected) controller.enqueue(encoder.encode(JSON.stringify({ type: 'run_failed', summary: 'run_could_not_be_saved', runId }) + '\n'));
          } finally {
            clearTimeout(timer); request.signal.removeEventListener('abort', disconnect); releaseRun(runId);
            if (connected) { connected = false; controller.close(); }
          }
        })();
      },
      cancel() { connected = false; abort.abort(); },
    });
    return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
    });
  } catch (error) { return errorResponse(error); }
}

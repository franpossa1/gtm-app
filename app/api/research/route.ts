import { ResearchInputSchema } from '../../../lib/contracts';
import { orchestrate } from '../../../lib/server/orchestrate';
import { acquireRun, activeRun, AppError, configuredBudget, errorResponse, readBody, releaseRun } from '../../../lib/server/runtime';
import { findScenario, getWorkspace, id } from '../../../lib/server/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  try {
    const body = await readBody(request);
    if (body && typeof body === 'object' && 'action' in body && body.action === 'cancel') {
      activeRun()?.abort.abort();
      return Response.json({ status: activeRun() ? 'cancelling' : 'idle' });
    }
    const parsed = ResearchInputSchema.safeParse(body);
    if (!parsed.success) throw new AppError('invalid_request');
    configuredBudget();
    findScenario(await getWorkspace(), parsed.data.scenarioId, parsed.data.expectedRevision);
    const runId = id(), abort = new AbortController();
    acquireRun(runId, abort);
    const disconnect = () => abort.abort();
    request.signal.addEventListener('abort', disconnect, { once: true });
    const timer = setTimeout(disconnect, 360000);
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
  } catch (error) { return errorResponse(error); }
}

import { markdownSnapshot } from '../../../lib/server/export';
import { assertLocalRequest, assertNoSecrets, errorResponse, workspaceIdFrom } from '../../../lib/server/runtime';
import { getWorkspace, inWorkspace } from '../../../lib/server/store';

export const runtime = 'nodejs';
export async function GET(request: Request) {
  try {
    assertLocalRequest(request);
    const state = await inWorkspace(workspaceIdFrom(request), () => getWorkspace());
    assertNoSecrets(state);
    const format = new URL(request.url).searchParams.get('format') === 'json' ? 'json' : 'md';
    return new Response(format === 'json' ? JSON.stringify(state, null, 2) : markdownSnapshot(state), {
      headers: { 'Content-Type': format === 'json' ? 'application/json' : 'text/markdown; charset=utf-8',
        'Content-Disposition': `attachment; filename="gtm-canvas.${format}"`, 'Cache-Control': 'no-store' },
    });
  } catch (error) { return errorResponse(error); }
}

'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BLOCK_IDS, BLOCK_META, type BlockId, type Brief, type Scenario, type StreamEvent, type Task, type Workspace, type WorkspaceResponse, type SdkInitDiagnostic, type WorkspaceSummary } from '../lib/contracts';
import BriefForm from './BriefForm';
import BlockCard from './BlockCard';
import BlockPanel from './BlockPanel';
import { diagnosticLines, errorMessage, label, timeOnly } from '../lib/i18n';

export default function Canvas() {
  const [state, setState] = useState<WorkspaceResponse | null>(null);
  const [scenarioId, setScenarioId] = useState('');
  const [selected, setSelected] = useState<BlockId | null>(null);
  const [instruction, setInstruction] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [latest, setLatest] = useState('Listo para comenzar.');
  const [responseDiagnostic, setResponseDiagnostic] = useState<SdkInitDiagnostic | null>(null);
  // Native confirm()/prompt() can be disabled by the host browser; use in-page controls instead.
  const [confirmReset, setConfirmReset] = useState(false);
  const [newProduct, setNewProduct] = useState('');
  const [newMarket, setNewMarket] = useState('');
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  // The selected investigation lives in the URL (?w=) so reloads and bookmarks keep it.
  const workspaceRef = useRef('');
  const [variantName, setVariantName] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const selectedId = useRef(scenarioId);
  selectedId.current = scenarioId;
  const scoped = (init: RequestInit = {}): RequestInit => ({ ...init, headers: { ...(init.headers as Record<string, string> | undefined), 'x-workspace-id': workspaceRef.current } });
  const loadList = useCallback(async () => {
    const response = await fetch('/api/workspaces', { cache: 'no-store' });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.message || errorMessage(payload.error || 'workspace_unavailable'));
    setWorkspaces(payload.workspaces);
    return payload.workspaces as WorkspaceSummary[];
  }, []);
  const refresh = useCallback(async () => {
    const response = await fetch('/api/workspace', { cache: 'no-store', headers: { 'x-workspace-id': workspaceRef.current } });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.message || errorMessage(payload.error || 'workspace_unavailable'));
    setState(payload);
    setScenarioId(current => payload.workspace.scenarios.some((s: Scenario) => s.id === current) ? current : payload.workspace.scenarios[0].id);
    setBusy(Boolean(payload.activeRun));
  }, []);
  const openWorkspace = useCallback(async (workspaceId: string) => {
    workspaceRef.current = workspaceId;
    const url = new URL(window.location.href);
    url.searchParams.set('w', workspaceId);
    window.history.replaceState(null, '', url);
    try { localStorage.setItem('gtm:lastWorkspace', workspaceId); } catch { /* storage may be unavailable */ }
    setState(null); setScenarioId(''); setSelected(null); setInstruction(''); setError(''); setResponseDiagnostic(null);
    await refresh();
  }, [refresh]);
  useEffect(() => {
    void (async () => {
      let list = await loadList();
      let remembered: string | null = null;
      try { remembered = localStorage.getItem('gtm:lastWorkspace'); } catch { /* ignore */ }
      const requested = new URL(window.location.href).searchParams.get('w');
      let target = [requested, remembered].find(candidate => candidate && list.some(w => w.id === candidate)) ?? list[0]?.id;
      if (!target) {
        const response = await fetch('/api/workspaces', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'create' }) });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.message || errorMessage(payload.error || 'workspace_unavailable'));
        list = payload.workspaces; setWorkspaces(list); target = payload.workspaceId as string;
      }
      await openWorkspace(target!);
    })().catch(e => setError(e.message));
    return () => { request.current?.abort(); };
  }, [loadList, openWorkspace]);
  const scenario = state?.workspace.scenarios.find(s => s.id === scenarioId);
  const applyWorkspace = (workspace: Workspace) => setState(current => current ? { ...current, workspace } : current);
  const mutate = async (url: string, body: unknown) => {
    const response = await fetch(url, scoped({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.message || errorMessage(payload.error || 'request_failed'));
    if (payload.workspace) applyWorkspace(payload.workspace);
    return payload;
  };
  const research = async (text: string, blockId?: BlockId, retryTask?: Task, chosenScenario?: Scenario) => {
    const current = chosenScenario || scenario;
    if (!current || busy) return;
    setBusy(true); setError(''); setResponseDiagnostic(null); setLatest('El coordinador está interpretando el pedido…');
    const abort = new AbortController(); request.current = abort;
    try {
      const response = await fetch('/api/research', { method: 'POST', signal: abort.signal,
        headers: { 'Content-Type': 'application/json', 'x-workspace-id': workspaceRef.current }, body: JSON.stringify({ scenarioId: current.id,
          expectedRevision: current.revision, instruction: text, blockId, retryTaskId: retryTask?.id }) });
      if (!response.ok) { const payload = await response.json(); setResponseDiagnostic(payload.diagnostic ?? null); throw new Error(payload.message || errorMessage(payload.error || 'research_failed')); }
      if (!response.body) throw new Error('stream_unavailable');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let remainder = '';
      let failedInThisRun = false;
      const receive = (line: string) => {
        if (!line.trim()) return;
        const event = JSON.parse(line) as StreamEvent;
        const failed = event.type === 'run_failed' || event.type === 'task_failed';
        if (failed) failedInThisRun = true;
        if (!(event.type === 'run_completed' && failedInThisRun)) setLatest(errorMessage(event.summary));
        if (event.workspace) applyWorkspace(event.workspace);
        if (event.type === 'plan_ready' && event.scenarioId !== current.id) setScenarioId(event.scenarioId);
        if (event.type === 'clarification_required') setError(`Se necesita una aclaración: ${event.summary}`);
        if (failed) setError(errorMessage(event.summary));
      };
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        remainder += decoder.decode(value, { stream: true });
        const lines = remainder.split('\n'); remainder = lines.pop() || '';
        for (const line of lines) receive(line);
      }
      remainder += decoder.decode(); if (remainder.trim()) receive(remainder);
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) setError(e instanceof Error ? e.message : 'research_failed');
    } finally {
      request.current = null; setBusy(false); await refresh().catch(() => {}); void loadList().catch(() => {});
    }
  };
  const cancel = async () => {
    setLatest('Cancelando: esperando el cierre del proceso…');
    try { await mutate('/api/research', { action: 'cancel' }); }
    catch (e) { setError(e instanceof Error ? e.message : 'cancellation_failed'); }
    // Keep reading until server cleanup closes the run; do not unlock optimistically.
  };
  const saveBrief = async (brief: Brief) => {
    if (!scenario) return;
    setError('');
    try { await mutate('/api/workspace', { action: 'brief', scenarioId: scenario.id, expectedRevision: scenario.revision, brief }); setLatest('Brief guardado localmente.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'save_failed'); }
  };
  const startOver = async () => {
    if (busy) return;
    setConfirmReset(false);
    setError('');
    try {
      const response = await fetch('/api/workspaces', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', product: newProduct.trim() || undefined, market: newMarket.trim() || undefined }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || errorMessage(payload.error || 'request_failed'));
      setWorkspaces(payload.workspaces); setNewProduct(''); setNewMarket('');
      await openWorkspace(payload.workspaceId);
      setLatest('Investigación nueva. Las anteriores siguen guardadas en el selector.');
    } catch (e) { setError(e instanceof Error ? e.message : 'create_failed'); }
  };
  const createVariant = async () => {
    const name = variantName;
    setVariantName(null);
    if (!scenario || busy || !name?.trim()) return;
    try {
      const payload = await mutate('/api/workspace', { action: 'variant', scenarioId: scenario.id, expectedRevision: scenario.revision, name: name.trim() });
      setScenarioId(payload.scenarioId);
      setInstruction(`Explorar ${name.trim()} como mercado. Evaluar la pertinencia del idioma sin asumir preferencia u obligación.`);
      setLatest('Variante creada desde el estado actual. Revisar el brief antes de investigar.');
    } catch (e) { setError(e instanceof Error ? e.message : 'variant_failed'); }
  };
  const decide = async (proposalId: string, action: 'accept' | 'reject' | 'correct', text: string, conditions: string, consequential: boolean) => {
    if (!scenario || busy) return;
    try {
      const payload = await mutate('/api/decisions', { scenarioId: scenario.id, expectedRevision: scenario.revision, proposalId, action, text, conditions, consequential });
      setLatest('Decisión humana guardada.');
      if (payload.followUpInstruction) {
        const current = payload.workspace.scenarios.find((s: Scenario) => s.id === scenario.id);
        if (state?.configuration.ready) await research(payload.followUpInstruction, undefined, undefined, current);
        else { setInstruction(payload.followUpInstruction); setError('Decisión guardada. Configurar el presupuesto antes de proponer cambios relacionados.'); }
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'decision_failed'); }
  };
  if (!state || !scenario) return <main className="loading"><div className="brand-mark">G</div><h1>Canvas GTM</h1><p>{error || 'Abriendo el espacio de trabajo local…'}</p>{error && <button onClick={() => void refresh().catch(e => setError(e.message))}>Volver a intentar</button>}</main>;
  const tasks = state.workspace.tasks.filter(t => t.scenarioId === scenario.id);
  const pending = scenario.proposals.filter(p => p.status === 'pending').length;
  const base = scenario.origin && state.workspace.scenarios.find(s => s.id === scenario.origin!.scenarioId);
  const staleBase = base && base.revision !== scenario.origin?.revision;
  const events = state.workspace.events.filter(e => e.scenarioId === scenario.id).slice(-8).reverse();
  const lastRun = [...state.workspace.runs].reverse().find(r => r.scenarioId === scenario.id);
  const latestFailure = [...state.workspace.events].reverse().find(event => event.scenarioId === scenario.id
    && event.runId === lastRun?.id && (event.type === 'run_failed' || event.type === 'task_failed'));
  const failureDiagnostic = responseDiagnostic || latestFailure?.diagnostic;
  return <>
    <header className="topbar"><div className="brand"><span className="brand-mark">G</span><div><strong>Canvas GTM</strong><span>De la evidencia a la oportunidad</span></div></div>
      <div className="topbar-right"><span className="local-label"><span className="live-dot" />ESPACIO LOCAL</span><label className="workspace-picker"><span>INVESTIGACIÓN</span><select value={workspaceRef.current} disabled={busy} onChange={e => void openWorkspace(e.target.value).catch(err => setError(err.message))}>{workspaces.map(w => <option key={w.id} value={w.id}>{w.product} · {w.market} · {w.updatedAt ? new Date(w.updatedAt).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' }) : ''}</option>)}</select></label><a href={`/api/export?format=md&workspace=${workspaceRef.current}`} className="top-link">Exportar Markdown</a><a href={`/api/export?format=json&workspace=${workspaceRef.current}`} className="top-link">JSON ↗</a></div>
    </header>
    <main className="workspace">
      <div className="page-heading"><div><div className="eyebrow">EXPLORACIÓN DE MERCADO CON DECISIONES HUMANAS</div><h1>La próxima oportunidad,<br /><span>basada en evidencia.</span></h1><p>Investigar el mercado. Conectar las implicaciones. Mantener las decisiones humanas.</p></div>
        <div className="scenario-control"><label>ESCENARIO<select value={scenarioId} onChange={e => { setScenarioId(e.target.value); setSelected(null); }} disabled={busy}>{state.workspace.scenarios.map(s => <option value={s.id} key={s.id}>{s.name}</option>)}</select></label><div className="scenario-actions"><button className="secondary" disabled={busy} onClick={() => { setConfirmReset(false); setVariantName('Cataluña'); }}>+ Nueva variante</button><button className="secondary" disabled={busy} title="Crear una investigación nueva; las anteriores se conservan" onClick={() => { setVariantName(null); setConfirmReset(true); }}>Nuevo</button></div>
          {variantName !== null && <form className="inline-confirm" onSubmit={e => { e.preventDefault(); void createVariant(); }}><label className="tiny">Nombre de la variante. El escenario base no se modificará.<input autoFocus value={variantName} maxLength={100} onChange={e => setVariantName(e.target.value)} /></label><div className="scenario-actions"><button type="button" className="quiet" onClick={() => setVariantName(null)}>Cancelar</button><button type="submit" disabled={!variantName.trim()}>Crear variante</button></div></form>}
          {confirmReset && <form className="inline-confirm" aria-label="Nueva investigación" onSubmit={e => { e.preventDefault(); void startOver(); }}><p className="tiny">Nueva investigación desde cero. La actual queda guardada y se puede volver a abrir desde el selector.</p><label className="tiny">Producto<input autoFocus value={newProduct} maxLength={200} placeholder="Manual digital de anestesiología" onChange={e => setNewProduct(e.target.value)} /></label><label className="tiny">Mercado<input value={newMarket} maxLength={100} placeholder="España" onChange={e => setNewMarket(e.target.value)} /></label><div className="scenario-actions"><button type="button" className="quiet" onClick={() => setConfirmReset(false)}>Cancelar</button><button type="submit">Crear investigación</button></div></form>}<span className="tiny muted">Revisión humana {scenario.revision}{scenario.origin ? ' · variante derivada' : ' · escenario base'}</span></div>
      </div>
      {state.runningElsewhere && <div className="notice warning">Hay una investigación en curso en otra investigación guardada. Solo se ejecuta una a la vez; esta queda editable, pero no se puede lanzar hasta que termine.</div>}
      {staleBase && <div className="notice warning">El escenario base cambió desde que se creó esta variante. Este estado sigue siendo independiente; puede requerir una nueva revisión.</div>}
      {!state.configuration.ready && <div className="notice setup"><span className="notice-icon">!</span><div><strong>Completar la configuración local para investigar.</strong><p>{!state.configuration.keyPresent && <>Configurar <code>ANTHROPIC_API_KEY</code> en <code>.env.local</code>. </>}{!state.configuration.budgetPresent && <>Configurar un valor positivo en <code>RUN_BUDGET_USD</code> en <code>.env.local</code>. </>}No incluir secretos aquí. El brief puede guardarse durante la configuración; reiniciar el servidor después de cambiar las variables de entorno.</p></div></div>}
      <div className="config-line"><span>Claude Agent SDK · {state.configuration.modelMode === 'default' ? 'modelo predeterminado del SDK' : 'modelo configurado localmente'}</span><span>{state.configuration.budgetPresent ? `${state.configuration.budgetSource} configurado · los costos informados son estimaciones` : 'Presupuesto de investigación sin configurar'}</span></div>
      <BriefForm brief={scenario.brief} scenarioId={scenario.id} busy={busy} onSave={saveBrief} />
      <section className="composer"><div className="composer-heading"><div><h2>¿Qué se debe explorar?</h2><p>Una instrucción. Investigadores independientes. Implicaciones conectadas.</p></div><span className="badge neutral">{state.configuration.research.mode === 'fast' ? 'Modo rápido' : 'Modo completo'} · {state.configuration.research.rounds} {state.configuration.research.rounds === 1 ? 'ronda' : 'rondas'} · {state.configuration.research.concurrency} simultáneos · investigación corta: {state.configuration.research.searches} {state.configuration.research.searches === 1 ? 'búsqueda' : 'búsquedas'} + hasta {state.configuration.research.fetches} fuentes · {state.configuration.research.model}</span></div>
        <div className="composer-input"><textarea value={instruction} onChange={e => setInstruction(e.target.value)} placeholder="Explorar el mercado de España para este manual. Encontrar oportunidades respaldadas y explicitar lo desconocido." rows={2} maxLength={6000} /><button disabled={busy || !state.configuration.ready || Boolean(state.runningElsewhere)} onClick={() => void research(instruction.trim() || 'Explorar este producto y mercado. Encontrar oportunidades respaldadas, explicitar lo desconocido y preservar las decisiones humanas.')}>{busy ? 'Investigando…' : 'Iniciar investigación'} <span>↗</span></button></div>
      </section>
      {error && <div className="notice danger" role="alert"><span>{errorMessage(error)}</span><button className="quiet" onClick={() => setError('')}>Cerrar</button></div>}
      {failureDiagnostic && <section className="notice danger" aria-label="Diagnóstico de configuración del SDK"><div><strong>Último fallo de configuración del SDK</strong><p className="tiny">La investigación se detuvo; los permisos no se ampliaron.</p><details open><summary>Detalle seguro del fallo</summary><ul className="tiny">{diagnosticLines(failureDiagnostic).map(line => <li key={line}>{line}</li>)}</ul></details></div></section>}
      <section className={`run-status ${busy ? 'is-active' : ''}`} aria-live="polite"><div><span className={`live-dot ${busy ? 'pulse' : ''}`} /><strong>{busy ? 'Investigación en curso' : 'Espacio de trabajo listo'}</strong><span className="status-summary">{latest}</span></div>{busy ? <button className="secondary" onClick={() => void cancel()}>Cancelar</button> : <span className="tiny muted">{pending} actualizaciones por revisar{lastRun && ` · Última ejecución: ${label(lastRun.status)}`}</span>}</section>
      <div className="canvas-heading"><h2>El panorama completo</h2><div className="legend"><span><i className="evidence-dot user_input" />Aportado</span><span><i className="evidence-dot sourced" />Documentado</span><span><i className="evidence-dot inference" />Hipótesis</span></div></div>
      <section className="canvas-grid" aria-label="Canvas de salida al mercado">{BLOCK_IDS.map(block => <BlockCard key={block} block={block} scenario={scenario} tasks={tasks} onOpen={() => setSelected(block)} />)}</section>
      <section className="activity"><div><h2>Actividad de investigación</h2><p className="tiny muted">Progreso observado, sin razonamiento interno.</p></div><div className="activity-list">{events.length ? events.map(event => <div className="activity-row" key={event.id}><span className={`activity-dot ${event.type.includes('failed') ? 'failed' : ''}`} /><time>{timeOnly(event.at)}</time><p>{errorMessage(event.summary)}{event.diagnostic && <span className="tiny">{diagnosticLines(event.diagnostic).map(line => <span key={line}><br />{line}</span>)}</span>}</p>{event.blocks.length > 0 && <span className="tiny muted">{event.blocks.map(block => BLOCK_META[block].title).join(' · ')}</span>}</div>) : <p className="muted">Todavía no hay investigación. El brief es el punto de partida, no un hallazgo generado.</p>}</div></section>
      <footer className="workspace-footer"><span>MVP local, un solo usuario · Validación humana pendiente</span><span>Evidencia documental ≠ intención de compra ≠ validación clínica</span>{lastRun && <span>Última estimación de costo informada: {lastRun.reportedCostUsd === null ? 'desconocido' : `$${lastRun.reportedCostUsd.toFixed(4)}`}</span>}</footer>
    </main>
    {selected && <BlockPanel key={`${scenario.id}-${selected}`} block={selected} scenario={scenario} tasks={tasks} busy={busy} ready={state.configuration.ready} onClose={() => setSelected(null)} onResearch={(text, block) => research(text, block)} onRetry={task => research(`Reintentar investigador ${task.researcher}`, undefined, task)} onDecision={decide} />}
  </>;
}

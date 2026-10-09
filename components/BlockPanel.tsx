'use client';
import { useEffect, useRef, useState } from 'react';
import { BLOCK_META, type BlockId, type Item, type Scenario, type Source, type Task } from '../lib/contracts';
import { dateTime, diagnosticLines, errorMessage, label, sourceDate } from '../lib/i18n';

function Sources({ sourceIds, sources }: { sourceIds: string[]; sources: Source[] }) {
  if (!sourceIds.length) return <p className="tiny muted">Este elemento no tiene una fuente documental observada.</p>;
  return <div className="sources">{sourceIds.map(id => {
    const source = sources.find(s => s.id === id);
    return source ? <div className="source" key={id}>
      <a href={source.url} target="_blank" rel="noreferrer">{source.title} ↗</a>
      <div className="tiny muted">Publicación: {sourceDate(source.publishedAt)} · Actualización: {sourceDate(source.updatedAt)}</div>
      <div className="tiny muted">Consulta: {dateTime(source.consultedAt)} · Página consultada</div>
      <p className="tiny"><span className={`badge ${source.currentness === 'confirmed' ? 'teal' : 'amber'}`}>{label(source.currentness)}</span> {source.currentnessReason}</p>
      {source.corroboratingSourceIds.length > 0 && <div className="tiny muted">Corroboración: {source.corroboratingSourceIds.map(ref => sources.find(s => s.id === ref)?.title || 'Fuente faltante').join(', ')}</div>}
    </div> : <div key={id} className="tiny warning">La referencia de fuente no está disponible.</div>;
  })}</div>;
}
function ItemDetails({ item, sources }: { item: Item; sources: Source[] }) {
  return <article className="item-detail"><div className="item-labels"><span className="badge neutral">{label(item.evidenceKind)}</span><span className="badge amber">{label(item.currentness)}</span></div>
    <p>{item.text}</p><p className="tiny muted">{item.currentnessReason}</p>
    {item.assumptions.length > 0 && <p className="tiny"><strong>Supuestos:</strong> {item.assumptions.join('; ')}</p>}
    {item.pendingChecks.length > 0 && <p className="tiny warning"><strong>Por comprobar:</strong> {item.pendingChecks.join('; ')}</p>}
    <Sources sourceIds={item.sourceIds} sources={sources} />
  </article>;
}
export default function BlockPanel({ block, scenario, tasks, busy, ready, onClose, onResearch, onRetry, onDecision }: {
  block: BlockId; scenario: Scenario; tasks: Task[]; busy: boolean; ready: boolean; onClose: () => void;
  onResearch: (instruction: string, block: BlockId) => Promise<void>; onRetry: (task: Task) => Promise<void>;
  onDecision: (proposalId: string, action: 'accept' | 'reject' | 'correct', text: string, conditions: string, consequential: boolean) => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [instruction, setInstruction] = useState('');
  const [note, setNote] = useState('');
  const [conditions, setConditions] = useState('');
  const [consequential, setConsequential] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => { dialog.current?.showModal(); return () => dialog.current?.close(); }, []);
  const updates = scenario.proposals.filter(p => p.blockId === block && p.status === 'pending');
  const failed = tasks.filter(t => t.blocks.includes(block) && ['error', 'cancelled', 'interrupted', 'stale'].includes(t.status)).slice(-2);
  const decide = async (proposalId: string, action: 'accept' | 'reject' | 'correct') => {
    setSaving(true);
    try { await onDecision(proposalId, action, note, conditions, consequential); setNote(''); setConditions(''); }
    finally { setSaving(false); }
  };
  const actions = (proposalId: string) => <div className="actions"><button disabled={busy || saving} onClick={() => void decide(proposalId, 'accept')}>Aceptar</button><button className="secondary" disabled={busy || saving || !note.trim()} onClick={() => void decide(proposalId, 'correct')}>Guardar corrección</button><button className="quiet" disabled={busy || saving} onClick={() => void decide(proposalId, 'reject')}>Descartar</button></div>;
  return <dialog ref={dialog} className="detail-panel" onCancel={onClose} onClose={onClose} aria-labelledby="panel-title">
    <header className="panel-header"><div><span className="eyebrow">{BLOCK_META[block].eyebrow}</span><h2 id="panel-title">{BLOCK_META[block].title}</h2></div><button className="close-button" aria-label="Cerrar detalle" onClick={onClose}>×</button></header>
    <div className="panel-scroll">
      <section><h3>Instrucción local</h3><p className="muted tiny">El coordinador interpreta las dependencias antes de investigar.</p><textarea value={instruction} onChange={e => setInstruction(e.target.value)} placeholder={block === 'organizations' ? 'Explorar instituciones en Cataluña y la pertinencia comercial del catalán.' : '¿Qué se debe explorar o reconsiderar en este bloque?'} rows={3} maxLength={6000} />
        <button disabled={busy || !ready || !instruction.trim()} onClick={() => void onResearch(instruction, block)}>Investigar este pedido</button></section>
      {failed.map(task => <div className="notice danger" key={task.id}><div><span>Investigador {task.researcher}: {task.error ? errorMessage(task.error) : label(task.status)}</span>{task.diagnostic && <ul className="tiny">{diagnosticLines(task.diagnostic).map(line => <li key={line}>{line}</li>)}</ul>}</div><button className="secondary" disabled={busy || !ready} onClick={() => void onRetry(task)}>Reintentar tarea</button></div>)}
      <section><h3>Contenido aceptado <span className="count">{scenario.accepted[block].length}</span></h3>
        {scenario.accepted[block].length ? scenario.accepted[block].map(item => <ItemDetails key={item.id} item={item} sources={scenario.sources} />) : <p className="muted">No hay contenido aceptado. La investigación propone; las decisiones son humanas.</p>}</section>
      {(updates.length > 0 || (block === 'paths' && scenario.opportunities.some(o => o.decisionStatus === 'pending'))) && <section className="decision-editor"><h3>Tu decisión</h3>
        <label>Nota o texto de reemplazo<textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Opcional para aceptar o descartar. Obligatorio para corregir." rows={3} maxLength={12000} /></label>
        <label>Condiciones<input value={conditions} onChange={e => setConditions(e.target.value)} placeholder="Por ejemplo: dentro de 12 meses, sujeto a confirmación de Desarrollo" maxLength={3000} /></label>
        <label className="checkbox-label"><input type="checkbox" checked={consequential} onChange={e => setConsequential(e.target.checked)} />Proponer cambios relacionados después de guardar</label>
        <p className="tiny muted">Una decisión no demuestra demanda ni aprobación de Desarrollo.</p></section>}
      <section><h3>Actualizaciones propuestas <span className="count amber">{updates.length}</span></h3>
        {!updates.length && <p className="muted">No hay actualizaciones pendientes para este bloque.</p>}
        {updates.map(proposal => <div className="proposal" key={proposal.id}><div className="proposal-head"><span className="badge amber">Por revisar</span><span className="tiny muted">Revisión base {proposal.baseRevision}</span></div>
          <p className="tiny muted">{proposal.reason}</p>{proposal.items.map(item => <ItemDetails key={item.id} item={item} sources={scenario.sources} />)}{actions(proposal.id)}</div>)}
      </section>
      {block === 'paths' && <section><h3>Oportunidades comerciales</h3><p className="tiny muted">Necesidad documentada + encaje inferido ≠ intención de compra. Cero propuestas respaldadas es un resultado válido.</p>
        {scenario.opportunities.length === 0 && <p className="muted">Todavía no hay oportunidades respaldadas.</p>}
        {scenario.opportunities.map(opportunity => <article className="proposal" key={opportunity.id}><span className={`badge ${opportunity.decisionStatus === 'pending' ? 'amber' : 'neutral'}`}>{label(opportunity.decisionStatus)}</span><h4>{opportunity.title}</h4>
          <p className="tiny">{label(opportunity.commercialPath)} · Segmento {opportunity.segmentId.slice(0, 8)}</p><p>{opportunity.documentedNeed}</p><p><strong>Encaje:</strong> {opportunity.fitEvidence}</p><p><strong>Próxima validación:</strong> {opportunity.nextValidation}</p><p className="tiny warning">{opportunity.unresolvedChecks.join('; ')}</p><Sources sourceIds={opportunity.sourceIds} sources={scenario.sources} />{opportunity.decisionStatus === 'pending' && actions(opportunity.id)}</article>)}
      </section>}
      {block === 'priorities' && scenario.pending.length > 0 && <section><h3>Dependencias abiertas e hipótesis sin respaldo</h3><ul className="pending-list">{scenario.pending.map((pending, index) => <li key={index}>{pending}</li>)}</ul></section>}
      <details><summary>Historial de decisiones</summary>{scenario.decisions.map(decision => <p className="tiny" key={decision.id}><strong>{label(decision.action)}</strong> · {decision.text || 'Sin nota'} {decision.conditions && `· ${decision.conditions}`}<br /><span className="muted">{dateTime(decision.at)}</span></p>)}</details>
    </div>
  </dialog>;
}

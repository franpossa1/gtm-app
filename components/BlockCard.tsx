'use client';
import { BLOCK_META, type BlockId, type Scenario, type Task } from '../lib/contracts';

export default function BlockCard({ block, scenario, tasks, onOpen }: { block: BlockId; scenario: Scenario; tasks: Task[]; onOpen: () => void }) {
  const meta = BLOCK_META[block];
  const pending = scenario.proposals.filter(p => p.blockId === block && p.status === 'pending');
  const accepted = scenario.accepted[block];
  const latest = [...tasks].reverse().find(task => task.blocks.includes(block));
  const researching = tasks.some(task => task.status === 'researching' && task.blocks.includes(block));
  const hasError = latest && ['error', 'interrupted', 'cancelled'].includes(latest.status);
  const status = researching ? 'Investigando' : pending.length ? 'Por revisar' : hasError ? 'Requiere reintento' : accepted.length ? 'Aceptado' : 'Sin investigar';
  const items = pending.length ? pending[pending.length - 1].items : accepted;
  const statusClass = researching ? 'teal pulse' : pending.length ? 'amber' : hasError ? 'rose' : accepted.length ? 'teal' : 'neutral';
  return <button className="block-card" data-block={block} onClick={onOpen} aria-label={`Abrir ${meta.title}`}>
    <div className="card-top"><span className="eyebrow">{meta.eyebrow}</span><span className={`badge ${statusClass}`}>{status}</span></div>
    <h2>{meta.title}</h2>
    <div className="card-content">
      {items.length ? <ul>{items.slice(0, 2).map(item => <li key={item.id}><span className={`evidence-dot ${item.evidenceKind}`} />{item.text}</li>)}</ul>
        : <p className="empty-copy">{meta.empty}</p>}
    </div>
    <div className="card-bottom"><span>{pending.length ? `${pending.length} actualización${pending.length > 1 ? 'es' : ''} propuesta${pending.length > 1 ? 's' : ''}` : `${accepted.length} elemento${accepted.length !== 1 ? 's' : ''} aceptado${accepted.length !== 1 ? 's' : ''}`}</span><span className="open-card">Ver detalle ↗</span></div>
  </button>;
}

'use client';
import { useEffect, useState } from 'react';
import type { Brief } from '../lib/contracts';

export default function BriefForm({ brief, scenarioId, busy, onSave }: {
  brief: Brief; scenarioId: string; busy: boolean; onSave: (brief: Brief) => Promise<void>;
}) {
  const [draft, setDraft] = useState(brief);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setDraft(brief); }, [scenarioId]);
  const field = (key: keyof Brief, value: string) => setDraft(current => ({ ...current, [key]: value }));
  return <details className="brief-sheet" open>
    <summary><span>Brief del producto</span><span className="muted">Comenzar con lo que realmente se conoce</span></summary>
    <form onSubmit={async e => { e.preventDefault(); setSaving(true); try { await onSave(draft); } finally { setSaving(false); } }}>
      <div className="brief-grid">
        <label>Producto<input value={draft.product} onChange={e => field('product', e.target.value)} required maxLength={6000} /></label>
        <label>Mercado<input value={draft.market} onChange={e => field('market', e.target.value)} required maxLength={6000} /></label>
        <label>¿Qué hace?<textarea value={draft.description} onChange={e => field('description', e.target.value)} placeholder="Capacidades, usuarios y restricciones. Lo desconocido puede quedar pendiente." maxLength={12000} rows={2} /></label>
        <label>Evidencia existente<textarea value={draft.evidence} onChange={e => field('evidence', e.target.value)} placeholder="Resultados conocidos, evidencia de clientes, extractos o URLs públicas. Sin API keys." maxLength={12000} rows={2} /></label>
      </div>
      <div className="brief-footer"><span className="muted">Guardado local. La investigación no reemplaza el contenido aceptado.</span><button className="secondary" disabled={busy || saving}>{saving ? 'Guardando…' : 'Guardar brief'}</button></div>
    </form>
  </details>;
}

import { dateTime, label, sourceDate } from '../i18n';
import { BLOCK_IDS, BLOCK_META, type Workspace } from '../contracts';

export function markdownSnapshot(workspace: Workspace) {
  const lines = ['# Estado del Canvas GTM', '', 'La evidencia documental y las decisiones humanas no demuestran intención de compra ni validación clínica.', ''];
  for (const scenario of workspace.scenarios) {
    lines.push(`## ${scenario.name} · revisión ${scenario.revision}`, '', `Producto: ${scenario.brief.product}`, `Mercado: ${scenario.brief.market}`,
      `Descripción: ${scenario.brief.description || 'Sin aportar'}`, `Evidencia aportada: ${scenario.brief.evidence || 'Sin aportar'}`, '');
    if (scenario.origin) lines.push(`Derivado del escenario ${scenario.origin.scenarioId}, revisión ${scenario.origin.revision}, el ${dateTime(scenario.origin.at)}`, '');
    for (const block of BLOCK_IDS) {
      lines.push(`### ${BLOCK_META[block].title}`, '');
      for (const item of scenario.accepted[block]) lines.push(`- [aceptado / ${label(item.evidenceKind)} / ${label(item.currentness)}] ${item.text}`, `  Fuentes: ${item.sourceIds.join(', ') || 'ninguna'}`, `  Pendientes: ${item.pendingChecks.join('; ') || 'ninguna'}`);
      for (const proposal of scenario.proposals.filter(p => p.blockId === block)) {
        lines.push(`- Actualización ${proposal.id}: ${label(proposal.status)} · revisión base ${proposal.baseRevision}`, `  ${proposal.reason}`);
        for (const item of proposal.items) lines.push(`  - [${label(item.evidenceKind)} / ${label(item.currentness)}] ${item.text}`, `    Supuestos: ${item.assumptions.join('; ') || 'ninguna'}`, `    Pendientes: ${item.pendingChecks.join('; ') || 'ninguna'}`, `    Fuentes: ${item.sourceIds.join(', ') || 'ninguna'}`);
      }
      lines.push('');
    }
    lines.push('### Oportunidades comerciales', '');
    for (const opportunity of scenario.opportunities) lines.push(`- ${opportunity.title} [${label(opportunity.decisionStatus)}]`,
      `  Segmento: ${opportunity.segmentId} · Camino: ${label(opportunity.commercialPath)}`, `  Necesidad: ${opportunity.documentedNeed}`,
      `  Encaje: ${opportunity.fitEvidence}`, `  Próxima validación: ${opportunity.nextValidation}`, `  Sin resolver: ${opportunity.unresolvedChecks.join('; ')}`, `  Fuentes: ${opportunity.sourceIds.join(', ')}`);
    lines.push('', '### Fuentes', '');
    for (const source of scenario.sources) lines.push(`- ${source.id}: ${source.title} — ${source.url}`, `  Publicación: ${sourceDate(source.publishedAt)}; actualización: ${sourceDate(source.updatedAt)}; consulta: ${dateTime(source.consultedAt)}`,
      `  ${label(source.verification)} · ${label(source.currentness)}: ${source.currentnessReason}`, `  Corroboración: ${source.corroboratingSourceIds.join(', ') || 'ninguna'}`);
    lines.push('', '### Decisiones humanas', '');
    for (const decision of scenario.decisions) lines.push(`- ${dateTime(decision.at)}: ${label(decision.action)} — ${decision.text || 'Sin nota'}; condiciones: ${decision.conditions || 'ninguna'}`);
    lines.push('', '### Comprobaciones pendientes', '', ...scenario.pending.map(check => `- ${check}`), '');
  }
  lines.push('## Costos informados por ejecución', '');
  for (const run of workspace.runs) lines.push(`- ${run.id}: ${label(run.status)}; estimación de costo informada: ${run.reportedCostUsd === null ? 'desconocida' : '$' + run.reportedCostUsd.toFixed(4)}. No es un estado de facturación.`);
  return lines.join('\n');
}

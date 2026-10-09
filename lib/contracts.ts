import { z } from 'zod';

export const BLOCK_IDS = ['product', 'audiences', 'problems', 'market', 'paths', 'value', 'organizations', 'channels', 'priorities'] as const;
export const BlockIdSchema = z.enum(BLOCK_IDS);
export type BlockId = z.infer<typeof BlockIdSchema>;
export const RESEARCHERS = ['A', 'B', 'C', 'D'] as const;
export type Researcher = typeof RESEARCHERS[number];
const text = z.string().trim().min(1).max(6000);
const strings = z.array(z.string().max(2000)).max(15);
const url = z.string().url().refine(v => v.startsWith('https://') || v.startsWith('http://'));
export const SourceSchema = z.object({
  id: text, url, title: text, publishedAt: z.string().nullable(), updatedAt: z.string().nullable(),
  currentness: z.enum(['confirmed', 'uncertain', 'outdated']), currentnessReason: text,
  corroboratingSourceIds: strings,
});
export const ItemSchema = z.object({
  id: text, blockId: BlockIdSchema, text, evidenceKind: z.enum(['user_input', 'sourced', 'inference', 'unknown']),
  sourceIds: strings, assumptions: strings, pendingChecks: strings,
  segmentId: z.string().nullable(), commercialPathId: z.string().nullable(), dependencyIds: strings,
  currentness: z.enum(['confirmed', 'uncertain', 'outdated']), currentnessReason: text,
});
export const CommercialProposalSchema = z.object({
  id: text, segmentId: text, commercialPath: z.enum(['sell_existing', 'adapt', 'offer_development']),
  title: text, documentedNeed: text, sourceIds: strings, fitEvidence: text,
  unresolvedChecks: strings, nextValidation: text,
});
export const ResearchResultSchema = z.object({
  summary: text, items: z.array(ItemSchema).max(27), sources: z.array(SourceSchema).max(15),
  commercialProposals: z.array(CommercialProposalSchema).max(9),
  implications: z.array(z.object({ blockId: BlockIdSchema, reason: text })).max(9),
  uncertainOpportunities: strings,
}).refine(r => r.items.length + r.commercialProposals.length > 0, 'Empty research result');
// The provider receives the object schema; semantic checks run again after parsing.
export const ResearchOutputSchema = ResearchResultSchema;
export const PlanSchema = z.object({
  interpretation: text, scope: z.enum(['current_scenario', 'new_variant']), variantName: z.string().nullable(),
  changedPremises: z.array(z.object({ key: z.enum(['geography', 'buyer', 'language', 'path', 'horizon', 'list']),
    value: text, kind: z.enum(['exploration', 'decision']) })).max(6),
  affectedBlocks: z.array(BlockIdSchema).min(1).max(9),
  tasks: z.array(z.object({ researcher: z.enum(RESEARCHERS), instruction: text })).max(4),
  clarification: z.string().nullable(),
});
export const BriefSchema = z.object({ product: text, description: z.string().max(12000),
  evidence: z.string().max(12000), market: text });
export const ResearchInputSchema = z.object({
  scenarioId: text, expectedRevision: z.number().int().nonnegative(), instruction: text,
  blockId: BlockIdSchema.optional(), brief: BriefSchema.optional(), retryTaskId: text.optional(),
  variantName: z.string().trim().min(1).max(100).optional(),
});
export const DecisionInputSchema = z.object({
  scenarioId: text, expectedRevision: z.number().int().nonnegative(), proposalId: text,
  action: z.enum(['accept', 'reject', 'correct']), text: z.string().max(12000),
  conditions: z.string().max(3000), consequential: z.boolean(),
});
export type Brief = z.infer<typeof BriefSchema>;
export type Plan = z.infer<typeof PlanSchema>;
export type ResearchResult = z.infer<typeof ResearchResultSchema>;
export type Source = z.infer<typeof SourceSchema> & { consultedAt: string; publicationDateStatus: 'known' | 'not_reported';
  verification: 'page_fetched'; currentnessCheckedAt: string | null };
export type Item = z.infer<typeof ItemSchema>;
export type CommercialProposal = z.infer<typeof CommercialProposalSchema> & { decisionStatus: 'pending' | 'accepted' | 'rejected' };
export type TaskStatus = 'pending' | 'researching' | 'completed' | 'error' | 'cancelled' | 'interrupted' | 'stale';
export interface SdkInitDiagnostic {
  kind: 'sdk_init_mismatch';
  context: 'coordinator' | 'researcher';
  reasons: ('unexpected_tools' | 'unexpected_mcp' | 'unexpected_permission_mode')[];
  expectedTools: string[]; actualTools: string[]; unexpectedTools: string[];
  actualToolCount: number | null; toolListsTruncated: boolean;
  mcpCount: number | null; mcpCountCapped: boolean;
  expectedPermissionMode: 'dontAsk';
  actualPermissionMode: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | 'dontAsk' | 'auto' | 'UNKNOWN';
}
export interface Task { id: string; runId: string; scenarioId: string; baseRevision: number; round: number;
  researcher: Researcher; instruction: string; blocks: BlockId[]; status: TaskStatus;
  startedAt: string | null; finishedAt: string | null; error: string | null; reportedCostUsd: number | null;
  diagnostic?: SdkInitDiagnostic }
export interface UpdateProposal { id: string; taskId: string; baseRevision: number; blockId: BlockId;
  items: Item[]; reason: string; dependencies: string[]; status: 'pending' | 'accepted' | 'rejected' | 'superseded' | 'stale'; createdAt: string }
export interface Decision { id: string; proposalId: string; action: 'accept' | 'reject' | 'correct';
  text: string; conditions: string; at: string; revision: number }
export interface Scenario { id: string; name: string; revision: number; brief: Brief;
  origin: { scenarioId: string; revision: number; at: string } | null;
  accepted: Record<BlockId, Item[]>; sources: Source[]; proposals: UpdateProposal[];
  opportunities: CommercialProposal[]; decisions: Decision[]; instructions: { text: string; at: string; blockId: BlockId | null }[];
  pending: string[]; createdAt: string }
export interface Run { id: string; scenarioId: string; status: 'running' | 'completed' | 'partial' | 'cancelled' | 'clarification' | 'interrupted';
  startedAt: string; finishedAt: string | null; reportedCostUsd: number | null; budgetUsd: number; interpretation: string; clarification: string | null }
export interface TimelineEvent { id: string; type: string; runId: string; scenarioId: string; taskId: string | null;
  summary: string; at: string; blocks: BlockId[]; diagnostic?: SdkInitDiagnostic }
export interface Workspace { version: 1; scenarios: Scenario[]; tasks: Task[]; runs: Run[]; events: TimelineEvent[] }
export interface Configuration { keyPresent: boolean; budgetPresent: boolean; modelMode: 'default' | 'override';
  budgetSource: 'RUN_BUDGET_USD' | 'SPIKE_MAX_BUDGET_USD' | 'missing'; ready: boolean }
export interface WorkspaceResponse { workspace: Workspace; configuration: Configuration; activeRun: string | null }
export interface StreamEvent extends TimelineEvent { workspace?: Workspace }

export const BLOCK_META: Record<BlockId, { title: string; eyebrow: string; empty: string; researcher: Researcher }> = {
  product: { title: 'Producto y evidencia', eyebrow: '01 / BASE', empty: 'Datos aportados, resultados conocidos y posibles adaptaciones.', researcher: 'D' },
  audiences: { title: 'Públicos y compradores', eyebrow: '02 / PERSONAS', empty: 'Quién utiliza, decide y compra, sin asumir intención de compra.', researcher: 'A' },
  problems: { title: 'Problemas y alternativas', eyebrow: '03 / NECESIDAD', empty: 'Necesidades documentadas y alternativas utilizadas actualmente.', researcher: 'B' },
  market: { title: 'Tamaño de mercado', eyebrow: '04 / ESCALA', empty: 'Método defendible, fuentes y vacíos. Nunca un TAM inventado.', researcher: 'A' },
  paths: { title: 'Caminos comerciales', eyebrow: '05 / OPORTUNIDAD', empty: 'Comercializar el manual, explorar adaptaciones u ofrecer desarrollo relacionado.', researcher: 'D' },
  value: { title: 'Propuesta de valor', eyebrow: '06 / ENCAJE', empty: 'Beneficios respaldados por el brief, con nuevas hipótesis identificadas.', researcher: 'B' },
  organizations: { title: 'Organizaciones', eyebrow: '07 / CONEXIONES', empty: 'Instituciones pertinentes y roles de decisión. Sin contactos inventados.', researcher: 'C' },
  channels: { title: 'Canales y eventos', eyebrow: '08 / ACCESO', empty: 'Acceso al público, eventos vigentes y mensajes preliminares.', researcher: 'C' },
  priorities: { title: 'Prioridades y dependencias', eyebrow: '09 / PRÓXIMO PASO', empty: 'Qué validar primero, dependencias externas y calendario relativo.', researcher: 'D' },
};

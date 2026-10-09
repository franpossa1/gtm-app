const labels: Record<string, string> = {
  pending: 'Pendiente', researching: 'Investigando', completed: 'Completada', error: 'Error', cancelled: 'Cancelada',
  interrupted: 'Interrumpida', stale: 'Obsoleta', running: 'En curso', partial: 'Parcial', clarification: 'Requiere aclaración',
  accepted: 'Aceptada', rejected: 'Descartada', superseded: 'Reemplazada', user_input: 'Dato aportado', sourced: 'Documentado',
  inference: 'Inferencia', unknown: 'Falta comprobar', confirmed: 'Vigencia confirmada', uncertain: 'Vigencia incierta', outdated: 'Desactualizada',
  sell_existing: 'Comercializar el producto', adapt: 'Adaptar el producto', offer_development: 'Ofrecer desarrollo',
  accept: 'Aceptar', reject: 'Descartar', correct: 'Corregir', page_fetched: 'Página consultada', search_result: 'Resultado de búsqueda',
  geography: 'geografía', buyer: 'comprador', language: 'idioma', path: 'camino comercial', horizon: 'horizonte', list: 'lista',
};
export function label(value: string) { return labels[value] || value; }
const errors: Record<string, string> = {
  'Failed to fetch': 'No se pudo conectar con el servidor local. Comprobar que siga en ejecución.',
  'fetch failed': 'No se pudo conectar con el servidor local.',
  'NetworkError when attempting to fetch resource.': 'La conexión con el servidor local falló.',
  origin_not_allowed: 'El origen no está permitido. Abre la aplicación desde localhost, 127.0.0.1 o [::1], con el mismo protocolo y puerto.',
  local_access_only: 'Esta aplicación solo admite acceso local mediante localhost, 127.0.0.1 o [::1].',
  configuration_required: 'Configura ANTHROPIC_API_KEY y un presupuesto positivo en RUN_BUDGET_USD, y reinicia el servidor.',
  research_already_running: 'Hay una investigación activa. Cancela la investigación y espera su cierre antes de continuar.',
  scenario_changed_refresh: 'El escenario cambió. Actualiza la página antes de enviar este cambio.',
  scenario_not_found: 'No se encontró el escenario.', invalid_request: 'La solicitud no tiene el formato esperado.',
  secret_not_allowed: 'Se detectó una credencial. No incluyas secretos en el contenido del canvas.', request_too_large: 'El contenido es demasiado extenso.',
  runtime_directory_not_isolated: 'AGENT_WORK_DIR debe estar separado del código y del directorio de datos.',
  state_format_not_supported: 'El formato de datos guardado no es compatible.', state_could_not_be_loaded: 'No se pudo cargar el archivo de datos local.',
  authentication_source_not_allowed: 'El agente no utilizó la API key configurada. Se detuvo por seguridad.',
  unexpected_runtime_configuration: 'El SDK expuso herramientas o permisos no autorizados. Se detuvo por seguridad.',
  runtime_initialization_missing: 'El SDK no confirmó su configuración inicial.', invalid_structured_output: 'La investigación devolvió una estructura inválida.',
  task_budget_reached: 'Se alcanzó el presupuesto de la tarea.', run_budget_reached: 'Se alcanzó el presupuesto de la investigación.',
  task_turn_limit: 'Se alcanzó el límite de turnos de la tarea.', provider_request_failed: 'No se pudo completar la llamada al proveedor. Revisa la configuración y disponibilidad de la cuenta.',
  task_timeout: 'La tarea alcanzó su límite de tiempo.', cancelled: 'La investigación fue cancelada.', empty_result: 'La investigación no devolvió un resultado utilizable.',
  subprocess_exit_not_observed: 'No se pudo confirmar el cierre del proceso del agente.', research_block_not_owned: 'El investigador respondió fuera de sus bloques asignados.',
  commercial_proposal_not_owned: 'Un investigador no autorizado produjo oportunidades comerciales.', duplicate_source_ids: 'La investigación repitió identificadores de fuentes.',
  task_not_retryable: 'Esta tarea no está disponible para reintento.', proposal_not_found: 'No se encontró la propuesta.',
  proposal_already_decided: 'Esta propuesta ya tiene una decisión.', correction_text_required: 'Ingresa el texto de la corrección.',
  server_restarted: 'El servidor se reinició. La tarea puede reintentarse.', human_revision_changed: 'Cambió la revisión humana: el resultado no se aplicó.',
  run_closed: 'La investigación ya se cerró.', run_could_not_be_saved: 'No se pudo guardar la investigación.', workspace_unavailable: 'No se pudo abrir el espacio de trabajo.',
  request_failed: 'No se pudo completar la solicitud.', research_failed: 'No se pudo completar la investigación.', stream_unavailable: 'El flujo de progreso no está disponible.',
  cancellation_failed: 'No se pudo solicitar la cancelación.', save_failed: 'No se pudo guardar el cambio.', variant_failed: 'No se pudo crear la variante.',
  decision_failed: 'No se pudo guardar la decisión.', operation_failed: 'No se pudo completar la operación.',
};
export function errorMessage(value: string) { return errors[value] || (/^[a-z]+(?:_[a-z]+)+$/.test(value) ? errors.operation_failed : value); }
export const dateTime = (value: string) => new Date(value).toLocaleString('es-AR');
export const timeOnly = (value: string) => new Date(value).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
export function sourceDate(value: string | null) {
  if (!value) return 'fecha no informada';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value.split('-').reverse().join('/');
  return dateTime(value);
}
import type { SdkInitDiagnostic } from './contracts';

export function diagnosticLines(diagnostic: SdkInitDiagnostic) {
  const names = (values: string[]) => values.length ? values.map(name => name === 'UNKNOWN' ? 'nombre no disponible' : name === 'MCP_TOOL' ? 'herramienta MCP (identidad omitida)' : name).join(', ') : 'ninguna';
  const lines = [`Contexto: ${diagnostic.context === 'coordinator' ? 'coordinador sin herramientas web' : 'investigador con herramientas web'}.`];
  if (diagnostic.reasons.includes('unexpected_tools')) {
    lines.push(`Herramientas no esperadas: ${names(diagnostic.unexpectedTools)}.`);
    lines.push(`Herramientas permitidas: ${names(diagnostic.expectedTools)}. Recibidas: ${names(diagnostic.actualTools)}. Cantidad: ${diagnostic.actualToolCount ?? 'desconocida'}.`);
  }
  if (diagnostic.reasons.includes('unexpected_mcp')) lines.push(`Configuraciones MCP recibidas: ${diagnostic.mcpCount ?? 'cantidad desconocida'}${diagnostic.mcpCountCapped ? ' o más' : ''}; permitidas: 0.`);
  if (diagnostic.reasons.includes('unexpected_permission_mode')) lines.push(`Modo de permisos recibido: ${diagnostic.actualPermissionMode === 'UNKNOWN' ? 'desconocido' : diagnostic.actualPermissionMode}; permitido: ${diagnostic.expectedPermissionMode}.`);
  if (diagnostic.toolListsTruncated) lines.push('La lista de herramientas está limitada a 24 nombres por seguridad; los valores inválidos o sensibles se omitieron.');
  return lines;
}

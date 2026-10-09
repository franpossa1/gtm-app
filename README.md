# Canvas GTM — MVP local

Canvas de nueve bloques para investigación de mercado con revisión humana. Incluye brief, escenarios independientes, fuentes observadas, propuestas, decisiones y exportaciones. El caso inicial es el manual digital de anestesiología en España; las capacidades desconocidas permanecen pendientes.

## Iniciar

1. Usar Node.js 22 o posterior. Ejecutar `npm install --no-audit --no-fund`.
2. Configurar `ANTHROPIC_API_KEY` y un `RUN_BUDGET_USD` positivo en `.env.local`. Next.js también carga `.env`; la aplicación no modifica ninguno. No incluir secretos en la UI, el chat ni Git. `.env.example` es solo documentación y no se carga.
3. `CLAUDE_MODEL` es opcional: vacío utiliza el modelo predeterminado del SDK; un valor configura un modelo disponible en la cuenta.
4. Ejecutar `npm run dev` y abrir [el canvas local](http://127.0.0.1:3000). Reiniciar después de cambiar variables de entorno.
5. Guardar el brief e iniciar investigación. Abrir las tarjetas para revisar fuentes, aceptar, descartar o corregir. Una variante conserva el escenario de origen.

El presupuesto legacy `SPIKE_MAX_BUDGET_USD` positivo, en `.env` o `.env.local`, se admite únicamente si no existe un `RUN_BUDGET_USD` positivo. La UI identifica cuál utiliza. Un valor del template no autoriza gastos. El arranque no ejecuta investigación paga.

## Funcionamiento y límites

- Una aplicación Node persistente, un usuario y un workspace local. No exponer públicamente este servidor ni ejecutar múltiples réplicas.
- El estado JSON se guarda con cola de escrituras y reemplazo atómico, fuera del repositorio, en el directorio local `GTMCanvas/data`. `DATA_DIR` permite otro destino. Respaldar ese directorio conserva el trabajo.
- `AGENT_WORK_DIR` debe estar separado del código y los datos. Cada llamada tiene directorios aislados, entorno permitido explícitamente y autenticación con API key, sin reutilizar sesiones OAuth.
- El coordinador no tiene herramientas. A/B/C investigan independientemente, con hasta dos llamadas simultáneas; D sintetiza después. Como máximo hay dos rondas por pedido. Las dependencias restantes quedan pendientes.
- Los investigadores solo disponen de WebSearch/WebFetch. Hooks bloquean otras herramientas y el sexto intento de cada herramienta. Límites: diez turnos y dos minutos por tarea, seis minutos por pedido.
- El presupuesto se reparte en nueve cupos conservadores. Los costos informados se agregan; lo desconocido no se convierte en cero. Las estimaciones del SDK no garantizan un corte financiero exacto. Utilizar también controles de gasto de la cuenta.
- Las salidas se validan en runtime mediante Zod. Los IDs y fechas de consulta los asigna el servidor. Una URL documental debe haber sido observada mediante consulta de página. Fuentes antiguas o sin fecha requieren corroboración actual o quedan inciertas.
- El contenido aceptado no se reemplaza por investigación nueva: se crean propuestas pendientes. Las correcciones y decisiones humanas conservan historial. Las variantes mantienen su origen y advierten si cambió el escenario base.
- NDJSON publica progreso y resultados completos. Cancelación/desconexión conserva lo ya guardado y solicita cierre del proceso. Reiniciar el servidor marca tareas activas como interrumpidas; el reintento es manual.
- Exportaciones JSON/Markdown incluyen fuentes, hipótesis, decisiones y pendientes; excluyen configuración y credenciales.

## Acceso local e idioma

La UI, los estados y la nueva prosa de investigación se generan en español profesional. Los nombres técnicos, claves JSON y enums permanecen en inglés. El contenido humano y la investigación ya guardada no se traducen ni reemplazan silenciosamente. Solo el escenario inicial intacto generado por el sistema se migra de Spain a España.

El control de origen usa el Host entrante, sin confiar en headers forwarded. localhost, 127.0.0.1 y [::1] se consideran equivalentes únicamente con el mismo protocolo y puerto. Se rechazan hosts externos, orígenes malformados, origen null y diferencias de puerto/protocolo. Si aparece un error, abrir la URL local del servidor; no desactivar la protección.

## Estado de la entrega

Si el SDK informa una configuración inesperada, el próximo intento mostrará qué condición falló: herramientas recibidas frente a las permitidas, cantidad de MCP y modo de permisos. El detalle seguro queda en el historial y la exportación JSON, también cuando falla el coordinador antes de crear tareas. Las listas están limitadas, los nombres sensibles se ocultan y no se guardan credenciales, prompts ni la respuesta completa del SDK. Reintentar desde la UI permite obtener el diagnóstico real; no se amplían permisos automáticamente.

Validación humana pendiente. No se ejecutaron tests, typecheck, build, auditoría, QA de navegador ni revisión automática después del pedido de desarrollo únicamente. No se demostró investigación paga, acceso real a herramientas, costo, calidad comercial ni cancelación real. Los controles implementados no son una certificación de seguridad.

El soporte semántico y la vigencia de cada afirmación requieren revisión del especialista. Evidencia documental, encaje inferido, intención de compra y validación clínica son cosas distintas. Si el SDK expone herramientas inesperadas, falla de forma segura; no hay permisos alternativos ni investigación simulada. Persistencia de un solo proceso, historial de eventos limitado a 300; sin CRM, hosting ni integración autenticada con LinkedIn. Estilos CSS directos.

## Referencias oficiales

[Permisos del SDK](https://code.claude.com/docs/en/agent-sdk/permissions), [ejecución sin interfaz](https://code.claude.com/docs/en/headless), [salidas estructuradas](https://code.claude.com/docs/en/agent-sdk/structured-outputs), [costos](https://code.claude.com/docs/en/agent-sdk/cost-tracking), [Next.js App Router](https://nextjs.org/docs/app).

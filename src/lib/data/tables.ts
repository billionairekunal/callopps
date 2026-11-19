/** Tables in a full export, each with a unique sort key so paged reads never skip or repeat a row. */
export const EXPORT_TABLES: Record<string, string[]> = {
  orgs: ["id"], teams: ["id"], processes: ["id"], team_processes: ["team_id", "process_id"], product_categories: ["id"],
  products: ["id"], lead_types: ["id"], dispositions: ["id"], lead_sources: ["id"], calls: ["id"], lead_events: ["id"],
  lead_status_history: ["id"], lead_transfers: ["id"], communications: ["id"], message_templates: ["id"], qa_audits: ["id"],
  qa_checklists: ["org_id"], attendance_sessions: ["id"], targets: ["id"], import_batches: ["id"], import_mappings: ["id"],
  saved_reports: ["id"], report_exports: ["id"], chat_channels: ["id"], chat_messages: ["id"], audit_log: ["id"],
};

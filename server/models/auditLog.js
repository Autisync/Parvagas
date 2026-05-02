import { createModel } from "../db/modelFactory.js";

const AuditLog = createModel("auditLogs", "audit_logs");
export default AuditLog;

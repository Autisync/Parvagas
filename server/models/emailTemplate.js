import { createModel } from "../db/modelFactory.js";

const EmailTemplate = createModel("emailTemplates", "email_templates");
export default EmailTemplate;

import { createModel } from "../db/modelFactory.js";

const CompanyDeletionRequest = createModel("companyDeletionRequests", "company_deletion_requests");
export default CompanyDeletionRequest;

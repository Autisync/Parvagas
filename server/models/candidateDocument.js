import { createModel } from "../db/modelFactory.js";

const CandidateDocument = createModel("candidateDocuments", "candidate_documents");
export default CandidateDocument;

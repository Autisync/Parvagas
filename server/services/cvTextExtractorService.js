import path from "path";
import pdf from "pdf-parse";
import mammoth from "mammoth";

const SUPPORTED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
];

export const isSupportedCvFile = (file) => {
  return SUPPORTED_MIME_TYPES.includes(file.mimetype);
};

export const extractCvText = async (file) => {
  const ext = path.extname(file.originalname || "").toLowerCase();

  if (!file?.buffer) {
    throw new Error("Arquivo inválido. Não foi possível ler o ficheiro enviado.");
  }

  if (file.mimetype === "application/pdf" || ext === ".pdf") {
    const parsed = await pdf(file.buffer);
    if (!parsed.text?.trim()) {
      throw new Error("Não foi possível extrair texto do PDF.");
    }
    return parsed.text;
  }

  if (
    file.mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    file.mimetype === "application/msword" ||
    ext === ".docx" ||
    ext === ".doc"
  ) {
    const parsed = await mammoth.extractRawText({ buffer: file.buffer });
    if (!parsed.value?.trim()) {
      throw new Error("Não foi possível extrair texto do DOCX.");
    }
    return parsed.value;
  }

  throw new Error("Formato de CV não suportado. Use PDF ou DOCX.");
};

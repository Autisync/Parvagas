import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.join(__dirname, "..", "public", "uploads");

/* FILE STORAGE */
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, uploadsDir);
    },
    filename: function (req, file, cb) {
      const ext = path.extname(file.originalname || "").toLowerCase();
      const base = path.basename(file.originalname || "file", ext).replace(/[^a-zA-Z0-9_-]/g, "-");
      const suffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      cb(null, `${base}-${suffix}${ext}`);
    },
  });
  export const upload = multer({ storage });
  
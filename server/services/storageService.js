import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsRoot = path.join(__dirname, "..", "public", "uploads");

const configuredProvider = process.env.STORAGE_PROVIDER || "local";

class StorageService {
  async uploadBuffer({ buffer, fileName, folder = "cvs" }) {
    if (configuredProvider === "supabase") {
      return this._uploadToSupabase({ buffer, fileName, folder });
    }
    // Default: local (development only)
    return this._uploadLocal({ buffer, fileName });
  }

  async getSignedUrl(storagePath) {
    if (configuredProvider === "supabase") {
      return this._getSupabaseSignedUrl(storagePath);
    }
    // Local: return path directly (dev only)
    return storagePath;
  }

  async deleteFile(storagePath) {
    if (!storagePath) return;
    if (configuredProvider === "supabase") {
      await this._deleteSupabase(storagePath);
      return;
    }
    await this._deleteLocal(storagePath);
  }

  async _uploadLocal({ buffer, fileName }) {
    await fs.promises.mkdir(uploadsRoot, { recursive: true });
    const safeName = `${Date.now()}-${fileName}`.replace(/\s+/g, "-");
    const fullPath = path.join(uploadsRoot, safeName);
    await fs.promises.writeFile(fullPath, buffer);
    return {
      storagePath: `/uploads/${safeName}`,
      provider: "local",
    };
  }

  async _uploadToSupabase({ buffer, fileName, folder }) {
    const { requireSupabase } = await import("../db/supabaseClient.js");
    const client = requireSupabase();
    const bucket = process.env.SUPABASE_STORAGE_BUCKET || "parvagas-private";
    const safeName = `${folder}/${Date.now()}-${fileName}`.replace(/\s+/g, "-");

    const { error } = await client.storage.from(bucket).upload(safeName, buffer, {
      contentType: this._mimeFromName(fileName),
      upsert: false,
    });

    if (error) throw new Error(`Storage upload failed: ${error.message}`);

    return {
      storagePath: safeName,
      provider: "supabase",
      bucket,
    };
  }

  async _deleteLocal(storagePath) {
    const safeName = path.basename(String(storagePath || ""));
    if (!safeName) return;
    const fullPath = path.join(uploadsRoot, safeName);
    try {
      await fs.promises.unlink(fullPath);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }

  async _deleteSupabase(storagePath) {
    const { requireSupabase } = await import("../db/supabaseClient.js");
    const client = requireSupabase();
    const bucket = process.env.SUPABASE_STORAGE_BUCKET || "parvagas-private";
    const { error } = await client.storage.from(bucket).remove([storagePath]);
    if (error) throw new Error(`Storage delete failed: ${error.message}`);
  }

  async _getSupabaseSignedUrl(storagePath) {
    const { requireSupabase } = await import("../db/supabaseClient.js");
    const client = requireSupabase();
    const bucket = process.env.SUPABASE_STORAGE_BUCKET || "parvagas-private";
    const { data, error } = await client.storage.from(bucket).createSignedUrl(storagePath, 3600);
    if (error) throw new Error(`Signed URL failed: ${error.message}`);
    return data.signedUrl;
  }

  _mimeFromName(fileName) {
    if (/\.pdf$/i.test(fileName)) return "application/pdf";
    if (/\.docx$/i.test(fileName)) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    return "application/octet-stream";
  }
}

const storageService = new StorageService();
export default storageService;

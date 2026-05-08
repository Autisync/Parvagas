import { requireSupabase } from "./supabaseClient.js";
import { captureSentryException } from "../services/sentryService.js";

const modelRegistry = new Map();

const nowIso = () => new Date().toISOString();

const clone = (value) => JSON.parse(JSON.stringify(value));

const asArray = (value) => (Array.isArray(value) ? value : []);

const supportedOperators = new Set(["$gte", "$lte", "$in", "$ne"]);

function normalizeQueryValue(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

function toSupabaseColumn(key) {
  if (key === "_id" || key === "id") return "id";
  if (key === "createdAt") return "created_at";
  if (key === "updatedAt") return "updated_at";
  return `payload->>${key}`;
}

function supportsPushDownSort(sortConfig) {
  if (!sortConfig || typeof sortConfig !== "object") return true;
  const [field] = Object.entries(sortConfig)[0] || [];
  return ["_id", "id", "createdAt", "updatedAt"].includes(String(field || ""));
}

function isPushDownFilter(filter) {
  const entries = Object.entries(filter || {});

  for (const [key, expected] of entries) {
    if (["$text", "$or", "$and"].includes(key)) return false;
    if (expected instanceof RegExp) return false;

    if (expected && typeof expected === "object" && !Array.isArray(expected)) {
      const keys = Object.keys(expected);
      if (!keys.every((operator) => supportedOperators.has(operator))) return false;
      if ("$in" in expected && !Array.isArray(expected.$in)) return false;
      continue;
    }
  }

  return true;
}

function applySupabaseFilters(query, filter) {
  let nextQuery = query;

  for (const [key, expected] of Object.entries(filter || {})) {
    const column = toSupabaseColumn(key);

    if (expected && typeof expected === "object" && !Array.isArray(expected)) {
      if ("$gte" in expected) {
        nextQuery = nextQuery.gte(column, normalizeQueryValue(expected.$gte));
      }
      if ("$lte" in expected) {
        nextQuery = nextQuery.lte(column, normalizeQueryValue(expected.$lte));
      }
      if ("$in" in expected) {
        nextQuery = nextQuery.in(column, asArray(expected.$in).map(normalizeQueryValue));
      }
      if ("$ne" in expected) {
        nextQuery = nextQuery.neq(column, normalizeQueryValue(expected.$ne));
      }
      continue;
    }

    nextQuery = nextQuery.eq(column, normalizeQueryValue(expected));
  }

  return nextQuery;
}

function normalizeDoc(row) {
  const payload = clone(row.payload || {});
  return {
    ...payload,
    _id: row.id,
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toModelError(error, context = {}) {
  const message = String(error?.message || error || "Unknown Supabase error");
  const normalizedError = error instanceof Error ? error : new Error(message);
  captureSentryException(normalizedError, {
    layer: "modelFactory",
    ...context,
    message,
  });
  return normalizedError;
}

function matchesText(doc, search) {
  const query = String(search || "").trim().toLowerCase();
  if (!query) return true;
  return JSON.stringify(doc).toLowerCase().includes(query);
}

function matchesFilter(doc, filter) {
  const entries = Object.entries(filter || {});

  for (const [key, expected] of entries) {
    if (key === "$text") {
      if (!matchesText(doc, expected?.$search || "")) return false;
      continue;
    }

    if (key === "$or") {
      if (!Array.isArray(expected) || expected.length === 0) return false;
      if (!expected.some((cond) => matchesFilter(doc, cond))) return false;
      continue;
    }

    if (key === "$and") {
      if (!Array.isArray(expected)) return false;
      if (!expected.every((cond) => matchesFilter(doc, cond))) return false;
      continue;
    }

    const actual = key === "_id" ? doc._id : doc[key];

    if (expected instanceof RegExp) {
      if (!expected.test(String(actual || ""))) return false;
      continue;
    }

    if (expected && typeof expected === "object" && !Array.isArray(expected)) {
      if ("$gte" in expected && !(actual >= expected.$gte)) return false;
      if ("$lte" in expected && !(actual <= expected.$lte)) return false;
      if ("$in" in expected && !asArray(expected.$in).includes(actual)) return false;
      if ("$ne" in expected && actual === expected.$ne) return false;
      if (!["$gte", "$lte", "$in", "$ne"].some((k) => k in expected)) {
        if (JSON.stringify(actual) !== JSON.stringify(expected)) return false;
      }
      continue;
    }

    if (actual !== expected) return false;
  }

  return true;
}

function applyUpdateOperators(doc, update) {
  if (!update || typeof update !== "object") return doc;

  const next = { ...doc };
  const direct = { ...update };

  if (direct.$inc && typeof direct.$inc === "object") {
    for (const [field, increment] of Object.entries(direct.$inc)) {
      const current = Number(next[field] || 0);
      next[field] = current + Number(increment || 0);
    }
    delete direct.$inc;
  }

  Object.assign(next, direct);
  return next;
}

class QueryBuilder {
  constructor(modelName, tableName, filter) {
    this.modelName = modelName;
    this.tableName = tableName;
    this.filter = filter || {};
    this.sortConfig = null;
    this.limitValue = null;
    this.skipValue = null;
    this.selectFields = null;
    this.populateFields = [];
    this.asLean = false;
  }

  sort(config) {
    this.sortConfig = config;
    return this;
  }

  limit(count) {
    this.limitValue = count;
    return this;
  }

  skip(count) {
    this.skipValue = count;
    return this;
  }

  select(fields) {
    this.selectFields = String(fields || "")
      .split(/\s+/)
      .map((f) => f.trim())
      .filter(Boolean);
    return this;
  }

  populate(field) {
    if (field) this.populateFields.push(field);
    return this;
  }

  lean() {
    this.asLean = true;
    return this;
  }

  async exec() {
    const client = requireSupabase();
    const hasSkipWithoutLimit =
      typeof this.skipValue === "number" &&
      this.skipValue > 0 &&
      typeof this.limitValue !== "number";
    const canPushDown = isPushDownFilter(this.filter) && supportsPushDownSort(this.sortConfig) && !hasSkipWithoutLimit;
    let docs = [];

    if (canPushDown) {
      let query = client.from(this.tableName).select("id,payload,created_at,updated_at");
      query = applySupabaseFilters(query, this.filter);

      if (this.sortConfig && typeof this.sortConfig === "object") {
        const [field, direction] = Object.entries(this.sortConfig)[0] || [];
        const sortColumn = toSupabaseColumn(field);
        query = query.order(sortColumn, { ascending: direction !== -1 });
      }

      if (typeof this.skipValue === "number" || typeof this.limitValue === "number") {
        const offset = Math.max(0, Number(this.skipValue) || 0);
        const limit = Number.isFinite(this.limitValue) ? Math.max(0, Number(this.limitValue)) : 1000;
        query = query.range(offset, offset + Math.max(limit - 1, 0));
      }

      const { data, error } = await query;
      if (error) throw toModelError(error, { operation: "select", tableName: this.tableName, modelName: this.modelName });
      docs = asArray(data).map(normalizeDoc);
    } else {
      const { data, error } = await client
        .from(this.tableName)
        .select("id,payload,created_at,updated_at");

      if (error) throw toModelError(error, { operation: "select-fallback", tableName: this.tableName, modelName: this.modelName });

      docs = asArray(data).map(normalizeDoc).filter((doc) => matchesFilter(doc, this.filter));

      if (this.sortConfig && typeof this.sortConfig === "object") {
        const [field, direction] = Object.entries(this.sortConfig)[0] || [];
        if (field) {
          docs.sort((a, b) => {
            if (a[field] === b[field]) return 0;
            if (a[field] > b[field]) return direction === -1 ? -1 : 1;
            return direction === -1 ? 1 : -1;
          });
        }
      }

      if (typeof this.skipValue === "number" && this.skipValue > 0) {
        docs = docs.slice(this.skipValue);
      }

      if (typeof this.limitValue === "number") {
        docs = docs.slice(0, this.limitValue);
      }
    }

    for (const field of this.populateFields) {
      const baseModelName = field.endsWith("Id") ? field.slice(0, -2) : null;
      const linkedModelName = baseModelName === "company" ? "companies" : baseModelName ? `${baseModelName}s` : null;
      const linkedModel = linkedModelName ? modelRegistry.get(linkedModelName) : null;
      if (!linkedModel) continue;

      // eslint-disable-next-line no-await-in-loop
      docs = await Promise.all(
        docs.map(async (doc) => {
          const value = doc[field];
          if (!value) return doc;

          // eslint-disable-next-line no-await-in-loop
          const linked = await linkedModel.findById(String(value));
          return { ...doc, [field]: linked || null };
        })
      );
    }

    if (Array.isArray(this.selectFields) && this.selectFields.length > 0) {
      docs = docs.map((doc) => {
        const selected = {};
        for (const field of this.selectFields) {
          if (field === "_id" || field === "id") {
            selected._id = doc._id;
            selected.id = doc.id;
          } else if (field in doc) {
            selected[field] = doc[field];
          }
        }
        return selected;
      });
    }

    if (this.asLean) return docs;
    return docs.map((doc) => createDocumentProxy(this.modelName, this.tableName, doc));
  }

  then(resolve, reject) {
    return this.exec().then(resolve, reject);
  }

  catch(reject) {
    return this.exec().catch(reject);
  }
}

function createDocumentProxy(modelName, tableName, doc) {
  return {
    ...doc,
    toObject() {
      return clone({ ...this });
    },
    async save() {
      const client = requireSupabase();
      const payload = { ...this };
      delete payload._id;
      delete payload.id;
      delete payload.createdAt;
      delete payload.updatedAt;
      delete payload.toObject;
      delete payload.save;

      const { data, error } = await client
        .from(tableName)
        .update({ payload, updated_at: nowIso() })
        .eq("id", this._id)
        .select("id,payload,created_at,updated_at")
        .single();

      if (error) throw toModelError(error, { operation: "update", tableName, modelName, documentId: this._id });
      const normalized = normalizeDoc(data);
      return createDocumentProxy(modelName, tableName, normalized);
    },
  };
}

export function createModel(modelName, tableName) {
  const model = {
    modelName,
    tableName,

    find(filter = {}) {
      return new QueryBuilder(modelName, tableName, filter);
    },

    async findOne(filter = {}) {
      const docs = await this.find(filter).limit(1).exec();
      return docs[0] || null;
    },

    async findById(id) {
      if (!id) return null;
      const docs = await this.find({ _id: String(id) }).limit(1).exec();
      return docs[0] || null;
    },

    async create(payload = {}) {
      const client = requireSupabase();
      const { data, error } = await client
        .from(tableName)
        .insert({ payload, created_at: nowIso(), updated_at: nowIso() })
        .select("id,payload,created_at,updated_at")
        .single();

      if (error) throw toModelError(error, { operation: "insert", tableName, modelName });
      return createDocumentProxy(modelName, tableName, normalizeDoc(data));
    },

    async countDocuments(filter = {}) {
      if (isPushDownFilter(filter)) {
        const client = requireSupabase();
        let query = client.from(tableName).select("id", { count: "exact", head: true });
        query = applySupabaseFilters(query, filter);
        const { count, error } = await query;
        if (error) throw toModelError(error, { operation: "count", tableName, modelName });
        return Number(count || 0);
      }

      const docs = await this.find(filter).exec();
      return docs.length;
    },

    async findByIdAndUpdate(id, update = {}, options = {}) {
      const existing = await this.findById(id);
      if (!existing) return null;

      const payload = applyUpdateOperators(existing.toObject(), update);
      const updated = await createDocumentProxy(modelName, tableName, payload).save();
      return options.new ? updated : existing;
    },

    async findByIdAndDelete(id) {
      const existing = await this.findById(id);
      if (!existing) return null;

      const client = requireSupabase();
      const { error } = await client.from(tableName).delete().eq("id", String(id));
      if (error) throw toModelError(error, { operation: "delete", tableName, modelName, documentId: id });
      return existing;
    },

    async findOneAndUpdate(filter = {}, update = {}, options = {}) {
      const existing = await this.findOne(filter);

      if (!existing && options.upsert) {
        const payload = applyUpdateOperators({}, { ...filter, ...update });
        const created = await this.create(payload);
        return options.new ? created : null;
      }

      if (!existing) return null;

      const payload = applyUpdateOperators(existing.toObject(), update);
      const updated = await createDocumentProxy(modelName, tableName, payload).save();
      return options.new ? updated : existing;
    },
  };

  modelRegistry.set(modelName, model);
  return model;
}

export async function pingSupabase() {
  const client = requireSupabase();
  const { error } = await client.from("users").select("id").limit(1);
  if (error && !String(error.message || "").includes("relation \"public.users\" does not exist")) {
    throw toModelError(error, { operation: "ping", tableName: "users", modelName: "users" });
  }
}

export async function clearAllModelTables() {
  const client = requireSupabase();
  for (const model of modelRegistry.values()) {
    // eslint-disable-next-line no-await-in-loop
    const { error } = await client.from(model.tableName).delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (error) {
      const msg = String(error.message || "");
      const isMissing = msg.includes("Could not find the table") || msg.includes("schema cache") || msg.includes("does not exist");
      if (!isMissing) throw toModelError(error, { operation: "clear-table", tableName: model.tableName, modelName: model.modelName });
    }
  }
}

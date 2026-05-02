import Company from "../models/company.js";

export const normalizeCompanyName = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const normalizeCompanyIdentifier = (value) =>
  String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

export const isValidCompanyIdentifier = (value) => /^[A-Z0-9]{6,20}$/.test(value);

export async function findCompanyByNormalizedName(companyName, excludeId) {
  const normalizedName = normalizeCompanyName(companyName);
  if (!normalizedName) return null;

  const companies = await Company.find({});
  return companies.find((company) => {
    if (excludeId && String(company?._id || "") === String(excludeId)) return false;
    return normalizeCompanyName(company?.name || company?.companyName || "") === normalizedName;
  }) || null;
}

export async function findCompanyByIdentifier(identifier, excludeId) {
  const normalizedIdentifier = normalizeCompanyIdentifier(identifier);
  if (!normalizedIdentifier) return null;

  const companies = await Company.find({});
  return companies.find((company) => {
    if (excludeId && String(company?._id || "") === String(excludeId)) return false;
    const existing = normalizeCompanyIdentifier(company?.nif || company?.companyIdentifier || "");
    return existing && existing === normalizedIdentifier;
  }) || null;
}

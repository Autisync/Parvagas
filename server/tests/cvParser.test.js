/**
 * Unit tests for the CV parser adapters and factory.
 *
 * Run with:  npm test  (or: node --test server/tests/cvParser.test.js)
 *
 * fetch is mocked globally before each test and restored after.
 * No real HTTP calls are made.
 */

import test from "node:test";
import assert from "node:assert/strict";

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function mockFetch(status, body) {
  globalThis.fetch = async () => ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
    json: async () => (typeof body === "string" ? JSON.parse(body) : body),
  });
}

function restoreFetch() {
  delete globalThis.fetch;
}

const sampleFile = {
  buffer: Buffer.from("fake-pdf-bytes"),
  originalname: "test-cv.pdf",
  mimetype: "application/pdf",
};

// ──────────────────────────────────────────────────────────────────────────────
// SkimaParser
// ──────────────────────────────────────────────────────────────────────────────

test("SkimaParser: throws when SKIMA_API_KEY is not set", async () => {
  delete process.env.SKIMA_API_KEY;
  const { SkimaParser } = await import("../services/parsers/SkimaParser.js");
  const parser = new SkimaParser();
  await assert.rejects(
    () => parser.parseResume(sampleFile.buffer, sampleFile.originalname, sampleFile.mimetype),
    /SKIMA_API_KEY/
  );
});

test("SkimaParser: maps full API response to normalized profile", async () => {
  process.env.SKIMA_API_KEY = "sk-test-key";

  const skimaResponse = {
    data: {
      name: "Ana Ferreira",
      contact: {
        email: "ana@example.com",
        phone: "+244 923 000 000",
        location: "Luanda",
        nationality: "Angolana",
      },
      title: "Engenheira de Software",
      summary: "Profissional experiente em desenvolvimento web.",
      experience: [
        {
          title: "Desenvolvedora Frontend",
          company: "Tech Angola",
          location: "Luanda",
          start_date: "2020-01",
          end_date: "2023-06",
          is_current: false,
          description: "React, TypeScript, Node.js",
        },
      ],
      education: [
        {
          degree: "Licenciatura em Informática",
          institution: "Universidade Agostinho Neto",
          location: "Luanda",
          start_date: "2015-09",
          end_date: "2019-07",
        },
      ],
      skills: ["React", "Node.js", "TypeScript"],
      languages: [{ name: "Português" }, { name: "Inglês" }],
      certifications: [{ name: "AWS Cloud Practitioner" }],
    },
  };

  mockFetch(200, skimaResponse);

  const { SkimaParser } = await import("../services/parsers/SkimaParser.js");
  const parser = new SkimaParser();
  const normalized = await parser.parse(sampleFile.buffer, sampleFile.originalname, sampleFile.mimetype);
  const result = await parser.parseResume(sampleFile.buffer, sampleFile.originalname, sampleFile.mimetype);

  assert.strictEqual(normalized.name, "Ana Ferreira");
  assert.strictEqual(normalized.title, "Engenheira de Software");
  assert.strictEqual(normalized.experiences.length, 1);
  assert.strictEqual(normalized.education.length, 1);

  assert.strictEqual(result.provider, "skima");
  assert.strictEqual(result.profile.fullName, "Ana Ferreira");
  assert.strictEqual(result.profile.email, "ana@example.com");
  assert.strictEqual(result.profile.phone, "+244 923 000 000");
  assert.strictEqual(result.profile.location, "Luanda");
  assert.strictEqual(result.profile.nationality, "Angolana");
  assert.strictEqual(result.profile.professionalTitle, "Engenheira de Software");
  assert.ok(result.profile.summary.includes("web"));
  assert.strictEqual(result.profile.experience.length, 1);
  assert.strictEqual(result.profile.experience[0].jobTitle, "Desenvolvedora Frontend");
  assert.strictEqual(result.profile.experience[0].company, "Tech Angola");
  assert.strictEqual(result.profile.experience[0].startDate, "2020-01");
  assert.strictEqual(result.profile.experience[0].endDate, "2023-06");
  assert.strictEqual(result.profile.education.length, 1);
  assert.strictEqual(result.profile.education[0].degree, "Licenciatura em Informática");
  assert.deepStrictEqual(result.profile.skills, ["React", "Node.js", "TypeScript"]);
  assert.deepStrictEqual(result.profile.languages, ["Português", "Inglês"]);
  assert.deepStrictEqual(result.profile.certifications, ["AWS Cloud Practitioner"]);
  assert.ok(Array.isArray(result.missingFields));

  restoreFetch();
  delete process.env.SKIMA_API_KEY;
});

test("SkimaParser: returns empty fields for missing API response keys", async () => {
  process.env.SKIMA_API_KEY = "sk-test-key";
  mockFetch(200, { data: {} });

  const { SkimaParser } = await import("../services/parsers/SkimaParser.js");
  const parser = new SkimaParser();
  const result = await parser.parseResume(sampleFile.buffer, sampleFile.originalname, sampleFile.mimetype);

  assert.strictEqual(result.profile.fullName, "");
  assert.strictEqual(result.profile.email, "");
  assert.deepStrictEqual(result.profile.skills, []);
  assert.deepStrictEqual(result.profile.experience, []);
  // All required fields should appear in missingFields
  assert.ok(result.missingFields.includes("fullName"));
  assert.ok(result.missingFields.includes("skills"));

  restoreFetch();
  delete process.env.SKIMA_API_KEY;
});

test("SkimaParser: preserves multiple experience and education entries", async () => {
  process.env.SKIMA_API_KEY = "sk-test-key";
  mockFetch(200, {
    data: {
      name: "Joao Tester",
      experience: [
        { title: "Developer I", company: "A", start_date: "2019-01", end_date: "2020-01" },
        { title: "Developer II", company: "B", start_date: "2020-02", end_date: "2022-12" },
      ],
      education: [
        { degree: "Curso Medio", institution: "Escola X", start_date: "2014-01", end_date: "2017-12" },
        { degree: "Licenciatura", institution: "Universidade Y", start_date: "2018-01", end_date: "2022-12" },
      ],
      skills: ["JavaScript"],
      languages: ["Português"],
      certifications: ["Scrum"],
    },
  });

  const { SkimaParser } = await import("../services/parsers/SkimaParser.js");
  const parser = new SkimaParser();
  const normalized = await parser.parse(sampleFile.buffer, sampleFile.originalname, sampleFile.mimetype);
  const result = await parser.parseResume(sampleFile.buffer, sampleFile.originalname, sampleFile.mimetype);

  assert.strictEqual(normalized.experiences.length, 2);
  assert.strictEqual(normalized.education.length, 2);
  assert.strictEqual(result.profile.experience.length, 2);
  assert.strictEqual(result.profile.education.length, 2);

  restoreFetch();
  delete process.env.SKIMA_API_KEY;
});

test("SkimaParser: throws on non-2xx HTTP response", async () => {
  process.env.SKIMA_API_KEY = "sk-test-key";
  mockFetch(401, "Unauthorized");

  const { SkimaParser } = await import("../services/parsers/SkimaParser.js");
  const parser = new SkimaParser();

  await assert.rejects(
    () => parser.parseResume(sampleFile.buffer, sampleFile.originalname, sampleFile.mimetype),
    /401/
  );

  restoreFetch();
  delete process.env.SKIMA_API_KEY;
});

// ──────────────────────────────────────────────────────────────────────────────
// ApyHubParser
// ──────────────────────────────────────────────────────────────────────────────

test("ApyHubParser: throws when APYHUB_API_KEY is not set", async () => {
  delete process.env.APYHUB_API_KEY;
  const { ApyHubParser } = await import("../services/parsers/ApyHubParser.js");
  const parser = new ApyHubParser();
  await assert.rejects(
    () => parser.parseResume(sampleFile.buffer, sampleFile.originalname, sampleFile.mimetype),
    /APYHUB_API_KEY/
  );
});

test("ApyHubParser: maps full API response to normalized profile", async () => {
  process.env.APYHUB_API_KEY = "APY0-test-key";

  const apyhubResponse = {
    data: {
      personal_info: {
        name: "Carlos Santos",
        email: "carlos@example.com",
        phone: "+244 912 111 222",
        location: "Benguela",
        nationality: "Angolano",
        title: "Analista de Dados",
        summary: "Especialista em análise de dados e BI.",
      },
      work_experience: [
        {
          title: "Analista de Dados",
          company: "Banco BIC",
          location: "Luanda",
          start_date: "2019-03",
          end_date: "2024-01",
          is_current: false,
          responsibilities: ["Power BI", "SQL", "Python"],
        },
      ],
      education: [
        {
          degree: "Licenciatura em Matemática",
          institution: "UCAN",
          location: "Luanda",
          start_date: "2014-09",
          end_date: "2018-07",
        },
      ],
      skills: [{ skill: "Python" }, { skill: "SQL" }, { skill: "Power BI" }],
      languages: ["Português", "Francês"],
      certifications: [{ title: "Google Data Analytics" }],
    },
  };

  mockFetch(200, apyhubResponse);

  const { ApyHubParser } = await import("../services/parsers/ApyHubParser.js");
  const parser = new ApyHubParser();
  const normalized = await parser.parse(sampleFile.buffer, sampleFile.originalname, sampleFile.mimetype);
  const result = await parser.parseResume(sampleFile.buffer, sampleFile.originalname, sampleFile.mimetype);

  assert.strictEqual(normalized.name, "Carlos Santos");
  assert.strictEqual(normalized.title, "Analista de Dados");
  assert.strictEqual(normalized.experiences.length, 1);
  assert.strictEqual(normalized.education.length, 1);

  assert.strictEqual(result.provider, "apyhub");
  assert.strictEqual(result.profile.fullName, "Carlos Santos");
  assert.strictEqual(result.profile.email, "carlos@example.com");
  assert.strictEqual(result.profile.phone, "+244 912 111 222");
  assert.strictEqual(result.profile.location, "Benguela");
  assert.strictEqual(result.profile.nationality, "Angolano");
  assert.strictEqual(result.profile.professionalTitle, "Analista de Dados");
  assert.ok(result.profile.summary.includes("dados"));
  assert.strictEqual(result.profile.experience.length, 1);
  assert.strictEqual(result.profile.experience[0].jobTitle, "Analista de Dados");
  assert.strictEqual(result.profile.experience[0].company, "Banco BIC");
  // responsibilities array joined into description
  assert.ok(result.profile.experience[0].description.includes("Python"));
  assert.strictEqual(result.profile.education.length, 1);
  assert.strictEqual(result.profile.education[0].institution, "UCAN");
  assert.deepStrictEqual(result.profile.skills, ["Python", "SQL", "Power BI"]);
  assert.deepStrictEqual(result.profile.languages, ["Português", "Francês"]);
  assert.deepStrictEqual(result.profile.certifications, ["Google Data Analytics"]);
  assert.ok(Array.isArray(result.missingFields));

  restoreFetch();
  delete process.env.APYHUB_API_KEY;
});

test("ApyHubParser: returns empty fields for missing API response keys", async () => {
  process.env.APYHUB_API_KEY = "APY0-test-key";
  mockFetch(200, { data: {} });

  const { ApyHubParser } = await import("../services/parsers/ApyHubParser.js");
  const parser = new ApyHubParser();
  const result = await parser.parseResume(sampleFile.buffer, sampleFile.originalname, sampleFile.mimetype);

  assert.strictEqual(result.profile.fullName, "");
  assert.deepStrictEqual(result.profile.experience, []);
  assert.ok(result.missingFields.includes("fullName"));

  restoreFetch();
  delete process.env.APYHUB_API_KEY;
});

test("ApyHubParser: throws on non-2xx HTTP response", async () => {
  process.env.APYHUB_API_KEY = "APY0-test-key";
  mockFetch(403, "Forbidden");

  const { ApyHubParser } = await import("../services/parsers/ApyHubParser.js");
  const parser = new ApyHubParser();

  await assert.rejects(
    () => parser.parseResume(sampleFile.buffer, sampleFile.originalname, sampleFile.mimetype),
    /403/
  );

  restoreFetch();
  delete process.env.APYHUB_API_KEY;
});

// ──────────────────────────────────────────────────────────────────────────────
// CvParserBase — utility methods
// ──────────────────────────────────────────────────────────────────────────────

test("CvParserBase.normalizeDate handles common formats", async () => {
  const { CvParserBase } = await import("../services/parsers/CvParserBase.js");

  assert.strictEqual(CvParserBase.normalizeDate("2022-03"),       "2022-03");
  assert.strictEqual(CvParserBase.normalizeDate("2022-03-15"),    "2022-03");
  assert.strictEqual(CvParserBase.normalizeDate("03/2022"),       "2022-03");
  assert.strictEqual(CvParserBase.normalizeDate("2022"),          "2022-01");
  assert.strictEqual(CvParserBase.normalizeDate("Jan 2022"),      "2022-01");
  assert.strictEqual(CvParserBase.normalizeDate("March 2020"),    "2020-03");
  assert.strictEqual(CvParserBase.normalizeDate(""),              "");
  assert.strictEqual(CvParserBase.normalizeDate(null),            "");
  assert.strictEqual(CvParserBase.normalizeDate("not-a-date"),    "");
});

test("CvParserBase.arr handles strings, arrays, and nullish values", async () => {
  const { CvParserBase } = await import("../services/parsers/CvParserBase.js");

  assert.deepStrictEqual(CvParserBase.arr(null),             []);
  assert.deepStrictEqual(CvParserBase.arr(undefined),        []);
  assert.deepStrictEqual(CvParserBase.arr("a, b, c"),        ["a", "b", "c"]);
  assert.deepStrictEqual(CvParserBase.arr(["x", "y"]),       ["x", "y"]);
  assert.deepStrictEqual(CvParserBase.arr(["", " ", "z"]),   ["z"]);
});

test("CvParserBase.missingFields detects empty required keys", async () => {
  const { CvParserBase } = await import("../services/parsers/CvParserBase.js");

  const profile = {
    ...CvParserBase.emptyProfile(),
    fullName: "Ana",
    email: "ana@example.com",
    skills: ["React"],
  };

  const missing = CvParserBase.missingFields(profile);
  assert.ok(!missing.includes("fullName"),  "fullName should NOT be missing");
  assert.ok(!missing.includes("email"),     "email should NOT be missing");
  assert.ok(!missing.includes("skills"),    "skills should NOT be missing");
  assert.ok(missing.includes("phone"),      "phone SHOULD be missing");
  assert.ok(missing.includes("experience"), "experience SHOULD be missing");
});

test("CvParserService.toProfileDraft strips contacts from summary", async () => {
  const { CvParserService } = await import("../services/parsers/CvParserService.js");
  const profile = CvParserService.toProfileDraft({
    name: "Ana",
    title: "Developer",
    summary: "Contacte-me em ana@example.com, +244 923 000 000 e https://site.com",
    skills: ["React"],
  });

  assert.ok(!profile.summary.includes("@"));
  assert.ok(!/https?:\/\//.test(profile.summary));
  assert.ok(!/\+?\d[\d\s()\-]{7,20}/.test(profile.summary));
});

test("CvParserService.toProfileDraft maps nested personalInfo/preferences fields", async () => {
  const { CvParserService } = await import("../services/parsers/CvParserService.js");
  const profile = CvParserService.toProfileDraft({
    personalInfo: {
      name: "Carlos",
      email: "carlos@example.com",
      phone: "+244 999 111 222",
      location: "Luanda",
    },
    preferences: {
      jobType: "tempo_integral",
      availability: "imediata",
      salary: "250000",
    },
    experiences: [{ title: "Analista", company: "Empresa", startDate: "2020-01", endDate: "2022-01" }],
    education: [{ degree: "Licenciatura", institution: "UAN", startDate: "2016-01", endDate: "2020-01" }],
    skills: ["SQL"],
    languages: ["Português"],
    certifications: ["Scrum"],
  });

  assert.strictEqual(profile.fullName, "Carlos");
  assert.strictEqual(profile.preferredJobType, "tempo_integral");
  assert.strictEqual(profile.availability, "imediata");
  assert.strictEqual(profile.expectedSalaryAoa, 250000);
});

// ──────────────────────────────────────────────────────────────────────────────
// cvParserFactory
// ──────────────────────────────────────────────────────────────────────────────

test("cvParserFactory: getCvParser returns SkimaParser by default", async () => {
  process.env.RESUME_PARSER_PROVIDER = "skima";
  // Clear the module cache so the factory re-evaluates
  const mod = await import("../services/parsers/cvParserFactory.js?t=skima");
  const { SkimaParser } = await import("../services/parsers/SkimaParser.js");
  // Just verify the returned instance is of the correct class
  const parser = mod.getCvParser();
  assert.ok(parser instanceof SkimaParser, "Expected SkimaParser instance");
  delete process.env.RESUME_PARSER_PROVIDER;
});

test("cvParserFactory: getCvParser returns ApyHubParser when provider=apyhub", async () => {
  process.env.RESUME_PARSER_PROVIDER = "apyhub";
  const mod = await import("../services/parsers/cvParserFactory.js?t=apyhub");
  const { ApyHubParser } = await import("../services/parsers/ApyHubParser.js");
  const parser = mod.getCvParser();
  assert.ok(parser instanceof ApyHubParser, "Expected ApyHubParser instance");
  delete process.env.RESUME_PARSER_PROVIDER;
});

test("cvParserFactory: getCvParser returns ManualFallbackParser when provider=manual", async () => {
  process.env.RESUME_PARSER_PROVIDER = "manual";
  const mod = await import("../services/parsers/cvParserFactory.js?t=manual");
  const { ManualFallbackParser } = await import("../services/parsers/ManualFallbackParser.js");
  const parser = mod.getCvParser();
  assert.ok(parser instanceof ManualFallbackParser, "Expected ManualFallbackParser instance");
  delete process.env.RESUME_PARSER_PROVIDER;
});

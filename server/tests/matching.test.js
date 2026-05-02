import test from "node:test";
import assert from "node:assert/strict";
import { calculateJobMatch, calculateProfileCompletion } from "../services/matchingService.js";

test("calculateProfileCompletion returns percentage", () => {
  const score = calculateProfileCompletion({
    fullName: "Ana",
    email: "ana@mail.com",
    phone: "+244900000000",
    location: "Luanda",
    nationality: "Angolana",
    professionalTitle: "Engenheira de Dados",
    summary: "Resumo",
    skills: ["SQL"],
    experience: [{ title: "Dev" }],
    education: [{ title: "Licenciatura" }],
    languages: ["Português"],
    preferredRoles: ["Data Engineer"],
  });

  assert.equal(score, 100);
});

test("calculateJobMatch provides numeric score", () => {
  const result = calculateJobMatch({
    profile: {
      skills: ["Node.js", "React"],
      preferredLocations: ["Luanda"],
    },
    job: {
      requiredSkills: ["Node.js"],
      preferredSkills: ["React", "TypeScript"],
      provinceCity: "Luanda",
    },
  });

  assert.equal(typeof result.score, "number");
  assert.equal(result.score > 0, true);
});

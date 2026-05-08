import dotenv from "dotenv";

dotenv.config({ path: "server/.env" });

import ScrapedJob from "../models/scrapedJob.js";

const samples = [
  {
    title: "Engenheiro de Dados",
    company: "Tech Angola",
    location: "Luanda",
    source: "rss",
    sourceUrl: "https://example.com/jobs/engenheiro-dados",
    description: "Pipeline de dados e integração com APIs.",
    category: "Tecnologia",
    skills: ["SQL", "Python", "ETL"],
    status: "pending",
  },
  {
    title: "Gestor Comercial",
    company: "Comercial Sul",
    location: "Benguela",
    source: "crawler",
    sourceUrl: "https://example.com/jobs/gestor-comercial",
    description: "Gestão de carteira e crescimento de vendas.",
    category: "Comercial",
    skills: ["Vendas", "CRM"],
    status: "pending",
  },
  {
    title: "Desenvolvedor Frontend",
    company: "Nova Digital",
    location: "Huambo",
    source: "manual",
    sourceUrl: "https://example.com/jobs/frontend",
    description: "Construção de interfaces responsivas em React.",
    category: "Tecnologia",
    skills: ["React", "TypeScript", "CSS"],
    status: "pending",
  },
];

const createFingerprint = ({ title, company, location }) =>
  `${String(title || "").trim().toLowerCase()}::${String(company || "").trim().toLowerCase()}::${String(
    location || ""
  )
    .trim()
    .toLowerCase()}`;

async function run() {
  for (const item of samples) {
    const duplicateFingerprint = createFingerprint(item);
    const existing = await ScrapedJob.findOne({ duplicateFingerprint });
    if (existing) {
      console.log(`skip: ${item.title}`);
      continue;
    }

    await ScrapedJob.create({
      ...item,
      duplicateFingerprint,
      duplicateOf: null,
    });
    console.log(`created: ${item.title}`);
  }

  console.log("seed scraped jobs complete");
  process.exit(0);
}

run().catch((err) => {
  console.error(err.message);
  process.exit(1);
});

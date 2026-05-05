/**
 * Generates a minimal but valid DOCX CV template at public/templates/modelo-cv-parvagas.docx
 *
 * A DOCX file is a ZIP archive containing XML files. This script builds the
 * ZIP using Node.js built-ins only — no extra dependencies required.
 *
 * Usage: node server/scripts/generateCvTemplate.mjs
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import zlib from "zlib";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, "../../public/templates");
const OUT_FILE = path.join(OUT_DIR, "modelo-cv-parvagas.docx");

// ─── CRC-32 ──────────────────────────────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (const b of buf) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ b) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}

// ─── ZIP builder (DEFLATE-compressed) ────────────────────────────────────────
function buildZip(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const [name, raw] of Object.entries(files)) {
    const rawBuf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw, "utf8");
    const compressed = zlib.deflateRawSync(rawBuf, { level: 9 });
    const crc = crc32(rawBuf);
    const nameBuf = Buffer.from(name, "utf8");
    const compLen = compressed.length;
    const uncompLen = rawBuf.length;

    // Local file header
    const local = Buffer.alloc(30 + nameBuf.length);
    local.writeUInt32LE(0x04034b50, 0); // signature
    local.writeUInt16LE(20, 4); // version needed (2.0)
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(0, 10); // mod time
    local.writeUInt16LE(0, 12); // mod date
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compLen, 18);
    local.writeUInt32LE(uncompLen, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    nameBuf.copy(local, 30);

    localParts.push(local, compressed);

    // Central directory entry
    const central = Buffer.alloc(46 + nameBuf.length);
    central.writeUInt32LE(0x02014b50, 0); // signature
    central.writeUInt16LE(20, 4); // version made
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0, 8); // flags
    central.writeUInt16LE(8, 10); // deflate
    central.writeUInt16LE(0, 12); // mod time
    central.writeUInt16LE(0, 14); // mod date
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compLen, 20);
    central.writeUInt32LE(uncompLen, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30); // extra len
    central.writeUInt16LE(0, 32); // comment len
    central.writeUInt16LE(0, 34); // disk start
    central.writeUInt16LE(0, 36); // int attrs
    central.writeUInt32LE(0, 38); // ext attrs
    central.writeUInt32LE(offset, 42); // local header offset
    nameBuf.copy(central, 46);

    centralParts.push(central);
    offset += 30 + nameBuf.length + compLen;
  }

  const centralBuf = Buffer.concat(centralParts);
  const cdOffset = offset;
  const cdSize = centralBuf.length;
  const count = Object.keys(files).length;

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4); // disk number
  eocd.writeUInt16LE(0, 6); // disk with CD
  eocd.writeUInt16LE(count, 8);
  eocd.writeUInt16LE(count, 10);
  eocd.writeUInt32LE(cdSize, 12);
  eocd.writeUInt32LE(cdOffset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralBuf, eocd]);
}

// ─── DOCX XML content ────────────────────────────────────────────────────────
const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml"
    ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml"
    ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;

const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1"
    Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"
    Target="word/document.xml"/>
</Relationships>`;

const wordRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1"
    Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles"
    Target="styles.xml"/>
</Relationships>`;

const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:styleId="Heading1" w:default="0">
    <w:name w:val="heading 1"/>
    <w:rPr><w:b/><w:sz w:val="28"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2" w:default="0">
    <w:name w:val="heading 2"/>
    <w:rPr><w:b/><w:sz w:val="24"/><w:color w:val="CC2200"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Normal" w:default="1">
    <w:name w:val="Normal"/>
    <w:rPr><w:sz w:val="22"/></w:rPr>
  </w:style>
</w:styles>`;

function para(text, style, bold = false) {
  const rpr = bold ? "<w:rPr><w:b/></w:rPr>" : "";
  const ppr = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : "";
  return `<w:p>${ppr}<w:r>${rpr}<w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
}

function field(label, hint = "") {
  return (
    para(`${label}:`, "", true) +
    para(hint || "[Preencha aqui]", "") +
    para("", "")
  );
}

const ns = 'xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas" ' +
           'xmlns:cx="http://schemas.microsoft.com/office/drawing/2014/chartex" ' +
           'xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" ' +
           'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${ns}>
<w:body>

${para("MODELO DE CURRICULUM VITAE", "Heading1")}
${para("Parvagas — Angola", "")}
${para("", "")}

${para("DADOS PESSOAIS", "Heading2")}
${field("Nome completo")}
${field("Email")}
${field("Telefone", "+244 9XX XXX XXX")}
${field("Localização / Cidade")}
${field("LinkedIn / Portfólio", "https://")}

${para("RESUMO PROFISSIONAL", "Heading2")}
${para("[Escreva 3–5 frases descrevendo a sua experiência, competências e objetivos de carreira.]", "")}
${para("", "")}

${para("EXPERIÊNCIA PROFISSIONAL", "Heading2")}
${field("Cargo / Título")}
${field("Empresa")}
${field("Período", "Ex.: Jan 2021 – Dez 2023")}
${field("Localização")}
${field("Descrição / Responsabilidades")}
${para("", "")}
${para("[Repita para cada experiência]", "")}
${para("", "")}

${para("EDUCAÇÃO", "Heading2")}
${field("Curso / Grau")}
${field("Instituição")}
${field("Período", "Ex.: 2016 – 2020")}
${field("Descrição / Área de estudo")}
${para("", "")}

${para("COMPETÊNCIAS", "Heading2")}
${para("[Liste as suas competências separadas por vírgula — ex.: Microsoft Excel, Atendimento ao cliente, Gestão de projetos]", "")}
${para("", "")}

${para("IDIOMAS", "Heading2")}
${field("Idioma — Nível", "Ex.: Português (nativo), Inglês (intermédio)")}

${para("CERTIFICAÇÕES", "Heading2")}
${field("Nome da certificação")}
${field("Emitida por / Ano")}
${para("", "")}

${para("PREFERÊNCIAS DE EMPREGO", "Heading2")}
${field("Tipo de trabalho", "Ex.: Tempo inteiro, Remoto, Híbrido")}
${field("Disponibilidade", "Ex.: Imediata, 1 mês")}
${field("Expectativa salarial mensal (AOA)")}

<w:sectPr/>
</w:body>
</w:document>`;

// ─── Write DOCX ──────────────────────────────────────────────────────────────
fs.mkdirSync(OUT_DIR, { recursive: true });

const zipFiles = {
  "[Content_Types].xml": contentTypes,
  "_rels/.rels": rels,
  "word/_rels/document.xml.rels": wordRels,
  "word/styles.xml": styles,
  "word/document.xml": document,
};

const docxBuffer = buildZip(zipFiles);
fs.writeFileSync(OUT_FILE, docxBuffer);
console.log(`✅  CV template written to: ${OUT_FILE}`);

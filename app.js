const cameraInput = document.getElementById("cameraInput");
const galleryInput = document.getElementById("galleryInput");
const preview = document.getElementById("preview");
const previewWrap = document.getElementById("previewWrap");
const previewPlaceholder = document.getElementById("previewPlaceholder");
const runBtn = document.getElementById("runBtn");
const copyBtn = document.getElementById("copyBtn");
const csvBtn = document.getElementById("csvBtn");
const statusEl = document.getElementById("status");
const searchTypeEl = document.getElementById("searchType");
const searchValueEl = document.getElementById("searchValue");
const removeZeroEl = document.getElementById("removeLeadingZero");
const resultTableHeadEl = document.getElementById("resultTableHead");
const resultTableBodyEl = document.getElementById("resultTableBody");
const copyOutputEl = document.getElementById("copyOutput");
const ocrRawOutputEl = document.getElementById("ocrRawOutput");
const ocrLinesOutputEl = document.getElementById("ocrLinesOutput");

let currentFile = null;
let lastRows = [];
let selectedColumns = ["flightNo", "stand"];

const FIXED_SEARCH_VALUE = "박종규";

const COLUMN_LABELS = {
  flightNo: "편명",
  name: "이름(R/O L/D)",
  stand: "주기장",
  etd: "ETD",
  route: "노선",
  regNo: "등록기호",
  raw: "원문"
};

const VALID_STANDS = [
  "621", "622", "623", "624", "625", "626", "627",
  "672", "674L", "674R"
];

const KNOWN_NAMES = ["박종규", "이영식", "윤기선", "최용준"];

function setStatus(text) {
  if (statusEl) statusEl.textContent = text;
}

function enforceFixedSearch() {
  if (searchTypeEl) searchTypeEl.value = "raw";
  if (searchValueEl) {
    searchValueEl.value = FIXED_SEARCH_VALUE;
    searchValueEl.setAttribute("readonly", "readonly");
  }
}

function showPreview(file) {
  if (!file || !preview) return;
  currentFile = file;

  const url = URL.createObjectURL(file);
  preview.src = url;
  preview.style.display = "block";

  if (previewWrap) previewWrap.classList.remove("empty");
  if (previewPlaceholder) previewPlaceholder.style.display = "none";
}

if (cameraInput) {
  cameraInput.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (file) showPreview(file);
  });
}

if (galleryInput) {
  galleryInput.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (file) showPreview(file);
  });
}

if (searchTypeEl) {
  searchTypeEl.addEventListener("change", () => {
    searchTypeEl.value = "raw";
  });
}

if (searchValueEl) {
  searchValueEl.addEventListener("input", () => {
    searchValueEl.value = FIXED_SEARCH_VALUE;
  });
}

function getSelectedColumns() {
  const checked = Array.from(document.querySelectorAll('input[name="columns"]:checked'))
    .map((el) => el.value)
    .filter(Boolean);

  return checked.length ? checked : ["flightNo", "stand"];
}

function normalizeText(v) {
  return String(v || "")
    .replace(/\u00A0/g, " ")
    .replace(/[|]/g, "I")
    .replace(/[，]/g, ",")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function compactText(v) {
  return String(v || "").replace(/\s+/g, "");
}

function normalizeName(v) {
  if (!v) return "";
  const s = compactText(v);

  const nameMap = {
    "박종구": "박종규",
    "박종7": "박종규",
    "박종9": "박종규",
    "박종큐": "박종규",
    "이영삭": "이영식",
    "이영직": "이영식",
    "이영식1": "이영식",
    "윤기션": "윤기선",
    "최용춘": "최용준",
    "최용순": "최용준",
    "최용준1": "최용준"
  };

  return nameMap[s] || s;
}

function normalizeStand(value) {
  if (!value) return "";

  let v = String(value).toUpperCase().replace(/\s+/g, "").trim();

  const replacements = {
    "6741": "674L",
    "674I": "674L",
    "674|": "674L",
    "6748": "674R",
    "674B": "674R"
  };

  if (replacements[v]) v = replacements[v];

  if (/^674.$/.test(v)) {
    const tail = v.slice(3);
    if (["1", "I", "L", "|"].includes(tail)) return "674L";
    if (["8", "B", "R"].includes(tail)) return "674R";
  }

  return VALID_STANDS.includes(v) ? v : "";
}

function extractAnyStand(raw) {
  if (!raw) return "";
  const m = String(raw).toUpperCase().match(/\b(621|622|623|624|625|626|627|672|674[LRI18B|])\b/);
  return m ? normalizeStand(m[1]) : "";
}

function normalizeFlightNo(v, removeLeadingZero = true) {
  if (!v) return "";

  let s = String(v).toUpperCase().replace(/\s+/g, "").trim();

  s = s
    .replace(/^KJO/, "KJ0")
    .replace(/^KJQ/, "KJ0")
    .replace(/^KJI/, "KJ1")
    .replace(/^KJL/, "KJ1")
    .replace(/^KI/, "KJ")
    .replace(/^K\|/, "KJ")
    .replace(/[^A-Z0-9]/g, "");

  const m = s.match(/^KJ(\d{2,4})$/);
  if (!m) return "";

  let num = m[1];
  if (removeLeadingZero) num = String(parseInt(num, 10));
  return /^\d{2,4}$/.test(num) ? `KJ${num}` : "";
}

function extractFlightNo(raw, removeLeadingZero = true) {
  if (!raw) return "";
  const text = String(raw).toUpperCase();

  let m = text.match(/\bKJ[\s\-_:|.,]*\d{2,4}\b/);
  if (m) return normalizeFlightNo(m[0], removeLeadingZero);

  m = text.match(/\bK[JIOQL1|][\s\-_:|.,]*\d{2,4}\b/);
  if (m) return normalizeFlightNo(m[0], removeLeadingZero);

  m = text.match(/\bK\s*J\s*\d{2,4}\b/);
  if (m) return normalizeFlightNo(m[0], removeLeadingZero);

  m = text.match(/\b11(\d{3,4})\b/);
  if (m) return normalizeFlightNo(`KJ${m[1]}`, removeLeadingZero);

  m = text.match(/\bI1(\d{3,4})\b/);
  if (m) return normalizeFlightNo(`KJ${m[1]}`, removeLeadingZero);

  return "";
}

function extractRegNo(raw) {
  if (!raw) return "";
  const m = String(raw).toUpperCase().match(/\bHL\d{4}\b/);
  return m ? m[0] : "";
}

function extractETD(raw) {
  if (!raw) return "";

  let m = String(raw).match(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/);
  if (m) return `${m[1].padStart(2, "0")}:${m[2]}`;

  m = String(raw).match(/\b([01]\d|2[0-3])([0-5]\d)\b/);
  if (m) {
    const hhmm = m[0];
    if (/^(2026|2025|2024)$/.test(hhmm)) return "";
    return `${hhmm.slice(0, 2)}:${hhmm.slice(2, 4)}`;
  }

  return "";
}

function extractRoute(raw) {
  if (!raw) return "";
  const airports = String(raw).toUpperCase().match(/\b[A-Z]{3}\b/g) || [];
  const filtered = airports.filter((v) => !["DEP", "APR", "ETA", "ETD"].includes(v));
  return filtered.length >= 2 ? `${filtered[0]}-${filtered[1]}` : "";
}

function findNameInText(text) {
  const s = compactText(text);

  for (const name of KNOWN_NAMES) {
    if (s.includes(name)) return name;
  }

  const fixed = s
    .replace(/박종구/g, "박종규")
    .replace(/박종7/g, "박종규")
    .replace(/박종9/g, "박종규")
    .replace(/박종큐/g, "박종규")
    .replace(/이영삭/g, "이영식")
    .replace(/이영직/g, "이영식")
    .replace(/윤기션/g, "윤기선")
    .replace(/최용춘/g, "최용준")
    .replace(/최용순/g, "최용준");

  for (const name of KNOWN_NAMES) {
    if (fixed.includes(name)) return name;
  }

  return "";
}

function parseChunk(raw) {
  const removeLeadingZero = !!(removeZeroEl?.checked);
  const text = normalizeText(raw);

  return {
    flightNo: extractFlightNo(text, removeLeadingZero),
    name: normalizeName(findNameInText(text)),
    stand: extractAnyStand(text),
    etd: extractETD(text),
    route: extractRoute(text),
    regNo: extractRegNo(text),
    raw: text
  };
}

function dedupeRows(rows) {
  const seen = new Set();
  const out = [];

  for (const row of rows) {
    const key = [
      row.flightNo || "",
      row.name || "",
      row.stand || "",
      row.etd || "",
      row.regNo || ""
    ].join("|");

    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }

  return out;
}

function cleanWholeText(text) {
  return normalizeText(
    String(text || "")
      .replace(/에어제타\s*$$$.*?$$$/gi, " ")
      .replace(/주기장/g, " ")
      .replace(/편명/g, " ")
      .replace(/등록기호/g, " ")
      .replace(/DEP/g, " ")
      .replace(/APR/g, " ")
      .replace(/ETD\/ETA/g, " ")
      .replace(/R\/O\s*LD/g, " ")
      .replace(/T\/O\s*R\/I/g, " ")
  );
}

function getRowStartMatches(text) {
  const regex = /\b(621|622|623|624|625|626|627|672|674[LRI18B|])\s+([A-Z0-9]{3,8})\b/gi;
  const matches = [];
  let m;

  while ((m = regex.exec(text)) !== null) {
    const stand = normalizeStand(m[1]);
    const token2 = (m[2] || "").toUpperCase();

    const looksLikeFlight =
      token2.startsWith("K") ||
      /^11\d{3,4}$/.test(token2) ||
      /^I1\d{3,4}$/.test(token2);

    if (stand && looksLikeFlight) {
      matches.push({
        index: m.index,
        stand
      });
    }
  }

  return matches;
}

function splitWholeTextToChunks(text) {
  const cleaned = cleanWholeText(text);
  const starts = getRowStartMatches(cleaned);

  if (!starts.length) return [];

  const chunks = [];
  for (let i = 0; i < starts.length; i++) {
    const start = starts[i].index;
    const end = i < starts.length - 1 ? starts[i + 1].index : cleaned.length;
    const chunk = cleaned.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
  }

  return chunks;
}

function parseRowsFromWholeText(text) {
  const chunks = splitWholeTextToChunks(text);
  const debug = [];
  const rows = [];

  for (const chunk of chunks) {
    const row = parseChunk(chunk);

   

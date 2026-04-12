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

let currentFile = null;
let lastRows = [];
let selectedColumns = ["flightNo", "stand"];

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

const KNOWN_NAMES = ["박종규", "이영식", "윤기선"];

function setStatus(text) {
  if (statusEl) statusEl.textContent = text;
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

function getSelectedColumns() {
  const checked = Array.from(
    document.querySelectorAll('input[name="columns"]:checked')
  )
    .map((el) => el.value)
    .filter(Boolean);

  if (checked.length === 0) {
    return ["flightNo", "stand"];
  }
  return checked;
}

function normalizeText(v) {
  return String(v || "")
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeName(v) {
  if (!v) return "";
  let s = String(v).replace(/\s+/g, "").trim();

  const nameMap = {
    "박종구": "박종규",
    "박종7": "박종규",
    "박종9": "박종규",
    "박종큐": "박종규",
    "이영식|": "이영식",
    "이영식1": "이영식",
    "이영삭": "이영식",
    "이영직": "이영식",
    "윤기선1": "윤기선",
    "윤기션": "윤기선"
  };

  if (nameMap[s]) return nameMap[s];
  return s;
}

function normalizeFlightNo(v, removeLeadingZero = true) {
  if (!v) return "";

  let s = String(v).toUpperCase().replace(/\s+/g, "").trim();

  s = s
    .replace(/^KJO/, "KJ0")
    .replace(/^KJI/, "KJ1")
    .replace(/^KJ\|/, "KJ1")
    .replace(/^KJL/, "KJ1")
    .replace(/[^A-Z0-9]/g, "");

  let m = s.match(/^KJ(\d{4})$/);
  if (m) {
    const num = removeLeadingZero ? String(parseInt(m[1], 10)) : m[1];
    return "KJ" + num;
  }

  m = s.match(/^KJ(\d{3})$/);
  if (m) {
    return "KJ" + m[1];
  }

  m = s.match(/^0?(\d{3,4})$/);
  if (m) {
    const num = removeLeadingZero ? String(parseInt(m[1], 10)) : m[1];
    return "KJ" + num;
  }

  return s;
}

function extractFlightNo(raw, removeLeadingZero = true) {
  if (!raw) return "";

  const text = String(raw).toUpperCase();

  let m = text.match(/\bKJ[\s\-_:|.,]*0?\d{3,4}\b/);
  if (m) return normalizeFlightNo(m[0], removeLeadingZero);

  m = text.match(/\bKJ[O0I1|L]?[\s\-_:|.,]*\d{3,4}\b/);
  if (m) return normalizeFlightNo(m[0], removeLeadingZero);

  m = text.match(/\b0\d{3}\b/);
  if (m) return normalizeFlightNo(m[0], removeLeadingZero);

  m = text.match(/\b\d{3,4}\b/);
  if (m) {
    const n = m[0];
    if (!/^20\d{2}$/.test(n) && !/^(621|622|623|624|625|626|627|672)$/.test(n)) {
      return normalizeFlightNo(n, removeLeadingZero);
    }
  }

  return "";
}

function normalizeStand(value) {
  if (!value) return "";

  let v = String(value).toUpperCase().replace(/\s+/g, "").trim();

  const replacements = {
    "6748": "674R",
    "6746": "674R",
    "674B": "674R",
    "674P": "674R",
    "6741": "674L",
    "674I": "674L",
    "674|": "674L",
    "6258": "625",
    "6238": "623",
    "6248": "624",
    "6268": "626",
    "6278": "627"
  };

  if (replacements[v]) v = replacements[v];

  if (/^674.$/.test(v)) {
    const tail = v.slice(3);
    if (["8", "6", "B", "P", "R"].includes(tail)) return "674R";
    if (["1", "I", "|", "L"].includes(tail)) return "674L";
  }

  if (/^62[1-7].$/.test(v)) {
    const shortV = v.slice(0, 3);
    if (VALID_STANDS.includes(shortV)) return shortV;
  }

  if (VALID_STANDS.includes(v)) return v;

  const match = v.match(/\b(621|622|623|624|625|626|627|672|674L|674R)\b/);
  if (match) return match[1];

  return v;
}

function extractStand(raw) {
  if (!raw) return "";

  const tokens = String(raw).toUpperCase().match(/\b\d{3,4}[A-Z|]?\b/g) || [];
  const filtered = tokens.filter((v) => {
    if (/^20\d{2}$/.test(v)) return false;
    if (/^\d{2}$/.test(v)) return false;
    if (/^(0705|0715|0902|1300|1500)$/.test(v)) return false;
    return true;
  });

  for (let i = filtered.length - 1; i >= 0; i--) {
    const norm = normalizeStand(filtered[i]);
    if (VALID_STANDS.includes(norm)) return norm;
  }

  return filtered.length ? normalizeStand(filtered[filtered.length - 1]) : "";
}

function extractName(raw) {
  if (!raw) return "";

  const compact = String(raw).replace(/\s+/g, "");

  for (const name of KNOWN_NAMES) {
    if (compact.includes(name)) return name;
  }

  const fixedCompact = compact
    .replace(/박종구/g, "박종규")
    .replace(/박종7/g, "박종규")
    .replace(/박종9/g, "박종규")
    .replace(/박종큐/g, "박종규")
    .replace(/이영삭/g, "이영식")
    .replace(/이영직/g, "이영식")
    .replace(/윤기션/g, "윤기선");

  for (const name of KNOWN_NAMES) {
    if (fixedCompact.includes(name)) return name;
  }

  const m = String(raw).match(/\b[ABC]\s*[가-힣]{2,4}\b/);
  if (m) {
    const candidate = normalizeText(m[0]).replace(/^[ABC]\s*/, "");
    return normalizeName(candidate);
  }

  return "";
}

function extractETD(raw) {
  if (!raw) return "";

  let m = String(raw).match(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/);
  if (m) {
    return `${m[1].padStart(2, "0")}:${m[2]}`;
  }

  m = String(raw).match(/\b([01]\d|2[0-3])([0-5]\d)\b/);
  if (m) {
    const hhmm = m[0];
    if (/^(2026|2025|2024)$/.test(hhmm)) return "";
    return `${hhmm.slice(0, 2)}:${hhmm.slice(2, 4)}`;
  }

  return "";
}

function extractRegNo(raw) {
  if (!raw) return "";
  const m = String(raw).toUpperCase().match(/\bHL\d{4}\b/);
  return m ? m[0] : "";
}

function extractRoute(raw) {
  if (!raw) return "";
  const m = String(raw).toUpperCase().match(/\b([A-Z]{3})\s+([A-Z]{3})\b/);
  if (!m) return "";
  return `${m[1]}-${m[2]}`;
}

function rowMatches(row, searchType, keyword) {
  if (!keyword) return true;

  const normalizedKeyword = normalizeName(keyword).toUpperCase();
  const normalizedRowName = normalizeName(row.name).toUpperCase();

  if (searchType === "name") {
    return normalizedRowName === normalizedKeyword;
  }

  if (searchType === "flightNo") {
    return String(row.flightNo || "").toUpperCase().includes(normalizedKeyword);
  }

  if (searchType === "stand") {
    return String(row.stand || "").toUpperCase().includes(normalizedKeyword);
  }

  if (searchType === "raw") {
    return String(row.raw || "").toUpperCase().includes(normalizedKeyword);
  }

  return true;
}

function mergeBrokenNameRows(lines) {
  const merged = [];

  for (let i = 0; i < lines.length; i++) {
    let current = lines[i];
    const next = lines[i + 1] || "";

    const currentHasFlight = /KJ|0\d{3}|\b\d{3,4}\b/.test(current);
    const currentHasKnownName = /(박종규|박종구|박종7|박종9|박종큐|이영식|이영삭|이영직|윤기선|윤기션|[ABC]\s*[가-힣]{2,4})/.test(current);
    const nextStartsWithName = /^(박종규|박종구|박종7|박종9|박종큐|이영식|이영삭|이영직|윤기선|윤기션|[ABC]\s*[가-힣]{2,4})/.test(next);

    if (currentHasFlight && !currentHasKnownName && nextStartsWithName) {
      current = `${current} ${next}`;
      i += 1;
    }

    merged.push(current);
  }

  return merged;
}

function shouldRejectForExactNameSearch(row, keyword) {
  const targetName = normalizeName(keyword);
  const rowName = normalizeName(row.name);

  if (!targetName) return false;
  if (!rowName) return true;
  if (rowName !== targetName) return true;

  return false;
}

function parseRows(text, keyword, searchType = "name") {
  const removeLeadingZero = !!(removeZeroEl?.checked);

  const lines = String(text)
    .split(/\n+/)
    .map((v) => normalizeText(v))
    .filter(Boolean);

  const mergedLines = mergeBrokenNameRows(lines);
  const rows = [];

  for (const raw of mergedLines) {
    const row = {
      flightNo: extractFlightNo(raw, removeLeadingZero),
      name: normalizeName(extractName(raw)),
      stand: extractStand(raw),
      etd: extractETD(raw),
      route: extractRoute(raw),
      regNo: extractRegNo(raw),
      raw
    };

    row.stand = normalizeStand(row.stand);

    if (!row.flightNo && !row.name && !row.stand) continue;

    if (searchType === "name" && shouldRejectForExactNameSearch(row, keyword)) {
      continue;
    }

    if (!rowMatches(row, searchType, keyword)) continue;

    if (searchType === "name") {
      if (!row.name) continue;
      if (normalizeName(row.name) !== normalizeName(keyword)) continue;
    }

    // 이름 없이 편명/주기장만 뜬 행 제거
    if (searchType === "name" && !row.name) continue;

    rows.push(row);
  }

  return dedupeRows(rows);
}

function dedupeRows(rows) {
  const seen = new Set();
  const out = [];

  for (const row of rows) {
    const key = [
      row.flightNo || "",
      row.name || "",
      row.stand || "",
      row.etd || ""
    ].join("|");

    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }

  return out;
}

function renderTable(rows, columns) {
  if (!resultTableHeadEl || !resultTableBodyEl) return;

  resultTableHeadEl.innerHTML = "";
  resultTableBodyEl.innerHTML = "";

  const trHead = document.createElement("tr");
  columns.forEach((col) => {
    const th = document.createElement("th");
    th.textContent = COLUMN_LABELS[col] || col;
    trHead.appendChild(th);
  });
  resultTableHeadEl.appendChild(trHead);

  rows.forEach((row) => {
    const tr = document.createElement("tr");

    columns.forEach((col) => {
      const td = document.createElement("td");
      td.textContent = row[col] || "";
      tr.appendChild(td);
    });

    resultTableBodyEl.appendChild(tr);
  });
}

function buildCopyText(rows, columns) {
  return rows
    .map((row, idx) => {
      const parts = columns
        .map((col) => row[col] || "")
        .filter((v) => String(v).trim() !== "");
      return `${idx + 1}. ${parts.join(" / ")}`;
    })
    .join("\n");
}

function downloadCSV(rows, columns) {
  if (!rows.length) {
    alert("다운로드할 결과가 없습니다.");
    return;
  }

  const header = columns
    .map((c) => `"${(COLUMN_LABELS[c] || c).replace(/"/g, '""')}"`)
    .join(",");

  const body = rows.map((row) =>
    columns
      .map((c) => `"${String(row[c] || "").replace(/"/g, '""')}"`)
      .join(",")
  );

  const csv = [header, ...body].join("\n");
  const blob = new Blob(["\uFEFF" + csv], {
    type: "text/csv;charset=utf-8;"
  });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "ocr_result.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function preprocessImage(file) {
  const img = await new Promise((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = reject;
    el.src = URL.createObjectURL(file);
  });

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  const scale = 1.8;
  canvas.width = Math.floor(img.width * scale);
  canvas.height = Math.floor(img.height * scale);

  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    const v = gray > 175 ? 255 : gray < 120 ? 0 : gray;
    data[i] = v;
    data[i + 1] = v;
    data[i + 2] = v;
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

if (runBtn) {
  runBtn.addEventListener("click", async () => {
    if (!currentFile) {
      alert("사진을 먼저 선택하세요.");
      return;
    }

    try {
      selectedColumns = getSelectedColumns();
      setStatus("이미지 전처리 중...");

      const processed = await preprocessImage(currentFile);

      setStatus("OCR 실행 중...");

      const result = await Tesseract.recognize(processed, "kor+eng", {
        logger: (m) => {
          if (!m.status) return;
          const pct = m.progress ? ` ${Math.round(m.progress * 100)}%` : "";
          setStatus(`${m.status}${pct}`);
        }
      });

      const text = result?.data?.text || "";
      const keyword = searchValueEl ? searchValueEl.value.trim() : "";
      const searchType = searchTypeEl ? searchTypeEl.value : "name";

      lastRows = parseRows(text, keyword, searchType);

      renderTable(lastRows, selectedColumns);

      if (copyOutputEl) {
        copyOutputEl.value = buildCopyText(lastRows, selectedColumns);
      }

      setStatus(`완료 (${lastRows.length}건)`);
    } catch (err) {
      console.error(err);
      setStatus("오류 발생");
      alert("OCR 처리 중 오류가 발생했습니다.");
    }
  });
}

if (copyBtn) {
  copyBtn.addEventListener("click", async () => {
    const text = copyOutputEl ? copyOutputEl.value : "";
    if (!text) {
      alert("복사할 결과가 없습니다.");
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      alert("복사 완료");
    } catch (e) {
      console.error(e);
      alert("복사 실패");
    }
  });
}

if (csvBtn) {
  csvBtn.addEventListener("click", () => {
    downloadCSV(lastRows, selectedColumns);
  });
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((err) => {
      console.error("SW 등록 실패:", err);
    });
  });
}

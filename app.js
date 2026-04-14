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
  if (searchTypeEl) {
    searchTypeEl.value = "raw";
  }

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

  if (checked.length === 0) return ["flightNo", "stand"];
  return checked;
}

function normalizeText(v) {
  return String(v || "")
    .replace(/\u00A0/g, " ")
    .replace(/[|]/g, "I")
    .replace(/[，]/g, ",")
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
  if (removeLeadingZero) {
    num = String(parseInt(num, 10));
  }

  if (!/^\d{2,4}$/.test(num)) return "";
  return "KJ" + num;
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
  if (filtered.length >= 2) return `${filtered[0]}-${filtered[1]}`;
  return "";
}

function findNameInLine(line) {
  const s = compactText(line);

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
    .replace(/최용춘/g, "최용준");

  for (const name of KNOWN_NAMES) {
    if (fixed.includes(name)) return name;
  }

  return "";
}

function isHeaderLine(line) {
  const t = normalizeText(line).toUpperCase();
  return (
    !t ||
    t.includes("에어제타") ||
    t.includes("주기장") ||
    t.includes("편명") ||
    t.includes("등록기호") ||
    t.includes("R/O") ||
    t.includes("T/O") ||
    t.includes("R/I")
  );
}

function parseLine(line) {
  const removeLeadingZero = !!(removeZeroEl?.checked);
  const raw = normalizeText(line);

  const row = {
    flightNo: extractFlightNo(raw, removeLeadingZero),
    name: normalizeName(findNameInLine(raw)),
    stand: "",
    etd: extractETD(raw),
    route: extractRoute(raw),
    regNo: extractRegNo(raw),
    raw
  };

  const standMatch = raw.toUpperCase().match(/\b(621|622|623|624|625|626|627|672|674[LRI18B|])\b/);
  if (standMatch) {
    row.stand = normalizeStand(standMatch[1]);
  }

  return row;
}

function isStandOnlyLine(line) {
  const row = parseLine(line);
  return !!(row.stand && !row.flightNo && !row.name && !row.regNo && !row.etd);
}

function mergeBrokenLines(lines) {
  const out = [];

  for (let i = 0; i < lines.length; i++) {
    let current = normalizeText(lines[i]);
    if (!current) continue;

    const next = normalizeText(lines[i + 1] || "");
    const next2 = normalizeText(lines[i + 2] || "");

    const currentName = findNameInLine(current);
    const nextName = findNameInLine(next);

    if (!currentName && nextName) {
      const hasData =
        extractFlightNo(current) ||
        extractRegNo(current) ||
        extractETD(current) ||
        /\b(621|622|623|624|625|626|627|672|674[LRI18B|])\b/i.test(current);

      if (hasData) {
        current = `${current} ${next}`;
        i += 1;
      }
    }

    if (isStandOnlyLine(current) && next) {
      const nextParsed = parseLine(next);
      if (nextParsed.flightNo || nextParsed.regNo || nextParsed.etd) {
        current = `${current} ${next}`;
        i += 1;
      }
    }

    if (isStandOnlyLine(current) && next && next2) {
      const nextParsed = parseLine(next);
      const next2Name = findNameInLine(next2);

      if ((nextParsed.flightNo || nextParsed.regNo || nextParsed.etd) && next2Name) {
        current = `${current} ${next} ${next2}`;
        i += 2;
      }
    }

    out.push(current);
  }

  return out;
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

function dedupeRows(rows) {
  const seen = new Set();
  const out = [];

  for (const row of rows) {
    const key = [
      row.flightNo || "",
      row.name || "",
      row.stand || "",
      row.etd || "",
      row.regNo || "",
      row.raw || ""
    ].join("|");

    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }

  return out;
}

function parseRowsFromText(text, keyword, searchType = "raw") {
  const rawLines = String(text)
    .split(/\n+/)
    .map((v) => normalizeText(v))
    .filter(Boolean);

  const mergedLines = mergeBrokenLines(rawLines);
  const parsedRows = [];
  const debugLines = [];

  for (const line of mergedLines) {
    if (isHeaderLine(line)) continue;

    const row = parseLine(line);

    debugLines.push(
      [
        `RAW: ${row.raw}`,
        `→ name=${row.name || "-"}`,
        `flight=${row.flightNo || "-"}`,
        `stand=${row.stand || "-"}`,
        `etd=${row.etd || "-"}`,
        `reg=${row.regNo || "-"}`
      ].join(" | ")
    );

    if (!row.flightNo && !row.name && !row.stand && !row.regNo) continue;
    if (!rowMatches(row, searchType, keyword)) continue;
    if (!row.flightNo && !row.stand && !row.name) continue;

    parsedRows.push(row);
  }

  if (ocrLinesOutputEl) {
    ocrLinesOutputEl.value = debugLines.join("\n\n");
  }

  return dedupeRows(parsedRows);
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
    columns.map((c) => `"${String(row[c] || "").replace(/"/g, '""')}"`).join(",")
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

  const scale = 2.0;
  canvas.width = Math.floor(img.width * scale);
  canvas.height = Math.floor(img.height * scale);

  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    const v = gray > 185 ? 255 : gray < 140 ? 0 : gray;
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
      enforceFixedSearch();
      selectedColumns = getSelectedColumns();
      setStatus("이미지 전처리 중...");

      if (ocrRawOutputEl) ocrRawOutputEl.value = "";
      if (ocrLinesOutputEl) ocrLinesOutputEl.value = "";
      if (copyOutputEl) copyOutputEl.value = "";

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
      const keyword = FIXED_SEARCH_VALUE;
      const searchType = "raw";

      if (ocrRawOutputEl) {
        ocrRawOutputEl.value = text;
      }

      lastRows = parseRowsFromText(text, keyword, searchType);

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

enforceFixedSearch();

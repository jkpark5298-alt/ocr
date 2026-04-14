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

  if (checked.length === 0) return ["flightNo", "stand"];
  return checked;
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

  const text = String(raw).toUpperCase();

  const m = text.match(/\b(621|622|623|624|625|626|627|672|674[LRI18B|])\b/);
  if (!m) return "";

  return normalizeStand(m[1]);
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

function containsOtherKnownName(raw, targetName) {
  const compact = compactText(raw);
  return KNOWN_NAMES.some((name) => name !== targetName && compact.includes(name));
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

  return {
    flightNo: extractFlightNo(raw, removeLeadingZero),
    name: normalizeName(findNameInLine(raw)),
    stand: extractAnyStand(raw),
    etd: extractETD(raw),
    route: extractRoute(raw),
    regNo: extractRegNo(raw),
    raw,
    inferred: false
  };
}

function isStandOnlyLine(line) {
  const row = parseLine(line);
  return !!(row.stand && !row.flightNo && !row.name && !row.regNo && !row.etd);
}

function isStrongDataRow(row) {
  return !!(
    row.flightNo &&
    (row.stand || row.regNo || row.etd || row.route)
  );
}

function mergeBrokenLines(lines) {
  const out = [];

  for (let i = 0; i < lines.length; i++) {
    let current = normalizeText(lines[i]);
    if (!current) continue;

    const next = normalizeText(lines[i + 1] || "");
    const next2 = normalizeText(lines[i + 2] || "");
    const next3 = normalizeText(lines[i + 3] || "");

    const currentName = findNameInLine(current);
    const nextName = findNameInLine(next);

    if (!currentName && nextName) {
      const hasData =
        extractFlightNo(current) ||
        extractRegNo(current) ||
        extractETD(current) ||
        extractAnyStand(current);

      if (hasData) {
        current = `${current} ${next}`;
        i += 1;
      }
    }

    // 범위 확대: stand 줄 뒤 3줄까지 확인
    if (isStandOnlyLine(current)) {
      const candidates = [next, next2, next3].filter(Boolean);
      let merged = false;

      for (let j = 0; j < candidates.length; j++) {
        const candidate = candidates[j];
        const parsed = parseLine(candidate);

        if (parsed.flightNo || parsed.regNo || parsed.etd) {
          current = `${current} ${candidate}`;
          i += (j + 1);
          merged = true;
          break;
        }
      }

      if (merged) {
        out.push(current);
        continue;
      }
    }

    out.push(current);
  }

  return out;
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

function distanceToNearestExact(exactIndexes, idx) {
  if (!exactIndexes.length) return Infinity;
  let min = Infinity;
  for (const ex of exactIndexes) {
    min = Math.min(min, Math.abs(ex - idx));
  }
  return min;
}

function fillMissingStandFromNeighbors(rows) {
  return rows.map((row, idx) => {
    if (row.stand) return row;

    const windowSize = 3; // 범위 증가
    let bestStand = "";
    let bestDistance = Infinity;

    for (let offset = -windowSize; offset <= windowSize; offset++) {
      if (offset === 0) continue;

      const target = rows[idx + offset];
      if (!target) continue;

      const stand = extractAnyStand(target.raw);
      if (!stand) continue;

      const dist = Math.abs(offset);
      if (dist < bestDistance) {
        bestStand = stand;
        bestDistance = dist;
      }
    }

    if (bestStand) {
      return {
        ...row,
        stand: bestStand
      };
    }

    return row;
  });
}

function inferTargetRows(allRows, targetName) {
  const exactIndexes = [];
  allRows.forEach((row, idx) => {
    const rawCompact = compactText(row.raw);
    const nameNormalized = normalizeName(row.name);
    if (rawCompact.includes(targetName) || nameNormalized === targetName) {
      exactIndexes.push(idx);
    }
  });

  return allRows.map((row, idx) => {
    const copy = { ...row };

    const exact =
      compactText(copy.raw).includes(targetName) ||
      normalizeName(copy.name) === targetName;

    if (exact) {
      copy.name = targetName;
      copy.inferred = false;
      return copy;
    }

    const strong = isStrongDataRow(copy);
    const hasOtherName = containsOtherKnownName(copy.raw, targetName);
    const dist = distanceToNearestExact(exactIndexes, idx);

    const inferable =
      strong &&
      !copy.name &&
      !hasOtherName &&
      dist <= 3; // 범위 증가

    if (inferable) {
      copy.name = targetName;
      copy.inferred = true;
      return copy;
    }

    return copy;
  });
}

function parseRowsFromText(text) {
  const rawLines = String(text)
    .split(/\n+/)
    .map((v) => normalizeText(v))
    .filter(Boolean);

  const mergedLines = mergeBrokenLines(rawLines);
  let baseRows = [];
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
    if (!isStrongDataRow(row) && !row.name) continue;

    baseRows.push(row);
  }

  baseRows = fillMissingStandFromNeighbors(baseRows);

  const inferredRows = inferTargetRows(baseRows, FIXED_SEARCH_VALUE);

  const finalRows = inferredRows.filter((row) => {
    if (!row.flightNo) return false;
    if (normalizeName(row.name) !== FIXED_SEARCH_VALUE) return false;
    return true;
  });

  if (ocrLinesOutputEl) {
    const inferredDebug = inferredRows.map((row) => {
      return [
        `FINAL: ${row.raw}`,
        `→ name=${row.name || "-"}`,
        `flight=${row.flightNo || "-"}`,
        `stand=${row.stand || "-"}`,
        `etd=${row.etd || "-"}`,
        `reg=${row.regNo || "-"}`,
        `inferred=${row.inferred ? "Y" : "N"}`
      ].join(" | ");
    });

    ocrLinesOutputEl.value = [
      "[1] OCR 파싱 원본",
      debugLines.join("\n\n"),
      "",
      "[2] 추정 반영 후 최종 후보",
      inferredDebug.join("\n\n")
    ].join("\n");
  }

  return dedupeRows(finalRows);
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
      let value = row[col] || "";

      if (col === "name" && row.inferred && value === FIXED_SEARCH_VALUE) {
        value = `${value} (추정)`;
      }

      td.textContent = value;
      tr.appendChild(td);
    });

    resultTableBodyEl.appendChild(tr);
  });
}

function buildCopyText(rows, columns) {
  return rows
    .map((row, idx) => {
      const parts = columns
        .map((col) => {
          if (col === "name" && row.inferred && row[col] === FIXED_SEARCH_VALUE) {
            return `${row[col]}(추정)`;
          }
          return row[col] || "";
        })
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
    columns.map((c) => {
      let value = row[c] || "";
      if (c === "name" && row.inferred && value === FIXED_SEARCH_VALUE) {
        value = `${value}(추정)`;
      }
      return `"${String(value).replace(/"/g, '""')}"`;
    }).join(",")
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

      if (ocrRawOutputEl) {
        ocrRawOutputEl.value = text;
      }

      lastRows = parseRowsFromText(text);

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

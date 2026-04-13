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

const KNOWN_NAMES = ["박종규", "이영식", "윤기선", "최용준"];

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
    .replace(/[|]/g, "I")
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
    "이영식1": "이영식",
    "이영삭": "이영식",
    "이영직": "이영식",
    "윤기션": "윤기선",
    "최용준1": "최용준"
  };

  if (nameMap[s]) return nameMap[s];
  return s;
}

function normalizeStand(value) {
  if (!value) return "";

  let v = String(value).toUpperCase().replace(/\s+/g, "").trim();

  const replacements = {
    "6741": "674L",
    "674I": "674L",
    "674|": "674L",
    "674L.": "674L",
    "6748": "674R",
    "674B": "674R",
    "674R.": "674R",
    "6211": "621",
    "6222": "622",
    "6233": "623",
    "6244": "624",
    "6255": "625",
    "6266": "626",
    "6277": "627"
  };

  if (replacements[v]) v = replacements[v];

  if (/^674.$/.test(v)) {
    const tail = v.slice(3);
    if (["1", "I", "L", "|"].includes(tail)) return "674L";
    if (["8", "B", "R"].includes(tail)) return "674R";
  }

  if (VALID_STANDS.includes(v)) return v;

  return "";
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

  let m = s.match(/^KJ(\d{3,4})$/);
  if (!m) return "";

  let num = m[1];
  if (removeLeadingZero) {
    num = String(parseInt(num, 10));
  }
  return "KJ" + num;
}

function isValidFlightNo(v) {
  if (!v) return false;
  return /^KJ\d{2,4}$/.test(v);
}

function extractFlightFromToken(token, removeLeadingZero = true) {
  if (!token) return "";

  const raw = String(token).toUpperCase();

  let m = raw.match(/KJ[\s\-_:|.,]*\d{2,4}/);
  if (m) return normalizeFlightNo(m[0], removeLeadingZero);

  m = raw.match(/K[JIOQL1|][\s\-_:|.,]*\d{2,4}/);
  if (m) return normalizeFlightNo(m[0], removeLeadingZero);

  m = raw.match(/K\s*J\s*\d{2,4}/);
  if (m) return normalizeFlightNo(m[0], removeLeadingZero);

  return "";
}

function extractStandFromToken(token) {
  return normalizeStand(token);
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
    const v = m[0];
    if (/^(2026|2025|2024)$/.test(v)) return "";
    return `${v.slice(0, 2)}:${v.slice(2, 4)}`;
  }

  return "";
}

function extractRouteFromTokens(tokens) {
  const airports = tokens
    .map((t) => String(t.text || "").toUpperCase().replace(/[^A-Z]/g, ""))
    .filter((v) => /^[A-Z]{3}$/.test(v));

  if (airports.length < 2) return "";

  for (let i = 0; i < airports.length - 1; i++) {
    const a = airports[i];
    const b = airports[i + 1];
    if (a !== "DEP" && a !== "APR" && b !== "DEP" && b !== "APR") {
      return `${a}-${b}`;
    }
  }

  return "";
}

function extractNameFromTokens(tokens) {
  const joined = tokens
    .map((t) => normalizeText(t.text))
    .join(" ")
    .replace(/\s+/g, "");

  for (const name of KNOWN_NAMES) {
    if (joined.includes(name)) return name;
  }

  const fixed = joined
    .replace(/박종구/g, "박종규")
    .replace(/박종7/g, "박종규")
    .replace(/박종9/g, "박종규")
    .replace(/박종큐/g, "박종규")
    .replace(/이영삭/g, "이영식")
    .replace(/이영직/g, "이영식")
    .replace(/윤기션/g, "윤기선");

  for (const name of KNOWN_NAMES) {
    if (fixed.includes(name)) return name;
  }

  return "";
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

function isHeaderLikeRow(text) {
  const t = normalizeText(text).toUpperCase();
  return (
    t.includes("주기장") ||
    t.includes("편명") ||
    t.includes("등록기호") ||
    t.includes("ETD") ||
    t.includes("ETA") ||
    t.includes("R/O") ||
    t.includes("LD") ||
    t.includes("T/O") ||
    t.includes("R/I") ||
    t.includes("에어제타")
  );
}

function groupWordsIntoRows(words) {
  const cleanWords = (words || [])
    .filter((w) => w && w.text && String(w.text).trim())
    .map((w) => {
      const x0 = w.bbox?.x0 ?? 0;
      const y0 = w.bbox?.y0 ?? 0;
      const x1 = w.bbox?.x1 ?? x0;
      const y1 = w.bbox?.y1 ?? y0;
      return {
        text: normalizeText(w.text),
        x0,
        y0,
        x1,
        y1,
        cy: (y0 + y1) / 2,
        h: Math.max(1, y1 - y0)
      };
    });

  cleanWords.sort((a, b) => a.cy - b.cy);

  const rows = [];
  for (const word of cleanWords) {
    let found = null;

    for (const row of rows) {
      const tolerance = Math.max(12, row.avgHeight * 0.65);
      if (Math.abs(row.cy - word.cy) <= tolerance) {
        found = row;
        break;
      }
    }

    if (!found) {
      rows.push({
        cy: word.cy,
        avgHeight: word.h,
        words: [word]
      });
    } else {
      found.words.push(word);
      found.cy =
        found.words.reduce((sum, v) => sum + v.cy, 0) / found.words.length;
      found.avgHeight =
        found.words.reduce((sum, v) => sum + v.h, 0) / found.words.length;
    }
  }

  rows.forEach((row) => {
    row.words.sort((a, b) => a.x0 - b.x0);
    row.text = row.words.map((w) => w.text).join(" ");
  });

  return rows.filter((row) => !isHeaderLikeRow(row.text));
}

function parseStructuredRowsFromWords(words) {
  const removeLeadingZero = !!(removeZeroEl?.checked);
  const rows = groupWordsIntoRows(words);
  const out = [];

  for (const row of rows) {
    const tokens = row.words;
    const raw = row.text;

    let stand = "";
    let flightNo = "";
    let regNo = "";
    let etd = "";
    let name = "";

    for (const t of tokens) {
      const tokenText = String(t.text || "").trim();

      if (!stand) {
        const s = extractStandFromToken(tokenText);
        if (s) {
          stand = s;
          continue;
        }
      }

      if (!flightNo) {
        const f = extractFlightFromToken(tokenText, removeLeadingZero);
        if (isValidFlightNo(f)) {
          flightNo = f;
          continue;
        }
      }

      if (!regNo) {
        const reg = extractRegNo(tokenText);
        if (reg) {
          regNo = reg;
          continue;
        }
      }
    }

    etd = extractETD(raw);
    name = normalizeName(extractNameFromTokens(tokens));
    const route = extractRouteFromTokens(tokens);

    // 행 전체에서 한 번 더 보강
    if (!flightNo) {
      flightNo = extractFlightFromToken(raw, removeLeadingZero);
    }

    if (!regNo) {
      regNo = extractRegNo(raw);
    }

    const parsed = {
      flightNo,
      name,
      stand,
      etd,
      route,
      regNo,
      raw
    };

    // 핵심: 표 행으로 인정할 최소 조건
    // 이름 또는 편명 또는 주기장이 있어야 함
    if (!parsed.flightNo && !parsed.name && !parsed.stand) continue;

    // 편명 가짜값 제거
    if (parsed.flightNo && !isValidFlightNo(parsed.flightNo)) {
      parsed.flightNo = "";
    }

    // 주기장만 있고 이름/편명이 전혀 없으면 버림
    if (parsed.stand && !parsed.flightNo && !parsed.name) continue;

    out.push(parsed);
  }

  return dedupeRows(out);
}

function parseFallbackTextRows(text) {
  const removeLeadingZero = !!(removeZeroEl?.checked);

  const lines = String(text)
    .split(/\n+/)
    .map((v) => normalizeText(v))
    .filter(Boolean);

  const rows = [];

  for (const raw of lines) {
    if (isHeaderLikeRow(raw)) continue;

    const name = normalizeName(
      KNOWN_NAMES.find((n) => raw.replace(/\s+/g, "").includes(n)) || ""
    );

    const stand =
      normalizeStand((raw.match(/\b(621|622|623|624|625|626|627|672|674[LRI18B|])\b/i) || [])[1] || "");

    const flightNo = extractFlightFromToken(raw, removeLeadingZero);
    const regNo = extractRegNo(raw);
    const etd = extractETD(raw);

    const row = {
      flightNo,
      name,
      stand,
      etd,
      route: "",
      regNo,
      raw
    };

    if (!row.flightNo && !row.name && !row.stand) continue;
    if (row.stand && !row.flightNo && !row.name) continue;

    rows.push(row);
  }

  return dedupeRows(rows);
}

function parseRowsFromOCR(result, keyword, searchType = "name") {
  const words = result?.data?.words || [];
  const text = result?.data?.text || "";

  let rows = parseStructuredRowsFromWords(words);

  if (!rows.length) {
    rows = parseFallbackTextRows(text);
  }

  rows = rows.filter((row) => rowMatches(row, searchType, keyword));

  if (searchType === "name") {
    const target = normalizeName(keyword);
    rows = rows.filter((row) => normalizeName(row.name) === target);
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
      row.etd || "",
      row.regNo || ""
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

  const scale = 2.2;
  canvas.width = Math.floor(img.width * scale);
  canvas.height = Math.floor(img.height * scale);

  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    const v = gray > 188 ? 255 : gray < 138 ? 0 : gray;
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
        },
        tessedit_pageseg_mode: 6,
        preserve_interword_spaces: "1"
      });

      const keyword = searchValueEl ? searchValueEl.value.trim() : "";
      const searchType = searchTypeEl ? searchTypeEl.value : "name";

      lastRows = parseRowsFromOCR(result, keyword, searchType);

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

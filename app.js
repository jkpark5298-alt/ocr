const cameraInput = document.getElementById("cameraInput");
const galleryInput = document.getElementById("galleryInput");
const preview = document.getElementById("preview");
const searchFieldEl = document.getElementById("searchField");
const searchValueEl = document.getElementById("searchValue");
const runBtn = document.getElementById("runBtn");
const resetBtn = document.getElementById("resetBtn");
const statusEl = document.getElementById("status");
const copyOutputEl = document.getElementById("copyOutput");
const copyBtn = document.getElementById("copyBtn");
const csvBtn = document.getElementById("csvBtn");
const theadRow = document.getElementById("theadRow");
const resultBody = document.getElementById("resultBody");
const removeZeroEl = document.getElementById("removeZero");

let currentFile = null;
let lastRows = [];

const COL_LABELS = {
  flightNo: "편명",
  operator: "이름(R/O L/D)",
  stand: "주기장",
  etd: "ETD",
  raw: "원문"
};

function setStatus(text) {
  statusEl.textContent = text;
}

function cleanText(v) {
  return String(v || "").replace(/\u00a0/g, " ").replace(/[|]/g, "I").trim();
}

function bindPreview(file) {
  if (!file) return;
  currentFile = file;
  preview.src = URL.createObjectURL(file);
  preview.classList.remove("hidden");
  setStatus("사진 선택 완료");
}

cameraInput.addEventListener("change", (e) => bindPreview(e.target.files?.[0]));
galleryInput.addEventListener("change", (e) => bindPreview(e.target.files?.[0]));

function normalizeFlightNo(v, removeZero = true) {
  if (!v) return "";
  let s = String(v).toUpperCase().replace(/\s+/g, "");
  s = s.replace(/KJO/g, "KJ0");
  const m = s.match(/^KJ0?(\d{3,4})$/);
  if (!m) return s;
  const digits = m[1];
  if (removeZero && digits.length === 4 && digits[0] === "0") return "KJ" + digits.slice(1);
  return "KJ" + digits;
}

function normalizeName(v) {
  if (!v) return "";
  let s = String(v).replace(/\s+/g, "");
  s = s.replace(/^[ABC]/, "");
  const maps = {
    "박종구": "박종규",
    "박종7": "박종규",
    "박종9": "박종규",
    "박좀규": "박종규",
    "이영식8": "이영식",
    "윤기선8": "윤기선"
  };
  if (maps[s]) s = maps[s];
  if (s.includes("박종규") || s.includes("박종구")) return "박종규";
  if (s.includes("이영식")) return "이영식";
  if (s.includes("윤기선")) return "윤기선";
  return s;
}

const VALID_STANDS = ["621","622","623","624","625","626","627","672","674L","674R"];

function normalizeStand(v) {
  if (!v) return "";
  let s = String(v).toUpperCase().replace(/\s+/g, "");
  const map = {
    "6748": "674R",
    "674B": "674R",
    "6746": "674R",
    "6741": "674L",
    "674I": "674L",
    "674|": "674L",
    "6258": "625",
    "6238": "623",
    "6248": "624",
    "6268": "626"
  };
  if (map[s]) s = map[s];
  if (VALID_STANDS.includes(s)) return s;
  if (/^62[1-7].$/.test(s)) {
    const shortV = s.slice(0, 3);
    if (VALID_STANDS.includes(shortV)) return shortV;
  }
  if (/^674.$/.test(s)) {
    const tail = s.slice(3);
    if (["8","B","6","R"].includes(tail)) return "674R";
    if (["1","I","L"].includes(tail)) return "674L";
  }
  const m = s.match(/(621|622|623|624|625|626|627|672)/);
  return m ? m[1] : s;
}

function getSelectedColumns() {
  return [...document.querySelectorAll(".col-check:checked")].map(el => el.value);
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
  canvas.width = img.width * scale;
  canvas.height = img.height * scale;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    const val = gray > 170 ? 255 : gray < 118 ? 0 : gray;
    data[i] = val;
    data[i + 1] = val;
    data[i + 2] = val;
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

function parseRows(text) {
  const lines = String(text || "").split(/\n+/).map(v => cleanText(v)).filter(Boolean);
  const rows = [];
  const removeZero = removeZeroEl.checked;

  for (const raw of lines) {
    if (/편명|등록기호|주기장|외항사스케줄|기종|ETD|ETA/.test(raw)) continue;

    const flightMatch = raw.match(/\bKJ\s*0?\d{3,4}\b/i);
    const operatorMatch = raw.match(/\b[ABC]\s*[가-힣]{2,4}\b/) || raw.match(/\b(박종규|이영식|윤기선)\b/);
    const standMatches = raw.match(/\b\d{3,4}[A-Z]?\b/g) || [];
    const datetimeMatch = raw.match(/\b20\d{2}[-./]\d{2}[-./]\d{2}\s+\d{2}:\d{2}\b/);
    const timeMatch = raw.match(/\b\d{2}:\d{2}\b/);

    const flightNo = flightMatch ? normalizeFlightNo(flightMatch[0], removeZero) : "";
    const operator = operatorMatch ? normalizeName(operatorMatch[0]) : "";
    const etd = datetimeMatch ? datetimeMatch[0].replace(/[./]/g, "-") : (timeMatch ? timeMatch[0] : "");

    let stand = "";
    if (standMatches.length) {
      const filtered = standMatches.filter(v => {
        if (/^20\d{2}$/.test(v)) return false;
        if (/^\d{2}$/.test(v)) return false;
        if (/^\d{4}$/.test(v) && raw.includes("HL" + v)) return false;
        return true;
      });
      if (filtered.length) stand = normalizeStand(filtered[filtered.length - 1]);
    }

    if (!flightNo && !operator && !stand && !etd) continue;

    rows.push({ flightNo, operator, stand, etd, raw });
  }

  const uniq = [];
  const seen = new Set();
  for (const row of rows) {
    const key = [row.flightNo, row.operator, row.stand, row.etd].join("|");
    if (!seen.has(key)) {
      seen.add(key);
      uniq.push(row);
    }
  }
  return uniq;
}

function searchMatch(row, field, keyword) {
  const k = cleanText(keyword).replace(/\s+/g, "");
  if (!k) return true;
  let target = field === "raw" ? (row.raw || "") : (row[field] || "");
  target = String(target).replace(/\s+/g, "");
  if (field === "operator") return normalizeName(target).includes(normalizeName(k));
  return target.toUpperCase().includes(k.toUpperCase());
}

function renderTable(rows, cols) {
  theadRow.innerHTML = "";
  resultBody.innerHTML = "";

  if (!rows.length) {
    resultBody.innerHTML = '<tr><td class="muted">검색 결과가 없습니다.</td></tr>';
    return;
  }

  cols.forEach(col => {
    const th = document.createElement("th");
    th.textContent = COL_LABELS[col] || col;
    theadRow.appendChild(th);
  });

  rows.forEach(row => {
    const tr = document.createElement("tr");
    cols.forEach(col => {
      const td = document.createElement("td");
      td.textContent = row[col] || "";
      tr.appendChild(td);
    });
    resultBody.appendChild(tr);
  });
}

function buildCopyText(rows, cols) {
  return rows.map((row, idx) => {
    const vals = cols.map(col => row[col] || "").filter(Boolean);
    return `${idx + 1}. ${vals.join(" / ")}`;
  }).join("\n");
}

function download(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

runBtn.addEventListener("click", async () => {
  if (!currentFile) {
    alert("사진을 먼저 선택하세요.");
    return;
  }
  try {
    setStatus("이미지 전처리 중...");
    const processed = await preprocessImage(currentFile);
    setStatus("OCR 실행 중...");
    const result = await Tesseract.recognize(processed, "kor+eng", {
      logger: m => {
        if (!m.status) return;
        const pct = m.progress ? ` ${Math.round(m.progress * 100)}%` : "";
        setStatus(`${m.status}${pct}`);
      }
    });

    const parsed = parseRows(result?.data?.text || "");
    const filtered = parsed.filter(row => searchMatch(row, searchFieldEl.value, searchValueEl.value));
    const cols = getSelectedColumns();

    lastRows = filtered;
    renderTable(filtered, cols);
    copyOutputEl.value = buildCopyText(filtered, cols);
    setStatus(`완료: ${filtered.length}건 추출`);
  } catch (err) {
    console.error(err);
    setStatus("오류 발생");
    alert("OCR 중 오류가 발생했습니다.");
  }
});

copyBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(copyOutputEl.value || "");
    alert("복사되었습니다.");
  } catch (e) {
    alert("복사에 실패했습니다.");
  }
});

csvBtn.addEventListener("click", () => {
  const cols = getSelectedColumns();
  const header = cols.map(c => COL_LABELS[c] || c).join(",");
  const body = lastRows.map(row => cols.map(c => `"${String(row[c] || "").replace(/"/g, '""')}"`).join(",")).join("\n");
  download("ocr_result.csv", header + "\n" + body, "text/csv;charset=utf-8");
});

resetBtn.addEventListener("click", () => {
  currentFile = null;
  lastRows = [];
  preview.src = "";
  preview.classList.add("hidden");
  copyOutputEl.value = "";
  theadRow.innerHTML = "";
  resultBody.innerHTML = '<tr><td class="muted">아직 결과가 없습니다.</td></tr>';
  setStatus("초기화 완료");
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(console.error);
  });
}

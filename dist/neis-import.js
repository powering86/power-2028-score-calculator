(function () {
  const $ = (selector) => document.querySelector(selector), clean = (value) => String(value ?? "").trim();
  const colIndex = (ref) => [...String(ref || "").match(/[A-Z]+/i)?.[0]?.toUpperCase() || ""].reduce((sum, ch) => sum * 26 + ch.charCodeAt(0) - 64, 0) - 1;
  const rowIndex = (ref) => Number(String(ref || "").match(/\d+/)?.[0] || 1) - 1;
  const xml = (text) => {
    const document = new DOMParser().parseFromString(text, "application/xml");
    if (document.getElementsByTagName("parsererror").length) throw new Error("엑셀 내부 XML을 읽지 못했습니다.");
    return document;
  };
  const normalizePath = (value) => {
    const parts = [];
    for (const part of String(value || "").replace(/^\//, "").split("/")) {
      if (!part || part === ".") continue;
      if (part === "..") parts.pop(); else parts.push(part);
    }
    return parts.join("/");
  };
  async function readEntries(file) {
    if (file.size > 10 * 1024 * 1024) throw new Error("10MB 이하의 .xlsx 파일만 불러올 수 있습니다.");
    zip.configure({ useWebWorkers: false });
    const reader = new zip.ZipReader(new zip.BlobReader(file)), entries = await reader.getEntries();
    if (entries.length > 250) { await reader.close(); throw new Error("엑셀 내부 파일 수가 너무 많습니다."); }
    const total = entries.reduce((sum, entry) => sum + Number(entry.uncompressedSize || 0), 0);
    if (total > 60 * 1024 * 1024) { await reader.close(); throw new Error("압축 해제 크기가 60MB를 넘습니다."); }
    const map = new Map(entries.map((entry) => [entry.filename.replace(/^\//, ""), entry]));
    const text = async (name) => {
      const entry = map.get(name);
      if (!entry) return "";
      if (Number(entry.uncompressedSize || 0) > 20 * 1024 * 1024) throw new Error("엑셀 시트가 너무 큽니다.");
      return entry.getData(new zip.TextWriter());
    };
    return { reader, text };
  }
  function stringsFrom(text) {
    if (!text) return [];
    return [...xml(text).getElementsByTagName("si")].map((si) => [...si.getElementsByTagName("t")].map((node) => node.textContent || "").join(""));
  }
  function matrixFrom(text, shared) {
    const doc = xml(text), matrix = [];
    for (const cell of doc.getElementsByTagName("c")) {
      const ref = cell.getAttribute("r"), r = rowIndex(ref), c = colIndex(ref), type = cell.getAttribute("t");
      if (c < 0 || r < 0 || r > 10000 || c > 200) continue;
      const raw = type === "inlineStr" ? [...cell.getElementsByTagName("t")].map((n) => n.textContent || "").join("") : cell.getElementsByTagName("v")[0]?.textContent || "";
      const value = type === "s" ? shared[Number(raw)] ?? "" : type === "b" ? (raw === "1" ? "TRUE" : "FALSE") : raw;
      (matrix[r] ||= [])[c] = value;
    }
    for (const merge of doc.getElementsByTagName("mergeCell")) {
      const [start, end] = (merge.getAttribute("ref") || "").split(":"), r1 = rowIndex(start), r2 = rowIndex(end), c1 = colIndex(start), c2 = colIndex(end), value = matrix[r1]?.[c1];
      if (value == null || r2 - r1 > 100 || c2 - c1 > 30) continue;
      for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) (matrix[r] ||= [])[c] ??= value;
    }
    return matrix;
  }
  async function workbookSheets(file) {
    const { reader, text } = await readEntries(file);
    try {
      const shared = stringsFrom(await text("xl/sharedStrings.xml")), workbook = xml(await text("xl/workbook.xml")), rels = xml(await text("xl/_rels/workbook.xml.rels")), targets = new Map();
      for (const rel of rels.getElementsByTagName("Relationship")) targets.set(rel.getAttribute("Id"), rel.getAttribute("Target"));
      const sheets = [];
      for (const sheet of workbook.getElementsByTagName("sheet")) {
        const id = sheet.getAttribute("r:id") || sheet.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id"), target = targets.get(id);
        if (!target) continue;
        const path = normalizePath(target.startsWith("/") ? target : `xl/${target}`);
        const sheetText = await text(path);
        if (sheetText) sheets.push({ name: sheet.getAttribute("name") || "Sheet", matrix: matrixFrom(sheetText, shared) });
      }
      return sheets;
    } finally { await reader.close(); }
  }
  function render(rows, warnings, fileName) {
    $("#excelReviewTitle").textContent = `${fileName} · ${rows.length}개 과목 후보`;
    $("#excelReviewHint").textContent = warnings.filter(Boolean).join(" ") || "원본과 등급·학점·성취도를 대조한 뒤 추가하세요.";
    $("#excelReviewBody").innerHTML = rows.map((row, index) => `<tr data-excel-row="${index}"><td><input data-field="selected" type="checkbox" checked></td><td>${row.grade ?? "-"}-${row.semester ?? "-"}</td><td>${escapeHtml(row.subject)}</td><td>${escapeHtml(row.name)}</td><td>${escapeHtml(row.type)}</td><td>${row.credits ?? ""}</td><td>${row.rankGrade ?? ""}</td><td>${escapeHtml(row.achievement)}</td><td>${row.rawScore ?? ""}/${row.mean ?? ""}/${row.stddev ?? ""}</td><td>${row.classSize ?? ""}</td><td>${escapeHtml(row.sourceSheet)} ${row.sourceRow}행</td></tr>`).join("");
    $("#excelReview").showModal();
  }
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
  let importedRows = [];
  $("#neisExcelInput").addEventListener("change", async (event) => {
    const file = event.target.files?.[0]; if (!file) return;
    $("#excelImportStatus").textContent = "나이스 엑셀을 브라우저에서 읽는 중…";
    try {
      if (!/\.xlsx$/i.test(file.name)) throw new Error("현재는 .xlsx 파일만 지원합니다. .xls 파일은 Excel에서 .xlsx로 저장해 주세요.");
      const sheets = await workbookSheets(file), result = NeisParser.parseSheets(sheets);
      if (!result.rows.length) throw new Error(`${result.warnings.join(" ")} 개인성적 표가 있는 시트인지 확인해 주세요.`);
      importedRows = result.rows; render(importedRows, result.warnings, file.name);
      $("#excelImportStatus").textContent = `${result.rows.length}개 과목 후보를 찾았습니다.`;
    } catch (error) {
      importedRows = []; $("#excelImportStatus").textContent = `불러오기 실패: ${error.message || error}`;
    } finally { event.target.value = ""; }
  });
  $("#applyExcelRows").addEventListener("click", () => {
    let count = 0;
    document.querySelectorAll("[data-excel-row]").forEach((tr) => {
      if (!tr.querySelector('[data-field="selected"]').checked) return;
      const row = importedRows[Number(tr.dataset.excelRow)]; if (!row) return;
      window.addRow(row); count++;
    });
    $("#excelReview").close(); $("#excelImportStatus").textContent = `${count}개 과목을 상세 입력에 추가했습니다.`;
    window.saveMaybe?.();
  });
  $("#cancelExcelRows").addEventListener("click", () => $("#excelReview").close());
  window.clearNeisExcel = () => { importedRows = []; $("#excelImportStatus").textContent = ""; if ($("#excelReview").open) $("#excelReview").close(); };
})();

(function (root) {
  const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
  const key = (value) => clean(value).replace(/[\s·_()（）\[\]{}\/\\:-]/g, "");
  const number = (value) => {
    const match = clean(value).replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : null;
  };
  const aliases = {
    grade: ["학년"], semester: ["학기"], subject: ["교과", "교과군"],
    name: ["과목명", "교과목명", "과목", "교과목"], type: ["과목구분", "과목유형", "이수구분"],
    credits: ["이수단위", "단위수", "학점수", "학점"], rankGrade: ["석차등급", "내신등급"],
    classSize: ["수강자수", "수강인원", "재적수"], rawScore: ["원점수"], mean: ["과목평균", "평균"],
    stddev: ["표준편차"], achievement: ["성취도"], achievementRatio: ["성취도별분포비율", "성취도분포비율", "분포비율"],
    rank: ["석차"], tiedRank: ["공동석차", "동석차"],
  };
  const exactFirst = ["achievementRatio", "rankGrade", "tiedRank", "classSize", "rawScore", "stddev", "credits", "name", "type", "grade", "semester", "subject", "achievement", "rank", "mean"];
  function headerField(value) {
    const normalized = key(value);
    if (!normalized) return null;
    for (const field of exactFirst) {
      const found = aliases[field].some((alias) => normalized === key(alias) || normalized.includes(key(alias)));
      if (found) return field;
    }
    return null;
  }
  function inferSubject(name) {
    const value = clean(name);
    if (/국어|문학|독서|화법|언어와매체/.test(value)) return "국어";
    if (/수학|미적분|기하|확률과통계/.test(value)) return "수학";
    if (/영어/.test(value)) return "영어";
    if (/한국사/.test(value)) return "한국사";
    if (/사회|역사|지리|윤리|정치|경제|법과/.test(value)) return "사회";
    if (/과학|물리|화학|생명|지구/.test(value)) return "과학";
    if (/체육/.test(value)) return "체육";
    if (/음악|미술|예술/.test(value)) return "예술";
    return "기타";
  }
  function normalizeType(value, row) {
    const text = clean(value);
    if (/진로/.test(text)) return "진로선택";
    if (/융합/.test(text)) return "융합선택";
    if (/일반/.test(text)) return "일반선택";
    if (/전문/.test(text)) return "전문교과";
    if (/체육|예술/.test(text)) return "체육·예술";
    if (/공통/.test(text)) return "공통과목";
    return row.achievement && !row.rankGrade ? "진로선택" : "공통과목";
  }
  function combinedScore(value) {
    const text = clean(value).replace(/,/g, ""),
      match = text.match(/(-?\d+(?:\.\d+)?)\s*[/／]\s*(-?\d+(?:\.\d+)?)\s*[（(]\s*(-?\d+(?:\.\d+)?)\s*[)）]/);
    return match ? { rawScore: Number(match[1]), mean: Number(match[2]), stddev: Number(match[3]) } : null;
  }
  function combinedAchievement(value) {
    const match = clean(value).match(/\b([A-E])\s*[（(]\s*(\d+)\s*[)）]/i);
    return match ? { achievement: match[1].toUpperCase(), classSize: Number(match[2]) } : null;
  }
  function headerAt(matrix) {
    let best = null;
    for (let rowIndex = 0; rowIndex < Math.min(matrix.length, 40); rowIndex++) {
      const row = matrix[rowIndex] || [], above = matrix[rowIndex - 1] || [], mapping = {}, seen = new Set();
      row.forEach((cell, column) => {
        const combined = `${above[column] || ""} ${cell || ""}`,
          field = headerField(combined) || headerField(cell);
        if (field && !seen.has(field)) { mapping[field] = column; seen.add(field); }
      });
      const score = seen.size + (seen.has("name") ? 3 : 0) + (seen.has("grade") ? 1 : 0) + (seen.has("semester") ? 1 : 0);
      if (!best || score > best.score) best = { rowIndex, mapping, score };
    }
    return best?.score >= 5 ? best : null;
  }
  function cell(row, mapping, field) { return mapping[field] == null ? "" : row[mapping[field]]; }
  function parseMatrix(matrix, sheetName = "") {
    const header = headerAt(matrix);
    if (!header) return { rows: [], warning: `${sheetName || "시트"}: 성적 열 머리글을 찾지 못했습니다.` };
    const rows = [], previous = { grade: null, semester: null };
    for (let index = header.rowIndex + 1; index < matrix.length; index++) {
      const source = matrix[index] || [], name = clean(cell(source, header.mapping, "name"));
      if (!source.some((value) => clean(value))) continue;
      let grade = number(cell(source, header.mapping, "grade")) ?? previous.grade,
        semester = number(cell(source, header.mapping, "semester")) ?? previous.semester;
      if (grade) previous.grade = grade;
      if (semester) previous.semester = semester;
      const row = {
        grade, semester,
        subject: clean(cell(source, header.mapping, "subject")), name,
        credits: number(cell(source, header.mapping, "credits")),
        rankGrade: number(cell(source, header.mapping, "rankGrade")),
        classSize: number(cell(source, header.mapping, "classSize")),
        rank: number(cell(source, header.mapping, "rank")),
        tiedRank: number(cell(source, header.mapping, "tiedRank")),
        rawScore: number(cell(source, header.mapping, "rawScore")),
        mean: number(cell(source, header.mapping, "mean")),
        stddev: number(cell(source, header.mapping, "stddev")),
        achievement: clean(cell(source, header.mapping, "achievement")).match(/[A-E]/i)?.[0]?.toUpperCase() || "",
        achievementRatio: clean(cell(source, header.mapping, "achievementRatio")),
      };
      for (const value of source) {
        const score = combinedScore(value), achievement = combinedAchievement(value);
        if (score) {
          if (row.rawScore == null) row.rawScore = score.rawScore;
          if (row.mean == null) row.mean = score.mean;
          if (row.stddev == null) row.stddev = score.stddev;
        }
        if (achievement) {
          if (!row.achievement) row.achievement = achievement.achievement;
          if (row.classSize == null) row.classSize = achievement.classSize;
        }
      }
      if (!row.name || (!row.rankGrade && !row.achievement && row.rawScore == null)) continue;
      row.subject = row.subject || inferSubject(row.name);
      row.type = normalizeType(cell(source, header.mapping, "type"), row);
      row.sourceSheet = sheetName;
      row.sourceRow = index + 1;
      row.confidence = [row.grade, row.semester, row.subject, row.name, row.credits, row.rankGrade || row.achievement].filter(Boolean).length >= 6 ? 95 : 75;
      rows.push(row);
    }
    return { rows, headerRow: header.rowIndex + 1, warning: rows.length ? "" : `${sheetName || "시트"}: 성적 행을 찾지 못했습니다.` };
  }
  function parseSheets(sheets) {
    const rows = [], warnings = [], seen = new Set();
    for (const sheet of sheets) {
      const result = parseMatrix(sheet.matrix || [], sheet.name || "");
      if (result.warning) warnings.push(result.warning);
      for (const row of result.rows) {
        const id = [row.grade, row.semester, row.subject, row.name, row.credits, row.rankGrade, row.achievement].join("|");
        if (!seen.has(id)) { seen.add(id); rows.push(row); }
      }
    }
    return { rows, warnings };
  }
  root.NeisParser = { parseMatrix, parseSheets, headerField };
})(typeof window !== "undefined" ? window : globalThis);

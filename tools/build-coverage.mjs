import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const project = path.resolve(import.meta.dirname, "..");
const workspace = path.resolve(project, "..", "..");
const loadBrowserData = (file) => {
  const context = { window: {}, Set };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(file, "utf8"), context);
  return context.window;
};
const catalog = loadBrowserData(
  path.join(project, "dist/data/universities.js"),
).UNIVERSITY_CATALOG;
const rules = loadBrowserData(
  path.join(project, "dist/data/score-rules.js"),
).SCORE_RULES;
const atlasDetails = loadBrowserData(
  path.join(workspace, "sites/admission-atlas-2028/dist/details.js"),
).UNIVERSITY_DETAILS;
const manifest = JSON.parse(
  fs.readFileSync(path.join(workspace, "work/all-plans/manifest.json"), "utf8"),
);
const extraction = JSON.parse(
  fs.readFileSync(
    path.join(workspace, "work/all-plans/extraction-manifest.json"),
    "utf8",
  ),
);
const byPlan = new Map(manifest.map((x) => [x.planId, x]));
const extracted = new Map(extraction.map((x) => [x.planId, x]));
const markerWeights = [
  ["교과성적 반영방법", 5],
  ["산출방법", 4],
  ["산출식", 4],
  ["환산점수", 4],
  ["등급별", 2],
  ["성취도", 2],
  ["이수단위", 2],
  ["출결", 1],
];
const pageCandidates = (text) =>
  text
    .split(/===== PDF (\d+)쪽 =====/)
    .slice(1)
    .reduce((list, value, index, array) => {
      if (index % 2) return list;
      const page = Number(value),
        body = array[index + 1] || "",
        score = markerWeights.reduce(
          (sum, [word, weight]) => sum + (body.includes(word) ? weight : 0),
          0,
        );
      if (score) list.push({ page, score });
      return list;
    }, [])
    .sort((a, b) => b.score - a.score || a.page - b.page)
    .slice(0, 3);

const rows = catalog.map((u) => {
  const source = byPlan.get(u.planId),
    ext = extracted.get(u.planId);
  const detail = atlasDetails?.[u.raw] || {};
  const universityRules = rules.filter(
    (r) =>
      r.university === u.name &&
      (!r.campus || r.campus === u.campus || r.campus.includes(u.campus)),
  );
  const exact = universityRules.filter((r) => r.status === "계산 가능").length,
    hasPartial = universityRules.some((r) => r.status === "일부 계산 가능"),
    allNotQuantitative =
      universityRules.length > 0 &&
      universityRules.every((r) => r.status === "해당 전형 미반영");
  let markerScore = 0,
    candidatePages = [];
  if (ext?.ok && ext.text && fs.existsSync(ext.text)) {
    const text = fs.readFileSync(ext.text, "utf8");
    markerScore = markerWeights.reduce(
      (sum, [word, weight]) => sum + (text.includes(word) ? weight : 0),
      0,
    );
    candidatePages = pageCandidates(text);
  }
  return {
    raw: u.raw,
    university: u.name,
    campus: u.campus,
    region: u.region,
    type: u.type,
    planId: u.planId,
    sourceStatus: source?.status || "원문 미연결",
    fileType: u.fileType || source?.fileType || null,
    sourceUrl:
      detail.source ||
      (u.planId
        ? `https://sam.adiga.kr/common/downloadFile.do?fileId=${u.planId}&fileSn=1&filePath=kcu.fileStorePath`
        : null),
    sourceName: detail.sourceName || null,
    localSourceAvailable: universityRules.some(
      (rule) =>
        rule.evidence?.file &&
        fs.existsSync(path.join(project, "dist", rule.evidence.file)),
    ),
    extractionStatus: ext?.ok ? "추출 완료" : "추출 확인 필요",
    extractedChars: ext?.chars || 0,
    ruleCount: universityRules.length,
    exactRuleCount: exact,
    verificationStatus: exact
      ? "계산 가능 전형 있음"
      : hasPartial
        ? "공개 정량분만 계산 가능"
        : allNotQuantitative
          ? "학생부 정량 환산 미반영"
          : universityRules.length
            ? "세부 계산식 미공개"
        : u.planId
          ? "검수 대기"
          : "원문 미공개",
    extractionPriority:
      markerScore >= 15 ? "높음" : markerScore >= 9 ? "보통" : "낮음",
    markerScore,
    candidatePages,
  };
});
const summary = {
  generatedAt: new Date().toISOString(),
  catalogCount: rows.length,
  connectedSources: rows.filter((x) => x.planId).length,
  extracted: rows.filter((x) => x.extractionStatus === "추출 완료").length,
  universitiesWithExactRules: new Set(
    rows.filter((x) => x.exactRuleCount).map((x) => x.university),
  ).size,
  campusesWithExactRules: rows.filter((x) => x.exactRuleCount).length,
  reviewedCampuses: rows.filter((x) => x.ruleCount).length,
  blockedOrPartialCampuses: rows.filter((x) => x.ruleCount && !x.exactRuleCount)
    .length,
  unreviewedCampuses: rows.filter((x) => !x.ruleCount).length,
  pending: rows.filter((x) => !x.exactRuleCount).length,
};
fs.writeFileSync(
  path.join(project, "dist/data/coverage.js"),
  `window.COVERAGE_SUMMARY=${JSON.stringify(summary)};\nwindow.COVERAGE_ROWS=${JSON.stringify(rows)};\n`,
);
fs.writeFileSync(
  path.join(project, "docs/coverage-summary.json"),
  JSON.stringify({ summary, rows }, null, 2),
);
const csv = [
  "대학,캠퍼스,지역,원문ID,파일형식,텍스트추출,규칙수,정확계산규칙수,검수상태,추출우선순위",
  ...rows.map((r) =>
    [
      r.university,
      r.campus,
      r.region,
      r.planId,
      r.fileType,
      r.extractionStatus,
      r.ruleCount,
      r.exactRuleCount,
      r.verificationStatus,
      r.extractionPriority,
    ]
      .map((v) => `"${String(v ?? "").replaceAll('"', '""')}"`)
      .join(","),
  ),
].join("\n");
fs.writeFileSync(path.join(project, "docs/coverage.csv"), "\ufeff" + csv);
const queue = [
  "대학,캠퍼스,원문ID,검수상태,우선순위,후보쪽",
  ...rows
    .filter((r) => !r.exactRuleCount)
    .sort(
      (a, b) =>
        b.markerScore - a.markerScore ||
        a.university.localeCompare(b.university, "ko"),
    )
    .map((r) =>
      [
        r.university,
        r.campus,
        r.planId,
        r.verificationStatus,
        r.extractionPriority,
        r.candidatePages.map((x) => `${x.page}쪽(${x.score})`).join(" / "),
      ]
        .map((v) => `"${String(v ?? "").replaceAll('"', '""')}"`)
        .join(","),
    ),
].join("\n");
fs.writeFileSync(path.join(project, "docs/review-queue.csv"), "\ufeff" + queue);
console.log(summary);

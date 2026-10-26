const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const project = path.resolve(__dirname, "..");
const context = { window: {}, Set };
vm.createContext(context);
for (const file of [
  "dist/data/universities.js",
  "dist/data/score-rules.js",
  "dist/data/coverage.js",
  "dist/validator.js",
  "dist/evidence.js",
]) {
  vm.runInContext(fs.readFileSync(path.join(project, file), "utf8"), context);
}

const catalog = context.window.UNIVERSITY_CATALOG;
const rules = context.window.SCORE_RULES;
const coverage = context.window.COVERAGE_ROWS;
const Evidence = context.window.Evidence;
const ScoreValidator = context.window.ScoreValidator;
const allowedStatuses = new Set([
  "계산 가능",
  "일부 계산 가능",
  "상세 기준 미공개",
  "모집요강 확인 필요",
  "원문 확인 불가",
  "해당 전형 미반영",
]);
const matchesCampus = (rule, university) =>
  rule.university === university.name &&
  (!rule.campus ||
    rule.campus === university.campus ||
    rule.campus.includes(university.campus));

test("실재 220개 대학·캠퍼스 모두 규칙 또는 계산 불가 상태와 연결된다", () => {
  assert.equal(catalog.length, 220);
  assert.ok(!catalog.some((item) => item.name === "KCUE대학교"), "시험용 가상 대학이 공개 목록에 포함됨");
  for (const university of catalog) {
    assert.ok(
      rules.some((rule) => matchesCampus(rule, university)),
      `${university.raw}: 연결 규칙 없음`,
    );
  }
});

test("대학 목록은 계산 가능·부분 계산·미공개·정량 미반영 상태를 모호하지 않게 표시한다", () => {
  const labels = new Set(coverage.map((row) => row.verificationStatus));
  assert.ok(labels.has("계산 가능 전형 있음"));
  assert.ok(labels.has("공개 정량분만 계산 가능"));
  assert.ok(labels.has("세부 계산식 미공개"));
  assert.ok(labels.has("학생부 정량 환산 미반영"));
  assert.ok(!labels.has("일부 규칙 입력"));
});

test("규칙 ID와 근거 메타데이터는 전체 데이터에서 유효하다", () => {
  assert.equal(new Set(rules.map((rule) => rule.id)).size, rules.length);
  const catalogPlanIds = new Set(catalog.map((item) => item.planId).filter(Boolean));
  for (const rule of rules) {
    assert.ok(rule.id, "규칙 ID 누락");
    assert.ok(rule.university, `${rule.id}: 대학명 누락`);
    assert.ok(rule.campus, `${rule.id}: 캠퍼스 누락`);
    assert.ok(allowedStatuses.has(rule.status), `${rule.id}: 알 수 없는 상태`);
    assert.ok(rule.verificationStatus, `${rule.id}: 검수 상태 누락`);
    assert.ok(rule.evidence, `${rule.id}: 근거 누락`);
    assert.ok(rule.evidence.table, `${rule.id}: 표 제목 누락`);
    if (rule.evidence.planId) {
      assert.ok(rule.evidence.planId, `${rule.id}: 원문 ID 누락`);
      assert.ok(catalogPlanIds.has(rule.evidence.planId), `${rule.id}: 알 수 없는 원문 ID`);
      assert.ok(rule.evidence.pages, `${rule.id}: 근거 쪽수 누락`);
      assert.ok(rule.evidence.file, `${rule.id}: 원문 파일 경로 누락`);
    } else {
      assert.equal(rule.status, "원문 확인 불가", `${rule.id}: 원문 ID 누락`);
    }
  }
});

test("전체 캠퍼스는 공식 원문 또는 배포된 로컬 원문에 연결된다", () => {
  for (const row of coverage) {
    assert.ok(
      row.sourceUrl || row.localSourceAvailable,
      `${row.raw}: 시행계획 원문 연결 누락`,
    );
  }
});

test("모든 규칙은 허용된 계산 가능 상태와 완전한 근거 위치를 갖는다", () => {
  const allowed = new Set([
    "계산 가능",
    "일부 계산 가능",
    "상세 기준 미공개",
    "모집요강 확인 필요",
    "원문 확인 불가",
    "해당 전형 미반영",
  ]);
  for (const rule of rules) {
    assert.ok(allowed.has(rule.status), `${rule.id}: 알 수 없는 상태 ${rule.status}`);
    assert.ok(rule.evidence?.planId, `${rule.id}: 원문 ID 누락`);
    assert.ok(rule.evidence?.pages, `${rule.id}: 근거 쪽수 누락`);
    assert.ok(rule.evidence?.table, `${rule.id}: 근거 표 제목 누락`);
  }
});

test("계산 가능 규칙은 공식·만점·선택 규칙과 상세입력 안내를 갖는다", () => {
  for (const rule of rules.filter((item) => item.status === "계산 가능")) {
    assert.ok(rule.formula, `${rule.id}: 공식 누락`);
    assert.ok(Number.isFinite(rule.maximumScore), `${rule.id}: 만점 누락`);
    assert.ok(rule.selectionRule, `${rule.id}: 선택 규칙 누락`);
    assert.ok(rule.quickMode, `${rule.id}: 입력 방식 안내 누락`);
  }
});

test("로컬 원문이 없는 규칙은 공식 외부 원문 주소로 대체된다", () => {
  assert.equal(coverage.length, 220);
  for (const rule of rules.filter((item) => item.evidence.planId)) {
    const source = coverage.find((row) => row.planId === rule.evidence.planId);
    assert.ok(source, `${rule.id}: 원문 연결 행 누락`);
    const href = Evidence.href(rule.evidence);
    assert.ok(href && href !== "#", `${rule.id}: 원문 링크 누락`);
    if (!source.localSourceAvailable) {
      assert.match(href, /^https:\/\//, `${rule.id}: 외부 원문 대체 링크 누락`);
    }
  }
});

test("모든 규칙은 빈 학기·쪽수 값이 있어도 사용자용 상태 문구를 만든다", () => {
  for (const rule of rules) {
    assert.doesNotMatch(Evidence.label(rule.evidence), /null|undefined/);
    assert.ok(ScoreValidator.quick(rule), `${rule.id}: 간편입력 상태 문구 누락`);
    assert.ok(ScoreValidator.quickAssessment(rule, {}).mode, `${rule.id}: 간편 판정 누락`);
  }
});

test("계산 가능 여부와 대학 미공개 기준을 학생 입력 부족과 분리한다", () => {
  for (const rule of rules) {
    const gaps = ScoreValidator.disclosureGaps(rule);
    if (rule.status === "계산 가능") assert.equal(gaps.length, 0);
    else assert.ok(gaps.length, `${rule.id}: 계산 제한 사유 누락`);
  }
  const blocked = rules.find((rule) => rule.id === "pknu-gyogwa-2028");
  const assessment = ScoreValidator.quickAssessment(blocked, {});
  assert.ok(assessment.missing.length);
  assert.ok(assessment.disclosureGaps.length);
});

test("출결 반영·미반영·세부표 미공개 상태를 구분한다", () => {
  const reflected = rules.find((rule) => rule.id === "kyonggi-gyogwa-2028");
  const notReflected = rules.find((rule) => rule.id === "skhu-record-2028");
  const unpublished = rules.find((rule) => rule.id === "kyungwoon-top11-2028");
  assert.equal(ScoreValidator.attendanceStatus(reflected), "반영");
  assert.equal(ScoreValidator.attendanceStatus(notReflected), "미반영");
  assert.equal(
    ScoreValidator.attendanceStatus(unpublished),
    "반영(세부표 미공개)",
  );
});

test("출결 계산 방식에 따라 필요한 입력 항목만 안내한다", () => {
  const aggregate = rules.find((rule) => rule.id === "kyonggi-gyogwa-2028");
  const perfectYears = rules.find(
    (rule) => rule.attendanceRule?.mode === "perfectAttendanceYears",
  );
  const unpublished = rules.find(
    (rule) => rule.attendanceRule?.mode === "unpublishedTable",
  );
  assert.deepEqual(
    Array.from(ScoreValidator.requiredAttendanceFields(aggregate)),
    ["unexcusedAbsence", "tardy", "early", "missingClass"],
  );
  assert.deepEqual(
    Array.from(ScoreValidator.requiredAttendanceFields(perfectYears)),
    ["perfectAttendanceYears"],
  );
  assert.deepEqual(Array.from(ScoreValidator.requiredAttendanceFields(unpublished)), []);
  assert.ok(ScoreValidator.requirements(perfectYears).includes("1·2학년 개근 횟수"));
});

test("선택한 전형의 계산식에 필요한 상세 입력 열을 동적으로 산출한다", () => {
  const rule = rules.find((item) => item.id === "changwon-main-humanities-2028");
  const fields = ScoreValidator.requiredFields(rule);
  for (const field of [
    "grade",
    "semester",
    "subject",
    "rankGrade",
    "rank",
    "tiedRank",
    "classSize",
    "rawScore",
    "mean",
    "stddev",
  ]) {
    assert.ok(fields.includes(field), `${field} 필수 열 누락`);
  }
  assert.equal(fields.includes("name"), false, "계산에 쓰지 않는 과목명을 필수로 요구함");
});

test("성취도별 전체 분포와 현재 성취비율을 계산 의미에 따라 구분한다", () => {
  const thresholdRule = rules.find((rule) => rule.id === "sungshin-regional-humanities-2028");
  const cumulativeRule = rules.find((rule) => rule.id === "chungbuk-gyogwa-2028");
  assert.ok(ScoreValidator.requiredFields(thresholdRule).includes("achievementRate"));
  assert.equal(ScoreValidator.requiredFields(thresholdRule).includes("achievementRatio"), false);
  assert.ok(ScoreValidator.requiredFields(cumulativeRule).includes("achievementRatio"));
});

test("대학 환산기준이 미공개인 전형은 불필요한 학생 입력을 요구하지 않는다", () => {
  const blocked = rules.find((rule) => rule.id === "handong-gimpact-2028");
  const component = rules.find((rule) => rule.id === "halla-record-2028");
  assert.equal(ScoreValidator.requiredFields(blocked).length, 0);
  assert.equal(ScoreValidator.requirements(blocked).length, 0);
  assert.ok(ScoreValidator.requiredFields(component).length > 0);
});

test("간편 입력은 명시된 출결 감점만 계산하고 평균등급을 임의 환산하지 않는다", () => {
  const attendanceOnly = rules.find((item) => item.id === "dnue-record-2028");
  const detailed = rules.find((item) => item.id === "skhu-record-2028");
  const quick = ScoreValidator.quickAssessment(attendanceOnly, {
    unexcusedAbsence: 3,
  });
  assert.equal(quick.calculable, true);
  assert.equal(quick.value, -3);
  assert.match(quick.label, /3점 감점/);
  const blocked = ScoreValidator.quickAssessment(detailed, {
    allAverage: 2.3,
  });
  assert.equal(blocked.calculable, false);
  assert.equal(blocked.value, null);
});

test("평균등급 구간표가 공개된 전형만 간편 교과점수를 계산한다", () => {
  const rule = rules.find((item) => item.id === "dgau-record-2028");
  const firstBand = ScoreValidator.quickAssessment(rule, { allAverage: 1.99 });
  const boundary = ScoreValidator.quickAssessment(rule, { allAverage: 2.0 });
  const missing = ScoreValidator.quickAssessment(rule, { allAverage: "" });
  assert.equal(firstBand.value, 100);
  assert.equal(boundary.value, 90);
  assert.equal(missing.calculable, false);
  assert.match(firstBand.warning, /학교폭력 감점은 반영하지/);
});

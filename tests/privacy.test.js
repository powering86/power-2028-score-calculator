const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");

const app = readFileSync(path.join(__dirname, "../dist/app.js"), "utf8");
const ocr = readFileSync(path.join(__dirname, "../dist/ocr.js"), "utf8");
const neis = readFileSync(path.join(__dirname, "../dist/neis-import.js"), "utf8");
const styles = readFileSync(path.join(__dirname, "../dist/styles.css"), "utf8");

test("전체 삭제는 저장본·출결·사진·비교 결과를 함께 지운다", () => {
  assert.match(app, /localStorage\.removeItem\("power2028-record"\)/);
  assert.match(app, /\$\$\('\[data-att\]'\)/);
  assert.match(app, /window\.clearTranscriptPhoto\?\.\(\)/);
  assert.match(app, /window\.clearNeisExcel\?\.\(\)/);
  assert.match(app, /state\.compare\.clear\(\)/);
  assert.match(ocr, /window\.clearTranscriptPhoto=dispose/);
  assert.match(ocr, /worker\.terminate\(\)/);
});

test("나이스 엑셀은 로컬 XLSX만 제한된 크기로 읽고 검토 후 추가한다", () => {
  const html = readFileSync(path.resolve(__dirname, "../dist/index.html"), "utf8");
  assert.match(html, /id="neisExcelInput"[\s\S]*?accept="\.xlsx,/);
  assert.match(html, /src="vendor\/zip\.min\.js"/);
  assert.match(neis, /file\.size > 10 \* 1024 \* 1024/);
  assert.match(neis, /total > 60 \* 1024 \* 1024/);
  assert.match(neis, /\.xlsx 파일만 지원합니다/);
  assert.match(neis, /window\.addRow\(row\)/);
  assert.doesNotMatch(neis, /fetch\s*\(|XMLHttpRequest|sendBeacon/i);
});

test("OCR은 배포물 안의 로컬 엔진과 언어 모델만 참조한다", () => {
  assert.match(ocr, /workerPath:'vendor\/worker\.min\.js'/);
  assert.match(ocr, /langPath:'vendor\/lang'/);
  assert.match(ocr, /corePath:'vendor\/tesseract-core-simd-lstm\.wasm\.js'/);
  assert.doesNotMatch(app + ocr, /sendBeacon|google-analytics|googletagmanager|fetch\s*\(/i);
});

test("CSV 입력은 지원 열을 검증하고 실패를 사용자에게 알린다", () => {
  assert.match(app, /const supported = new Set/);
  assert.match(app, /지원하는 열 이름을 찾지 못했습니다/);
  assert.match(app, /CSV를 불러오지 못했습니다/);
  assert.match(app, /achievementRate/);
  assert.match(app, /passFail/);
});

test("간편 입력 필드 ID와 계산 코드가 일치한다", () => {
  const html = readFileSync(path.resolve(__dirname, "../dist/index.html"), "utf8");
  for (const id of ["quickAll", "quickCore", "quickAch", "quickAbs"]) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
    assert.match(app, new RegExp(`#${id}`));
  }
  assert.doesNotMatch(app, /#quickMajor/);
});

test("선택한 전형은 모집단위·학생부 배점·최저점과 실질점수를 보여준다", () => {
  assert.match(app, /모집단위/);
  assert.match(app, /학생부 정량 반영/);
  assert.match(app, /점수 범위/);
  assert.match(app, /실질/);
  assert.match(app, /Math\.round\(\(maximum - minimum\) \* 100\) \/ 100/);
});

test("세부 기준 미공개 전형은 시행계획의 한계와 최종 모집요강 확인 시점을 설명한다", () => {
  assert.match(app, /시행계획에 세부 산출 기준이 없어 현재 확정 계산할 수 없습니다/);
  assert.match(app, /2028학년도 최종 모집요강을 공개하면 반드시 다시 확인하세요/);
  assert.match(app, /석차등급 환산표, 진로선택·성취도 반영법, 출결 환산표/);
  assert.match(app, /rule\.verificationStatus/);
});

test("현재 학기 입력 범위와 나이스 성적 파일 준비 방법을 안내한다", () => {
  const html = readFileSync(path.resolve(__dirname, "../dist/index.html"), "utf8");
  assert.match(html, /현재 나온 학기까지만 입력해도 됩니다/);
  assert.match(html, /성적 → 성적조회 → 개인별성적일람표조회/);
  assert.match(html, /나이스 엑셀 불러오기/);
  assert.match(app, /현재 학기 기준 참고용 결과/);
  assert.match(app, /이후 학기 성적이나 3학년 1학기 성적을 임의로 예측해 넣지 않았습니다/);
});

test("대학명·지역·캠퍼스를 서로 다른 조건으로 검색한다", () => {
  const html = readFileSync(path.resolve(__dirname, "../dist/index.html"), "utf8");
  assert.match(html, /id="search"[^>]*placeholder="예: 서울대학교"/);
  assert.match(html, /id="regionFilter"/);
  assert.match(html, /id="campusFilter"/);
  assert.match(app, /u\.name\.includes\(q\)/);
  assert.match(app, /u\.region === region/);
  assert.match(app, /u\.campus === campus/);
});

test("모바일 화면은 결과·전형 카드와 입력 도구를 한 열로 재배치한다", () => {
  assert.match(styles, /@media \(max-width: 760px\)/);
  assert.match(styles, /\.result-top \{[^}]*flex-direction: column/);
  assert.match(styles, /\.rule-card \{ grid-template-columns: 1fr/);
  assert.match(styles, /\.attendance label \{ max-width: none/);
});

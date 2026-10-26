const test = require("node:test");
const assert = require("node:assert/strict");
require("../dist/neis-parser.js");
const parser = globalThis.NeisParser;

test("나이스 개인성적의 병합 학년·학기와 결합 점수 셀을 해석한다", () => {
  const matrix = [
    ["개인별 성적 조회"],
    ["학년", "학기", "교과", "과목명", "과목구분", "단위수", "원점수/과목평균(표준편차)", "석차등급", "성취도(수강자수)"],
    ["1", "1", "국어", "공통국어1", "공통과목", "4", "98/75.2(12.3)", "2", ""],
    ["", "", "과학", "과학탐구실험", "진로선택", "1", "95/81.5(9.4)", "", "A(123)"],
  ];
  const result = parser.parseMatrix(matrix, "개인성적");
  assert.equal(result.rows.length, 2);
  assert.deepEqual(
    [result.rows[0].grade, result.rows[0].semester, result.rows[0].credits, result.rows[0].rawScore, result.rows[0].mean, result.rows[0].stddev, result.rows[0].rankGrade],
    [1, 1, 4, 98, 75.2, 12.3, 2],
  );
  assert.deepEqual(
    [result.rows[1].grade, result.rows[1].semester, result.rows[1].achievement, result.rows[1].classSize, result.rows[1].type],
    [1, 1, "A", 123, "진로선택"],
  );
});

test("여러 시트의 같은 과목을 중복 추가하지 않는다", () => {
  const matrix = [
    ["학년", "학기", "교과", "과목명", "학점", "석차등급"],
    [1, 2, "수학", "공통수학2", 4, 1],
  ];
  const result = parser.parseSheets([{ name: "1학년", matrix }, { name: "전체", matrix }]);
  assert.equal(result.rows.length, 1);
});

test("성적 표 머리글이 없으면 임의 추정하지 않고 경고한다", () => {
  const result = parser.parseMatrix([["학생명", "홍길동"], ["학교", "고등학교"]], "기본정보");
  assert.equal(result.rows.length, 0);
  assert.match(result.warning, /머리글을 찾지 못했습니다/);
});

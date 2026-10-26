const test = require("node:test");
const assert = require("node:assert/strict");
global.window = global;
require("../dist/data/score-rules.js");
const calc = require("../dist/calculator.js");
const rule = global.SCORE_RULES.find((r) => r.id === "kyonggi-gyogwa-2028");
test("경기대 교과평균을 90점으로 환산한 뒤 출결 10점을 합산한다", () => {
  const out = calc.calculate(
    rule,
    [
      {
        grade: 1,
        semester: 1,
        subject: "국어",
        name: "국어",
        credits: 4,
        rankGrade: 2,
      },
      {
        grade: 2,
        semester: 1,
        subject: "수학",
        name: "수학",
        credits: 3,
        rankGrade: 3,
      },
    ],
    { unexcusedAbsence: 0 },
  );
  assert.equal(out.rawAverage, 94.571);
  assert.equal(out.academicScore, 85.113);
  assert.equal(out.total, 95.113);
  assert.equal(out.maximumScore, 100);
});
test("경기대 미인정 지각·조퇴·결과 3회를 결석 1일로 버림 환산한다", () => {
  const a = calc.attendanceScore(
    { unexcusedAbsence: 1, tardy: 2, early: 1, missingClass: 1 },
    rule.attendanceRule,
  );
  assert.deepEqual(a, { total: 2, score: 10 });
});
test("경기대 학교폭력 4호는 5점 감점하고 8호는 부적격 처리한다", () => {
  const course = [
    {
      grade: 1,
      semester: 1,
      subject: "국어",
      name: "국어",
      credits: 3,
      rankGrade: 1,
    },
  ];
  const four = calc.calculate(rule, course, { schoolViolenceLevel: 4 });
  const eight = calc.calculate(rule, course, { schoolViolenceLevel: 8 });
  assert.equal(four.total, 95);
  assert.equal(four.schoolViolence.deduction, 5);
  assert.equal(eight.disqualified, true);
  assert.equal(eight.total, null);
});
test("3학년 2학기 과목은 3-1 반영 전형에서 제외한다", () => {
  const out = calc.calculate(
    rule,
    [
      {
        grade: 3,
        semester: 2,
        subject: "국어",
        name: "미반영",
        credits: 4,
        rankGrade: 1,
      },
      {
        grade: 3,
        semester: 1,
        subject: "국어",
        name: "반영",
        credits: 4,
        rankGrade: 2,
      },
    ],
    {},
  );
  assert.equal(out.selected.length, 1);
  assert.equal(out.selected[0].name, "반영");
  assert.equal(out.excludedDetails.length, 1);
  assert.match(out.excludedDetails[0].reason, /반영 학기/);
});
test("P/F 여부를 성취도와 별도 입력해도 제외 규칙을 적용한다", () => {
  const pfRule = {
    status: "계산 가능",
    semesters: { through: "3-1" },
    includedSubjects: ["전 교과"],
    selectionRule: { type: "all" },
    excludePassFail: true,
    gradeConversionTable: { 1: 100, 2: 90, 3: 80, 4: 70, 5: 60 },
    maximumScore: 100,
  };
  const out = calc.calculate(
    pfRule,
    [
      { grade: 1, semester: 1, subject: "기타", name: "창체", credits: 1, passFail: "P" },
      { grade: 1, semester: 1, subject: "국어", name: "국어", credits: 3, rankGrade: 1 },
    ],
    {},
  );
  assert.equal(out.selected.length, 1);
  assert.equal(out.selected[0].name, "국어");
  assert.match(out.excludedDetails[0].reason, /P\/F/);
});
test("경기대 인문계열은 과학과 예술 교과를 제외한다", () => {
  const out = calc.calculate(
    rule,
    [
      {
        grade: 1,
        semester: 1,
        subject: "국어",
        name: "반영",
        credits: 3,
        rankGrade: 3,
      },
      {
        grade: 1,
        semester: 1,
        subject: "과학",
        name: "미반영 과학",
        credits: 3,
        rankGrade: 1,
      },
      {
        grade: 1,
        semester: 1,
        subject: "예술",
        name: "미반영 예술",
        credits: 3,
        rankGrade: 1,
      },
    ],
    {},
  );
  assert.deepEqual(
    out.selected.map((x) => x.name),
    ["반영"],
  );
});
test("서원대는 국·수·영 6과목과 나머지 반영교과 6과목을 중복 없이 선정한다", () => {
  const seowon = global.SCORE_RULES.find((r) => r.id === "seowon-top12-2028");
  const data = [...Array(7)]
    .map((_, i) => ({
      grade: 1,
      semester: (i % 2) + 1,
      subject: ["국어", "수학", "영어"][i % 3],
      name: `핵심${i}`,
      rankGrade: i < 6 ? 1 : 2,
    }))
    .concat(
      [...Array(6)].map((_, i) => ({
        grade: 2,
        semester: (i % 2) + 1,
        subject: i % 2 ? "사회" : "과학",
        name: `탐구${i}`,
        rankGrade: 2,
      })),
    );
  const out = calc.calculate(seowon, data, {});
  assert.equal(out.selected.length, 12);
  assert.equal(
    new Set(out.selected.filter((x) => !x.synthetic).map((x) => x.name)).size,
    12,
  );
  assert.equal(out.maximumScore, 1000);
});
test("서원대 반영과목이 부족하면 부족 과목에 최저 5점을 부여한다", () => {
  const seowon = global.SCORE_RULES.find((r) => r.id === "seowon-top12-2028");
  const out = calc.calculate(
    seowon,
    [{ grade: 1, semester: 1, subject: "국어", name: "국어", rankGrade: 1 }],
    {},
  );
  assert.equal(out.selected.filter((x) => x.synthetic).length, 11);
  assert.equal(out.total, 541.6);
});
test("환산표가 미공개인 한동대는 임의 계산하지 않는다", () => {
  const handong = global.SCORE_RULES.find(
    (r) => r.id === "handong-gimpact-2028",
  );
  assert.equal(
    calc.calculate(handong, [{ grade: 1, semester: 1, rankGrade: 1 }], {})
      .blocked,
    true,
  );
});
test("한동대 G-Impact와 G-Challenge는 서로 다른 반영과목을 보존하되 미공개 환산표를 추정하지 않는다",()=>{
  const impact=global.SCORE_RULES.find((r)=>r.id==="handong-gimpact-2028");
  const challenge=global.SCORE_RULES.find((r)=>r.id==="handong-gchallenge-2028");
  assert.equal(impact.selectionRule.type,"topNWithTypeCap");
  assert.equal(impact.selectionRule.typeCap,2);
  assert.equal(impact.minimumSemesters,5);
  assert.deepEqual(impact.schoolViolenceRule.disqualifying,[4,5,6,7,8,9]);
  assert.deepEqual(challenge.includedSubjects,["영어","제2외국어/한문"]);
  assert.equal(challenge.selectionRule.count,5);
  assert.equal(calc.calculate(impact,[],{}).blocked,true);
  assert.equal(calc.calculate(challenge,[],{}).blocked,true);
});
test("국립부경대는 공개된 출결표와 2028 미공개 교과 산출요소를 구분한다",()=>{
  const rule=global.SCORE_RULES.find((r)=>r.id==="pknu-gyogwa-2028");
  assert.deepEqual(rule.excludedCourseTypes,["융합선택"]);
  assert.equal(rule.attendanceStatus,"반영");
  assert.equal(calc.attendanceTotal({unexcusedAbsence:2,tardy:3,early:3,missingClass:3},rule.attendanceRule),5);
  assert.equal(calc.attendanceScore({unexcusedAbsence:2,tardy:3,early:3,missingClass:3},rule.attendanceRule).score,94);
  assert.equal(calc.calculate(rule,[],{}).blocked,true);
});
test("한국기술교육대 자연계열은 이수단위 가중 평균을 계산하고 융합선택을 제외한다", () => {
  const k = global.SCORE_RULES.find(
    (r) => r.id === "koreatech-general-natural-2028",
  );
  const out = calc.calculate(
    k,
    [
      {
        grade: 1,
        semester: 1,
        subject: "수학",
        name: "수학",
        type: "공통과목",
        credits: 4,
        rankGrade: 2,
      },
      {
        grade: 1,
        semester: 1,
        subject: "과학",
        name: "과학",
        type: "진로선택",
        credits: 2,
        achievement: "A",
      },
      {
        grade: 1,
        semester: 1,
        subject: "과학",
        name: "융합과학",
        type: "융합선택",
        credits: 3,
        rankGrade: 1,
      },
    ],
    {},
  );
  assert.equal(out.total, 96.666);
  assert.deepEqual(
    out.selected.map((x) => x.name),
    ["과학", "수학"],
  );
});
test("경남대는 상위 15과목과 부족 과목 보정 후 1500점 척도로 환산한다", () => {
  const k = global.SCORE_RULES.find(
    (r) => r.id === "kyungnam-gyogwa-1500-2028",
  );
  const data = [...Array(12)]
    .map((_, i) => ({
      grade: i < 6 ? 1 : 2,
      semester: (i % 2) + 1,
      subject: ["국어", "수학", "영어", "사회", "과학", "한국사"][i % 6],
      name: `일반${i}`,
      type: "일반선택",
      rankGrade: i < 6 ? 1 : 2,
    }))
    .concat([
      {
        grade: 2,
        semester: 1,
        subject: "과학",
        name: "진로A",
        type: "진로선택",
        rankGrade: 1,
      },
      {
        grade: 2,
        semester: 1,
        subject: "사회",
        name: "융합A",
        type: "융합선택",
        rankGrade: 1,
      },
      {
        grade: 2,
        semester: 1,
        subject: "과학",
        name: "진로제외",
        type: "진로선택",
        rankGrade: 1,
      },
    ]);
  const out = calc.calculate(k, data, {});
  assert.equal(out.selected.length, 15);
  assert.equal(
    out.selected.filter((x) => ["진로선택", "융합선택"].includes(x.type))
      .length,
    2,
  );
  assert.equal(out.selected.filter((x) => x.synthetic).length, 1);
  assert.equal(out.total, 1489.92);
});
test("국립금오공대 공학계열은 교과별 상위 4과목과 교과 가중치를 적용한다", () => {
  const k = global.SCORE_RULES.find((r) => r.id === "kumoh-engineering-2028");
  const data = [...Array(5)]
    .map((_, i) => ({
      grade: 1,
      semester: 1,
      subject: "국어",
      name: `국어${i}`,
      type: "일반선택",
      credits: 2,
      rankGrade: i + 1 > 5 ? 5 : i + 1,
    }))
    .concat([
      {
        grade: 1,
        semester: 1,
        subject: "수학",
        name: "수학",
        type: "일반선택",
        credits: 3,
        rankGrade: 1,
      },
      {
        grade: 1,
        semester: 1,
        subject: "과학",
        name: "융합과학",
        type: "융합선택",
        credits: 3,
        rankGrade: 1,
      },
    ]);
  const out = calc.calculate(k, data, {});
  assert.equal(out.selected.filter((x) => x.subject === "국어").length, 4);
  assert.equal(
    out.selected.some((x) => x.name === "융합과학"),
    false,
  );
  assert.equal(out.total, 95.044);
});
test("가톨릭관동대는 등급·성취도 Zone과 출결 및 학교폭력을 함께 반영한다", () => {
  const k = global.SCORE_RULES.find((r) => r.id === "cku-general-units-2028");
  const data = [
    {
      grade: 1,
      semester: 1,
      subject: "국어",
      name: "국어",
      type: "공통과목",
      credits: 3,
      rankGrade: 1,
      achievement: "C",
    },
    {
      grade: 1,
      semester: 1,
      subject: "영어",
      name: "영어",
      type: "일반선택",
      credits: 2,
      rankGrade: 2,
      achievement: "B",
    },
    {
      grade: 2,
      semester: 1,
      subject: "과학",
      name: "진로",
      type: "진로선택",
      credits: 2,
      achievement: "A",
    },
  ];
  const out = calc.calculate(k, data, {
    unexcusedAbsence: 4,
    tardy: 20,
    schoolViolenceLevel: 4,
  });
  assert.equal(out.selected[0].convertedScore, 1000);
  assert.equal(out.attendance.total, 4);
  assert.equal(out.attendance.score, 97);
  assert.equal(out.schoolViolence.deduction, 50);
  assert.equal(out.total, 913.056);
});
test("창신대는 상위 12과목과 연속형 출결점수 및 출결 학교폭력 감점을 계산한다", () => {
  const k = global.SCORE_RULES.find((r) => r.id === "changshin-gyogwa100-2028");
  const data = [...Array(12)].map((_, i) => ({
    grade: 1,
    semester: 1,
    subject: ["국어", "수학", "영어", "사회", "과학"][i % 5],
    name: `과목${i}`,
    type: "일반선택",
    rankGrade: i < 6 ? 1 : 2,
  }));
  const out = calc.calculate(k, data, {
    unexcusedAbsence: 2,
    tardy: 4,
    early: 1,
    schoolViolenceLevel: 1,
  });
  assert.equal(out.attendance.total, 3);
  assert.equal(out.attendance.score, 92.5);
  assert.equal(out.schoolViolence.deduction, 18.5);
  assert.equal(out.total, 964);
});
test("가톨릭꽃동네대는 학년별 4·4·2과목과 이수단위 구간점수를 적용한다", () => {
  const k = global.SCORE_RULES.find((r) => r.id === "kkot-gyogwa100-2028");
  const data = [...Array(10)].map((_, i) => ({
    grade: i < 4 ? 1 : i < 8 ? 2 : 3,
    semester: 1,
    subject: ["국어", "영어", "수학", "사회", "과학"][i % 5],
    name: `과목${i}`,
    type: "일반선택",
    credits: 4,
    rankGrade: 1,
    achievement: "A",
  }));
  const out = calc.calculate(k, data, {});
  assert.equal(out.selected.length, 10);
  assert.equal(out.rawAverage, 1000);
  assert.equal(out.total, 1000);
});
test("가톨릭꽃동네대 부족 과목은 석차·성취도 최저점으로 보정한다", () => {
  const k = global.SCORE_RULES.find((r) => r.id === "kkot-gyogwa100-2028");
  const out = calc.calculate(
    k,
    [
      {
        grade: 1,
        semester: 1,
        subject: "국어",
        name: "국어",
        type: "공통과목",
        credits: 4,
        rankGrade: 1,
        achievement: "A",
      },
    ],
    {},
  );
  assert.equal(out.selected.filter((x) => x.synthetic).length, 9);
  assert.equal(out.total, 140);
});
test("목포가톨릭대는 학년별 지정 교과와 탐구 최우수 과목을 동일비율로 환산한다", () => {
  const k = global.SCORE_RULES.find(
    (r) => r.id === "mokpo-catholic-attendance-2028",
  );
  const data = [
    ["국어", 1],
    ["수학", 2],
    ["영어", 1],
    ["사회", 3],
    ["과학", 2],
  ]
    .map(([subject, rankGrade]) => ({
      grade: 1,
      semester: 1,
      subject,
      name: `1-${subject}`,
      credits: 2,
      rankGrade,
    }))
    .concat(
      [2, 3].flatMap((grade) => [
        {
          grade,
          semester: 1,
          subject: "국어",
          name: `${grade}-국어`,
          credits: 3,
          rankGrade: 2,
        },
        {
          grade,
          semester: 1,
          subject: "영어",
          name: `${grade}-영어`,
          credits: 2,
          rankGrade: 1,
        },
        {
          grade,
          semester: 1,
          subject: "사회",
          name: `${grade}-사회`,
          credits: 2,
          rankGrade: 3,
        },
        {
          grade,
          semester: 1,
          subject: "과학",
          name: `${grade}-과학`,
          credits: 2,
          rankGrade: 1,
        },
      ]),
    );
  const out = calc.calculate(k, data, {
    unexcusedAbsence: 2,
    tardy: 3,
    schoolViolenceLevel: 2,
  });
  assert.equal(
    out.selected.filter((x) => x.subject === "과학" && x.grade > 1).length,
    2,
  );
  assert.equal(out.attendance.total, 3);
  assert.equal(out.attendance.score, 8);
  assert.equal(out.schoolViolence.deduction, 2);
  assert.equal(out.total, 88.242);
});
test("성신여대는 공통 전 과목·선택 상위 10과목과 성취분포 감점·출결을 반영한다", () => {
  const k = global.SCORE_RULES.find(
    (r) => r.id === "sungshin-regional-humanities-2028",
  );
  const common = [
    {
      grade: 1,
      semester: 1,
      subject: "국어",
      name: "공통국어",
      type: "공통과목",
      credits: 2,
      rankGrade: 1,
      achievement: "A",
      achievementRate: 50,
      classSize: 25,
    },
    {
      grade: 1,
      semester: 1,
      subject: "영어",
      name: "공통영어",
      type: "공통과목",
      credits: 2,
      rankGrade: 1,
      achievement: "A",
      achievementRatio: "A:30",
      classSize: 25,
    },
  ];
  const choices = [...Array(11)].map((_, i) => ({
    grade: 2,
    semester: 1,
    subject: i % 2 ? "수학" : "사회",
    name: `선택${i}`,
    type: "일반선택",
    credits: 2,
    rankGrade: i === 10 ? 5 : 2,
    achievement: "B",
    achievementRatio: "B:40",
    classSize: i === 10 ? 1 : 20,
  }));
  const out = calc.calculate(k, common.concat(choices), {
    unexcusedAbsence: 2,
  });
  assert.equal(out.selected.length, 12);
  assert.equal(
    out.selected.some((x) => x.name === "선택10"),
    false,
  );
  assert.equal(
    out.selected.find((x) => x.name === "공통국어").convertedScore,
    99.9,
  );
  assert.equal(out.attendance.score, 9.9);
  assert.equal(out.total, 99.398);
});
test("성신여대는 수강자 수나 성취도 분포비율이 빠지면 계산을 중단한다", () => {
  const k = global.SCORE_RULES.find(
    (r) => r.id === "sungshin-regional-humanities-2028",
  );
  const base = {
    grade: 1,
    semester: 1,
    subject: "국어",
    name: "국어",
    type: "공통과목",
    credits: 2,
    rankGrade: 1,
    achievement: "A",
  };
  assert.equal(calc.calculate(k, [base], {}).blocked, true);
  assert.match(calc.calculate(k, [base], {}).missing[0], /수강자 수/);
  assert.match(
    calc.calculate(k, [{ ...base, classSize: 20 }], {}).missing[0],
    /성취비율/,
  );
});
test("충북대는 성취도 누적분포로 등급을 만들고 동일 과목의 학기 점수를 먼저 평균한다", () => {
  const k = global.SCORE_RULES.find((r) => r.id === "chungbuk-gyogwa-2028");
  const data = [
    {
      grade: 1,
      semester: 1,
      subject: "국어",
      name: "공통국어",
      type: "공통과목",
      credits: 2,
      rankGrade: 1,
      achievement: "B",
    },
    {
      grade: 1,
      semester: 2,
      subject: "국어",
      name: "공통국어",
      type: "공통과목",
      credits: 4,
      rankGrade: 2,
      achievement: "B",
    },
    {
      grade: 2,
      semester: 1,
      subject: "영어",
      name: "영어독해",
      type: "진로선택",
      credits: 2,
      achievement: "B",
      achievementRatio: "A:10,B:10,C:20,D:30,E:30",
    },
  ];
  const out = calc.calculate(k, data, { schoolViolenceLevel: 1 });
  assert.equal(
    out.selected.find((x) => x.name === "영어독해").derivedGrade,
    "2",
  );
  assert.equal(
    out.calculationCourses.find((x) => x.name === "공통국어").convertedScore,
    9,
  );
  assert.equal(out.academicScore, 75.5);
  assert.equal(out.schoolViolence.deduction, 4);
  assert.equal(out.total, 71.5);
  assert.equal(out.excludedDetails.length, 0);
});
test("충북대 석차등급 미기재 B~E 과목은 전체 성취도 분포가 없으면 계산하지 않는다", () => {
  const k = global.SCORE_RULES.find((r) => r.id === "chungbuk-gyogwa-2028");
  const out = calc.calculate(
    k,
    [
      {
        grade: 1,
        semester: 1,
        subject: "국어",
        name: "진로국어",
        type: "진로선택",
        credits: 2,
        achievement: "B",
        achievementRatio: "B:20",
      },
    ],
    {},
  );
  assert.equal(out.blocked, true);
  assert.match(out.missing[0], /A~E/);
});
test("숭실대 교과우수자는 본교 자체 환산점수 산식 미공개로 계산을 차단한다", () => {
  const k = global.SCORE_RULES.find(
    (r) => r.id === "soongsil-gyogwa-excellent-pending-2028",
  );
  const out = calc.calculate(k, [
    {
      grade: 1,
      semester: 1,
      subject: "국어",
      name: "국어",
      credits: 3,
      rankGrade: 1,
    },
  ]);
  assert.equal(out.blocked, true);
  assert.equal(out.status, "모집요강 확인 필요");
  assert.match(k.formula, /상세 산식.*미공개/);
});
test("제주대는 성취분포 기반 상대점수와 융합선택 상위 3과목을 환산한다", () => {
  const k = global.SCORE_RULES.find((r) => r.id === "jeju-gyogwa-2028");
  const ratios = "A:11.2,B:24.3,C:31.7,D:24.3,E:8.5";
  const data = [
    {
      grade: 1,
      semester: 1,
      subject: "국어",
      name: "문학",
      type: "공통과목",
      credits: 3,
      rawScore: 39,
      mean: 70,
      achievement: "E",
      achievementRatio: ratios,
    },
    ...["A", "C", "E", "D"].map((achievement, i) => ({
      grade: 2,
      semester: 1,
      subject: "과학",
      name: `융합과학${i + 1}`,
      type: "융합선택",
      credits: 1,
      achievement,
    })),
  ];
  const out = calc.calculate(k, data, { schoolViolenceLevel: 4 });
  const literature = out.selected.find((c) => c.name === "문학");
  assert.equal(literature.relativeScore, -2.36);
  assert.equal(literature.convertedScore, 840);
  assert.equal(out.selected.filter((c) => c.type === "융합선택").length, 3);
  assert.equal(out.rawAverage, 910);
  assert.equal(out.schoolViolence.deduction, 100);
  assert.equal(out.total, 810);
});
test("제주대는 상대점수 계산에 필요한 분포 입력이 빠지면 계산을 중단한다", () => {
  const k = global.SCORE_RULES.find((r) => r.id === "jeju-gyogwa-2028");
  const out = calc.calculate(k, [
    {
      grade: 1,
      semester: 1,
      subject: "국어",
      name: "국어",
      type: "공통과목",
      credits: 3,
      rawScore: 90,
      mean: 75,
    },
  ]);
  assert.equal(out.blocked, true);
  assert.match(out.missing[0], /분포비율/);
});
test("대진대 교과전형은 상위 15과목의 등급평균 30단계·출결·학교폭력을 계산한다", () => {
  const k = global.SCORE_RULES.find(
    (r) => r.id === "daejin-gyogwa-general-900-2028",
  );
  const data = [...Array(15)].map((_, i) => ({
    grade: i < 5 ? 1 : i < 10 ? 2 : 3,
    semester: 1,
    subject: i % 3 === 0 ? "국어" : i % 3 === 1 ? "수학" : "예술",
    name: `과목${i + 1}`,
    type: "공통과목",
    credits: 7,
    rankGrade: 2,
  }));
  const out = calc.calculate(k, data, {
    unexcusedAbsence: 4,
    schoolViolenceLevel: 2,
  });
  assert.equal(out.selected.length, 15);
  assert.equal(out.rawAverage, 2);
  assert.equal(out.academicScore, 855);
  assert.equal(out.attendance.score, 90);
  assert.equal(out.schoolViolence.deduction, 20);
  assert.equal(out.total, 925);
});
test("대진대는 보통교과 이수학점 100 이하이면 교과 환산점수의 90%를 적용한다", () => {
  const k = global.SCORE_RULES.find(
    (r) => r.id === "daejin-gyogwa-five-subject-900-2028",
  );
  const data = [...Array(15)].map((_, i) => ({
    grade: i < 5 ? 1 : i < 10 ? 2 : 3,
    semester: 1,
    subject: i % 2 ? "국어" : "과학",
    name: `과목${i + 1}`,
    type: "일반선택",
    credits: 4,
    rankGrade: 2,
  }));
  const out = calc.calculate(k, data, { unexcusedAbsence: 0 });
  assert.equal(out.academicScore, 769.5);
  assert.equal(out.attendance.score, 100);
  assert.equal(out.total, 869.5);
});
test("대진대 학생부우수자는 면접을 제외한 학생부 700점 부분만 계산한다", () => {
  const k = global.SCORE_RULES.find(
    (r) => r.id === "daejin-gyogwa-excellent-component-2028",
  );
  const data = [...Array(15)].map((_, i) => ({
    grade: 1,
    semester: 1,
    subject: "국어",
    name: `국어${i + 1}`,
    type: "공통과목",
    credits: 7,
    rankGrade: 1,
  }));
  const out = calc.calculate(k, data, {});
  assert.equal(out.status, "일부 계산 가능");
  assert.equal(out.maximumScore, 700);
  assert.equal(out.academicScore, 600);
  assert.equal(out.attendance.score, 100);
  assert.equal(out.total, 700);
});
test("삼육대 학교장추천 일반학과는 전 반영교과의 이수학점 가중점수를 1000점으로 환산한다", () => {
  const k = global.SCORE_RULES.find(
    (r) => r.id === "sahmyook-recommendation-general-2028",
  );
  const data = [
    {
      grade: 1,
      semester: 1,
      subject: "국어",
      name: "국어",
      type: "공통과목",
      credits: 4,
      rankGrade: 1,
    },
    {
      grade: 2,
      semester: 1,
      subject: "과학",
      name: "과학",
      type: "진로선택",
      credits: 2,
      achievement: "B",
    },
  ];
  const out = calc.calculate(k, data, { schoolViolenceLevel: 2 });
  assert.equal(out.rawAverage, 99.666);
  assert.equal(out.academicScore, 996.66);
  assert.equal(out.schoolViolence.deduction, 5);
  assert.equal(out.total, 991.66);
  assert.equal(out.maximumScore, 1000);
});
test("국립창원대는 학년별 교과 범위와 진로선택 상위 3과목을 적용한다", () => {
  const k = global.SCORE_RULES.find(
    (r) => r.id === "changwon-main-humanities-2028",
  );
  const data = [
    {
      grade: 1,
      semester: 1,
      subject: "과학",
      name: "1학년과학",
      type: "일반선택",
      credits: 2,
      rankGrade: 1,
    },
    {
      grade: 2,
      semester: 1,
      subject: "과학",
      name: "2학년과학",
      type: "일반선택",
      credits: 2,
      rankGrade: 1,
    },
    ...["A", "B", "C", "C"].map((achievement, i) => ({
      grade: 2,
      semester: 1,
      subject: "국어",
      name: `진로${i}`,
      type: "진로선택",
      credits: 2,
      achievement,
    })),
  ];
  const out = calc.calculate(k, data, { schoolViolenceLevel: 1 });
  assert.equal(
    out.selected.some((x) => x.name === "1학년과학"),
    true,
  );
  assert.equal(
    out.selected.some((x) => x.name === "2학년과학"),
    false,
  );
  assert.equal(out.selected.filter((x) => x.type === "진로선택").length, 3);
  assert.equal(out.schoolViolence.deduction, 10);
});
test("국립창원대는 표준점수와 중간등위 누적비율을 5등급으로 환산한다", () => {
  const k = global.SCORE_RULES.find(
    (r) => r.id === "changwon-geochang-namhae-all-2028",
  );
  const data = [
    {
      grade: 1,
      semester: 1,
      subject: "국어",
      name: "표준점수",
      type: "일반선택",
      credits: 2,
      rawScore: 95,
      mean: 82.1,
      standardDeviation: 12.1,
    },
    {
      grade: 1,
      semester: 1,
      subject: "수학",
      name: "석차",
      type: "일반선택",
      credits: 2,
      rank: 20,
      tiedRank: 8,
      classSize: 500,
    },
  ];
  const out = calc.calculate(k, data, {});
  assert.equal(
    out.selected.find((x) => x.name === "표준점수").derivedGrade,
    "2",
  );
  assert.equal(out.selected.find((x) => x.name === "석차").derivedGrade, "1");
  assert.equal(out.total, 988.5);
});
test("국민대 2028 졸업예정자는 공통·일반 85%와 진로선택 15%를 분리 가중한다", () => {
  const k = global.SCORE_RULES.find((r) => r.id === "kookmin-2028-humanities");
  const data = [
    {
      grade: 1,
      semester: 1,
      subject: "국어",
      name: "공통국어",
      type: "공통과목",
      credits: 4,
      rankGrade: 2,
    },
    {
      grade: 2,
      semester: 1,
      subject: "사회",
      name: "일반사회",
      type: "일반선택",
      credits: 2,
      rankGrade: 3,
    },
    {
      grade: 2,
      semester: 1,
      subject: "사회",
      name: "진로사회",
      type: "진로선택",
      credits: 2,
      rankGrade: 1,
    },
  ];
  const out = calc.calculate(k, data, { schoolViolenceLevel: 4 });
  assert.equal(out.rawAverage, 95.466);
  assert.equal(out.academicScore, 954.66);
  assert.equal(out.schoolViolence.deduction, 10);
  assert.equal(out.total, 944.66);
});
test("국민대는 진로선택 미이수 시 공통·일반선택 평균만으로 1000점 환산한다", () => {
  const k = global.SCORE_RULES.find((r) => r.id === "kookmin-2028-natural");
  const out = calc.calculate(
    k,
    [
      {
        grade: 1,
        semester: 1,
        subject: "수학",
        name: "수학",
        type: "공통과목",
        credits: 3,
        rankGrade: 1,
      },
    ],
    {},
  );
  assert.equal(out.total, 1000);
});
test("총신대는 2028 환산표와 출결표가 미공개이므로 임의 계산하지 않는다", () => {
  const k = global.SCORE_RULES.find(
    (r) => r.id === "chongshin-gyogwa-pending-2028",
  );
  const out = calc.calculate(
    k,
    [
      {
        grade: 1,
        semester: 1,
        subject: "국어",
        name: "국어",
        credits: 3,
        rankGrade: 1,
        achievement: "A",
      },
    ],
    {},
  );
  assert.equal(out.blocked, true);
  assert.equal(out.status, "상세 기준 미공개");
});
test("한남대 일반 교과전형은 국영수 학점 가감점표가 미공개이므로 최종 계산을 차단한다", () => {
  const k = global.SCORE_RULES.find(
    (r) => r.id === "hannam-gyogwa-pending-2028",
  );
  const out = calc.calculate(
    k,
    [
      {
        grade: 1,
        semester: 1,
        subject: "국어",
        name: "국어",
        credits: 3,
        rankGrade: 1,
      },
    ],
    { unexcusedAbsence: 0 },
  );
  assert.equal(out.blocked, true);
  assert.equal(out.status, "모집요강 확인 필요");
});
test("한남대 어학인재는 공개된 교과 500점과 학교폭력 감점만 계산한다", () => {
  const rule = global.SCORE_RULES.find(
    (item) => item.id === "hannam-language-talent-2028",
  );
  const ranked = Array.from({ length: 18 }, (_, index) => ({
    grade: index < 6 ? 1 : index < 12 ? 2 : 3,
    semester: 1,
    subject: ["국어", "수학", "영어", "사회", "과학"][index % 5],
    name: `석차과목${index + 1}`,
    type: "일반선택",
    credits: 1,
    rankGrade: index < 9 ? 1 : 2,
  }));
  const out = calc.calculate(
    rule,
    ranked.concat([
      { grade: 2, semester: 1, subject: "영어", name: "영어 발표", type: "진로선택", credits: 1, achievement: "A" },
      { grade: 3, semester: 1, subject: "사회", name: "사회 탐구", type: "진로선택", credits: 1, achievement: "A" },
    ]),
    { schoolViolenceLevel: 4 },
  );
  assert.equal(out.blocked, false);
  assert.equal(out.status, "일부 계산 가능");
  assert.equal(out.selected.length, 20);
  assert.equal(out.academicScore, 486.5);
  assert.equal(out.total, 386.5);
  assert.equal(out.maximumScore, 1000);
  assert.equal(rule.componentMaximumScore, 500);
});
test("세종대 지역균형은 2028 변환점수표가 미공개이므로 계산을 차단한다", () => {
  const k = global.SCORE_RULES.find(
    (r) => r.id === "sejong-regional-pending-2028",
  );
  const out = calc.calculate(
    k,
    [
      {
        grade: 1,
        semester: 1,
        subject: "국어",
        name: "국어",
        type: "공통과목",
        credits: 3,
        rankGrade: 1,
      },
    ],
    {},
  );
  assert.equal(out.blocked, true);
  assert.equal(out.status, "모집요강 확인 필요");
});
test("대구대는 상위 12과목, 융합선택 제한, 출결과 학교폭력 감점을 반영한다", () => {
  const k = global.SCORE_RULES.find(
    (r) => r.id === "daegu-gyogwa-general-2028",
  );
  const data = [...Array(9)]
    .map((_, i) => ({
      grade: i < 6 ? 1 : 2,
      semester: 1,
      subject: ["국어", "수학", "영어"][i % 3],
      name: `일반${i}`,
      type: "일반선택",
      rankGrade: i < 6 ? 1 : 2,
    }))
    .concat(
      [...Array(4)].map((_, i) => ({
        grade: 2,
        semester: 1,
        subject: i % 2 ? "사회" : "과학",
        name: `융합${i}`,
        type: "융합선택",
        achievement: "A",
      })),
    );
  const out = calc.calculate(k, data, {
    unexcusedAbsence: 3,
    tardy: 30,
    schoolViolenceLevel: 3,
  });
  assert.equal(out.selected.length, 12);
  assert.equal(out.selected.filter((x) => x.type === "융합선택").length, 3);
  assert.equal(out.attendance.total, 3);
  assert.equal(out.attendance.score, 80);
  assert.equal(out.schoolViolence.deduction, 20);
  assert.equal(out.total, 943.125);
});
test("안양대 교과일반전형은 상위 12과목의 이수단위 가중평균과 학교폭력 감점을 적용한다", () => {
  const k = global.SCORE_RULES.find((r) => r.id === "anyang-general-2028");
  const data = [...Array(13)].map((_, i) => ({
    grade: i < 6 ? 1 : 2,
    semester: 1,
    subject: ["국어", "수학", "영어", "사회", "과학"][i % 5],
    name: `과목${i}`,
    credits: i === 0 ? 4 : 2,
    rankGrade: i < 6 ? 1 : i < 12 ? 2 : 5,
  }));
  const out = calc.calculate(k, data, { schoolViolenceLevel: 8 });
  assert.equal(out.selected.length, 12);
  assert.equal(
    out.selected.some((x) => x.rankGrade === 5),
    false,
  );
  assert.equal(out.rawAverage, 97.692);
  assert.equal(out.schoolViolence.deduction, 30);
  assert.equal(out.total, 67.692);
});
test("원광대 2022 개정교육과정은 이수학점 가중 등급평균과 출결을 600점으로 환산한다", () => {
  const k = global.SCORE_RULES.find(
    (r) => r.id === "wonkwang-gyogwa-2022curriculum-2028",
  );
  const data = [
    {
      grade: 1,
      semester: 1,
      subject: "국어",
      name: "국어",
      credits: 4,
      rankGrade: 1,
    },
    {
      grade: 2,
      semester: 1,
      subject: "수학",
      name: "수학",
      credits: 2,
      rankGrade: 3,
    },
  ];
  const out = calc.calculate(k, data, { unexcusedAbsence: 4 });
  assert.equal(out.rawAverage, 1.666);
  assert.equal(out.academicScore, 575.015);
  assert.equal(out.attendance.score, 8);
  assert.equal(out.total, 583.015);
});
test("원광대 학교폭력 1~7호는 세부 감점표가 미공개이므로 해당 입력 시 계산을 중단한다", () => {
  const k = global.SCORE_RULES.find(
    (r) => r.id === "wonkwang-gyogwa-2022curriculum-2028",
  );
  const course = [
    {
      grade: 1,
      semester: 1,
      subject: "국어",
      name: "국어",
      credits: 3,
      rankGrade: 1,
    },
  ];
  assert.equal(
    calc.calculate(k, course, { schoolViolenceLevel: 3 }).blocked,
    true,
  );
  assert.equal(
    calc.calculate(k, course, { schoolViolenceLevel: 8 }).disqualified,
    true,
  );
});
test("한밭대 인문계열은 교과군별 상위과목·동일비율·100학점 가중치와 출결을 적용한다", () => {
  const k = global.SCORE_RULES.find(
    (r) => r.id === "hanbat-gyogwa-humanities-design-2028",
  );
  const data = ["국어", "영어", "수학"]
    .flatMap((subject) =>
      [...Array(4)].map((_, i) => ({
        grade: 1,
        semester: 1,
        subject,
        name: `${subject}${i}`,
        type: "일반선택",
        credits: 6,
        rankGrade: 1,
      })),
    )
    .concat(
      [...Array(6)].map((_, i) => ({
        grade: 2,
        semester: 1,
        subject: i % 2 ? "사회" : "과학",
        name: `탐구${i}`,
        type: "진로선택",
        credits: 5,
        rankGrade: 2,
        achievement: "A",
      })),
    );
  const out = calc.calculate(k, data, {
    unexcusedAbsence: 2,
    schoolViolenceLevel: 4,
  });
  assert.equal(out.selected.length, 18);
  assert.equal(out.rawAverage, 10);
  assert.equal(out.academicScore, 495);
  assert.equal(out.attendance.score, 45);
  assert.equal(out.schoolViolence.deduction, 50);
  assert.equal(out.total, 490);
});
test("충남대는 석차·성취도 합산과 사회과학 융합선택 누적비율을 반영한다", () => {
  const k = global.SCORE_RULES.find(
    (r) => r.id === "chungnam-gyogwa-nonarts-2028",
  );
  const data = [
    {
      grade: 1,
      semester: 1,
      subject: "국어",
      name: "국어",
      type: "공통과목",
      credits: 4,
      rankGrade: 1,
      achievement: "A",
    },
    {
      grade: 2,
      semester: 1,
      subject: "사회",
      name: "융합사회",
      type: "융합선택",
      credits: 2,
      achievement: "B",
      achievementRatio: "A:10,B:20,C:20,D:25,E:25",
    },
  ];
  const out = calc.calculate(k, data, { schoolViolenceLevel: 4 });
  assert.equal(
    out.selected.find((x) => x.name === "융합사회").derivedGrade,
    "3",
  );
  assert.equal(out.rawAverage, 91.666);
  assert.equal(out.schoolViolence.deduction, 30);
  assert.equal(out.total, 61.666);
});
test("상지대 일반학과는 교과별 상위 3과목과 부족 과목·출결·학교폭력을 반영한다", () => {
  const k = global.SCORE_RULES.find(
    (r) => r.id === "sangji-gyogwa-general-2028",
  );
  const data = ["국어", "수학", "영어", "사회"].flatMap((subject) =>
    [1, 2, 3].map((rankGrade, i) => ({
      grade: 1,
      semester: (i % 2) + 1,
      subject,
      name: `${subject}${i + 1}`,
      credits: 2,
      rankGrade,
    })),
  );
  const out = calc.calculate(k, data, {
    unexcusedAbsence: 4,
    tardy: 3,
    schoolViolenceLevel: 4,
  });
  assert.equal(out.selected.length, 15);
  assert.equal(out.selected.filter((x) => x.synthetic).length, 3);
  assert.equal(out.rawAverage, 86.296);
  assert.equal(out.academicScore, 862.96);
  assert.deepEqual(out.attendance, { total: 5, score: -5 });
  assert.equal(out.schoolViolence.deduction, 10);
  assert.equal(out.total, 847.96);
});
test("상지대 간호학과와 한의예과는 서로 다른 환산표·과목 선택을 사용한다", () => {
  const nursing = global.SCORE_RULES.find(
    (r) => r.id === "sangji-gyogwa-nursing-2028",
  );
  const medicine = global.SCORE_RULES.find(
    (r) => r.id === "sangji-gyogwa-oriental-medicine-2028",
  );
  const data = ["국어", "수학", "영어", "사회", "과학"].flatMap((subject) =>
    [1, 2, 3, 4, 5].map((rankGrade, i) => ({
      grade: i < 2 ? 1 : 2,
      semester: (i % 2) + 1,
      subject,
      name: `${subject}${i}`,
      credits: 1,
      rankGrade,
    })),
  );
  const n = calc.calculate(nursing, data, {});
  const m = calc.calculate(medicine, data, { schoolViolenceLevel: 9 });
  assert.equal(n.selected.length, 20);
  assert.equal(n.rawAverage, 78.75);
  assert.equal(m.selected.length, 25);
  assert.equal(m.rawAverage, 64);
  assert.equal(m.status, "부적격");
  assert.equal(m.total, null);
});
test("상명대 서울 고교추천은 전 교과 이수학점 가중점수와 5% 출결을 1000점으로 환산한다", () => {
  const k = global.SCORE_RULES.find(
    (r) => r.id === "sangmyung-seoul-school-recommendation-2028",
  );
  const data = [
    {
      grade: 1,
      semester: 1,
      subject: "국어",
      name: "공통국어",
      type: "공통과목",
      credits: 4,
      rankGrade: 2,
    },
    {
      grade: 2,
      semester: 1,
      subject: "체육",
      name: "운동과 건강",
      type: "체육·예술",
      credits: 2,
      rankGrade: 3,
    },
    {
      grade: 2,
      semester: 2,
      subject: "과학",
      name: "과학탐구",
      type: "진로선택",
      credits: 3,
      achievement: "A",
    },
  ];
  const out = calc.calculate(k, data, { unexcusedAbsence: 2, tardy: 4 });
  assert.equal(out.selected.length, 2);
  assert.equal(out.rawAverage, 94.3333333333);
  assert.equal(out.academicScore, 896.167);
  assert.deepEqual(out.attendance, { total: 3, rawScore: 4, score: 40 });
  assert.equal(out.total, 936.167);
  assert.equal(
    calc.calculate(k, data, { schoolViolenceLevel: 1 }).status,
    "부적격",
  );
});
test("상명대 서울 서해5도전형은 학교폭력 호수별 감점과 9호 부적격을 적용한다", () => {
  const k = global.SCORE_RULES.find(
    (r) => r.id === "sangmyung-seoul-seohae5-2028",
  );
  const data = [
    {
      grade: 1,
      semester: 1,
      subject: "국어",
      name: "국어",
      type: "공통과목",
      credits: 3,
      rankGrade: 1,
    },
  ];
  const out = calc.calculate(k, data, {
    unexcusedAbsence: 0,
    schoolViolenceLevel: 5,
  });
  assert.equal(out.academicScore, 950);
  assert.equal(out.attendance.score, 50);
  assert.equal(out.schoolViolence.deduction, 200);
  assert.equal(out.total, 800);
  assert.equal(
    calc.calculate(k, data, { schoolViolenceLevel: 9 }).status,
    "부적격",
  );
});
test("상명대 천안 학생부교과 전형은 전 교과·출결 5%와 학교폭력 감점을 반영한다", () => {
  const k = global.SCORE_RULES.find(
    (r) => r.id === "sangmyung-cheonan-gyogwa-2028",
  );
  const data = [
    {
      grade: 1,
      semester: 1,
      subject: "국어",
      name: "국어",
      type: "공통과목",
      credits: 3,
      rankGrade: 1,
    },
    {
      grade: 3,
      semester: 1,
      subject: "예술",
      name: "미술",
      type: "체육·예술",
      credits: 1,
      rankGrade: 4,
    },
    {
      grade: 2,
      semester: 1,
      subject: "과학",
      name: "과학",
      type: "진로선택",
      credits: 2,
      achievement: "A",
    },
  ];
  const out = calc.calculate(k, data, {
    unexcusedAbsence: 8,
    schoolViolenceLevel: 7,
  });
  assert.equal(out.selected.length, 2);
  assert.equal(out.rawAverage, 92.5);
  assert.equal(out.academicScore, 878.75);
  assert.equal(out.attendance.score, 20);
  assert.equal(out.schoolViolence.deduction, 300);
  assert.equal(out.total, 598.75);
});
test("신라대 일반 학생부교과는 상위 14과목과 부족 과목 5등급, 학교폭력 비율 감점을 적용한다", () => {
  const rule = global.SCORE_RULES.find(
    (r) => r.id === "silla-gyogwa-general-2028",
  );
  const data = [
    {
      grade: 1,
      semester: 1,
      subject: "국어",
      name: "공통국어",
      type: "공통과목",
      rankGrade: 1,
    },
    {
      grade: 1,
      semester: 2,
      subject: "수학",
      name: "공통수학",
      type: "공통과목",
      rankGrade: 2,
    },
  ];
  const out = calc.calculate(rule, data, { schoolViolenceLevel: 4 });
  assert.equal(out.selected.length, 14);
  assert.equal(out.selected.filter((course) => course.synthetic).length, 12);
  assert.equal(out.academicScore, 792.14);
  assert.equal(out.schoolViolence.deductionPercent, 1);
  assert.equal(out.schoolViolence.deduction, 10);
  assert.equal(out.total, 782.14);
});
test("신라대 성취도·지역인재는 성취도 교과 800점과 미인정 결석 출결 200점을 합산한다", () => {
  const rule = global.SCORE_RULES.find(
    (r) => r.id === "silla-achievement-local-2028",
  );
  const data = Array.from({ length: 14 }, (_, index) => ({
    grade: index < 8 ? 1 : 2,
    semester: (index % 2) + 1,
    subject: ["국어", "수학", "영어", "한국사", "사회", "과학"][index % 6],
    name: `성취도과목${index + 1}`,
    type: "일반선택",
    achievement: "A",
  }));
  const out = calc.calculate(rule, data, {
    unexcusedAbsence: 4,
    tardy: 30,
    schoolViolenceLevel: 6,
  });
  assert.equal(out.academicScore, 800);
  assert.deepEqual(out.attendance, { total: 4, score: 197 });
  assert.equal(out.schoolViolence.deduction, 30);
  assert.equal(out.total, 967);
});
test("예수대 간호학부는 이수학점 가중 교과 900점과 출결 100점 및 학교폭력 감점을 적용한다", () => {
  const rule = global.SCORE_RULES.find(
    (r) => r.id === "jesus-nursing-gyogwa-2028",
  );
  const data = [
    {
      grade: 1,
      semester: 1,
      subject: "국어",
      name: "공통국어",
      type: "공통과목",
      credits: 3,
      rankGrade: 1,
    },
    {
      grade: 1,
      semester: 1,
      subject: "수학",
      name: "공통수학",
      type: "공통과목",
      credits: 1,
      rankGrade: 3,
    },
  ];
  const out = calc.calculate(rule, data, {
    unexcusedAbsence: 3,
    tardy: 3,
    schoolViolenceLevel: 4,
  });
  assert.equal(out.rawAverage, 9.125);
  assert.equal(out.academicScore, 895.179);
  assert.deepEqual(out.attendance, { total: 4, score: 99 });
  assert.equal(out.schoolViolence.deduction, 50);
  assert.equal(out.total, 944.179);
});
test("국립목포대는 내신등급 백분위 환산식이 미공개이므로 총점을 계산하지 않는다", () => {
  const rule = global.SCORE_RULES.find(
    (r) => r.id === "mokpo-national-gyogwa-2028",
  );
  const out = calc.calculate(
    rule,
    [
      {
        grade: 1,
        semester: 1,
        subject: "국어",
        name: "국어",
        credits: 3,
        rankGrade: 1,
      },
    ],
    { unexcusedAbsence: 0 },
  );
  assert.equal(out.blocked, true);
  assert.equal(out.status, "상세 기준 미공개");
});
test("목원대 교과Ⅱ·지역인재는 상위 15과목과 1~2등급 과목당 가산점을 적용한다", () => {
  const rule = global.SCORE_RULES.find(
    (r) => r.id === "mokwon-gyogwa2-local-2028",
  );
  const data = Array.from({ length: 15 }, (_, index) => ({
    grade: index < 8 ? 1 : 2,
    semester: (index % 2) + 1,
    subject: ["국어", "영어", "수학", "사회", "과학"][index % 5],
    name: `교과${index + 1}`,
    credits: 2,
    rankGrade: index < 2 ? index + 1 : 3,
  }));
  const out = calc.calculate(rule, data, { schoolViolenceLevel: 4 });
  assert.equal(out.selected.length, 15);
  assert.equal(out.selectedCourseBonus, 2);
  assert.equal(out.academicScore, 1002);
  assert.equal(out.schoolViolence.deduction, 50);
  assert.equal(out.total, 952);
});
test("목원대 교과면접은 성취도 상위 10과목의 교과 구성점수만 별도 계산한다", () => {
  const rule = global.SCORE_RULES.find((r) => r.id === "mokwon-interview-2028");
  const data = Array.from({ length: 11 }, (_, index) => ({
    grade: 1,
    semester: (index % 2) + 1,
    subject: index === 10 ? "과학" : "국어",
    name: index === 10 ? "과학탐구실험1" : `성취과목${index + 1}`,
    type: "일반선택",
    achievement: index < 5 ? "A" : "C",
  }));
  const out = calc.calculate(rule, data, {});
  assert.equal(out.status, "일부 계산 가능");
  assert.equal(out.selected.length, 10);
  assert.equal(out.academicScore, 598.5);
  assert.equal(out.total, 598.5);
});
test("대전대는 2028 등급·성취도 환산표와 출결표가 미공개이므로 계산을 차단한다", () => {
  const rule = global.SCORE_RULES.find((r) => r.id === "daejeon-gyogwa-2028");
  const out = calc.calculate(rule, [], {});
  assert.equal(out.blocked, true);
  assert.equal(out.status, "모집요강 확인 필요");
});
test("서강대 지역균형은 석차등급 800점과 성취도 100점 및 출결을 분리 합산한다", () => {
  const rule = global.SCORE_RULES.find(
    (r) => r.id === "sogang-regional-balance-2028",
  );
  const data = [
    [4, 1, "A", "공통과목"],
    [4, 1, "B", "공통과목"],
    [5, 2, "B", "일반선택"],
    [2, 2, "C", "진로선택"],
    [4, null, "D", "융합선택"],
  ].map(([credits, rankGrade, achievement, type], index) => ({
    grade: index < 2 ? 1 : 2,
    semester: (index % 2) + 1,
    subject: "국어",
    name: `과목${index + 1}`,
    credits,
    rankGrade,
    achievement,
    type,
  }));
  const out = calc.calculate(rule, data, { unexcusedAbsence: 4 });
  assert.equal(out.rawAverage, 1.4667);
  assert.equal(out.academicScore, 786.13);
  assert.deepEqual(out.attendance, { total: 4, score: 98 });
  assert.equal(out.total, 884.13);
});
test("서강대 논술 교과 구성점수는 유리한 등급 기준 상위 12과목과 출결을 계산한다", () => {
  const rule = global.SCORE_RULES.find(
    (r) => r.id === "sogang-essay-academic-component-2028",
  );
  const data = Array.from({ length: 12 }, (_, index) => ({
    grade: index < 6 ? 1 : 2,
    semester: (index % 2) + 1,
    subject: "수학",
    name: `과목${index + 1}`,
    credits: 2,
    rankGrade: index === 0 ? 4 : 2,
    achievement: index === 0 ? "A" : "B",
    type: "일반선택",
  }));
  const out = calc.calculate(rule, data, {
    unexcusedAbsence: 0,
    schoolViolenceLevel: 1,
  });
  assert.equal(out.selected[0].effectiveGrade, 1);
  assert.equal(out.academicScore, 100);
  assert.equal(out.attendance.score, 100);
  assert.equal(out.schoolViolence.deduction, 100);
  assert.equal(out.total, 100);
});
test("전주대는 등급별·결석구간별 세부점수가 미공개이므로 계산을 차단한다", () => {
  const rule = global.SCORE_RULES.find((r) => r.id === "jeonju-gyogwa-2028");
  assert.equal(rule.selectionVariants.length, 3);
  assert.equal(rule.attendanceRule.mode, "unpublishedTable");
  assert.equal(rule.attendanceRule.eventConversion.tardy, 3);
  assert.equal(rule.attendanceRule.publishedRange.studentRecord100Percent.maximum, 40);
  assert.equal(rule.attendanceRule.tablePublished, false);
  const out = calc.calculate(rule, [], {});
  assert.equal(out.blocked, true);
  assert.equal(out.status, "모집요강 확인 필요");
});
test("경운대는 공개된 9등급 변환·반영비율·학교폭력 감점을 기록하되 미공개 환산표 때문에 총점을 차단한다", () => {
  const rule = global.SCORE_RULES.find((r) => r.id === "kyungwoon-top11-2028");
  assert.equal(rule.legacyNineGradeToFiveGrade[8], 4.9584);
  assert.deepEqual(rule.componentWeights, { academic: 0.9, attendance: 0.1 });
  assert.equal(rule.attendanceRule.tablePublished, false);
  assert.equal(rule.schoolViolenceRule.deductions[4], 5);
  assert.equal(rule.schoolViolenceRule.deductions[9], 10);
  const out = calc.calculate(rule, [], {});
  assert.equal(out.blocked, true);
  assert.equal(out.status, "일부 계산 가능");
});
test("배재대 학생부교과는 두 단계 상위 7과목과 성취도·학년 가산점을 반영한다", () => {
  const rule = global.SCORE_RULES.find(
    (r) => r.id === "paichai-gyogwa-common-2028",
  );
  const data = Array.from({ length: 14 }, (_, index) => ({
    grade: 2,
    semester: (index % 2) + 1,
    subject: index < 7 ? ["국어", "수학", "영어"][index % 3] : "사회",
    name: `과목${index + 1}`,
    type: index < 7 ? "공통과목" : "일반선택",
    credits: 2,
    rankGrade: index < 7 ? 1 : 2,
    achievement: "A",
  }));
  const out = calc.calculate(rule, data, { schoolViolenceLevel: 1 });
  assert.equal(out.selected.length, 14);
  assert.equal(out.rawAverage, 957.5);
  assert.equal(out.selectedYearBonus, 14);
  assert.equal(out.academicScore, 971.5);
  assert.equal(out.schoolViolence.deduction, 20);
  assert.equal(out.total, 951.5);
});
test("백석대는 보통교과 부족 시 전문교과 최대 2과목과 출결·학교폭력을 반영한다", () => {
  const rule = global.SCORE_RULES.find((r) => r.id === "baekseok-gyogwa-2028");
  const data = [
    ...Array.from({ length: 13 }, (_, index) => ({
      grade: index < 7 ? 1 : 2,
      semester: (index % 2) + 1,
      subject: ["국어", "영어", "수학", "사회", "과학"][index % 5],
      name: `보통교과${index + 1}`,
      type: "일반선택",
      credits: 2,
      rankGrade: 2,
    })),
    ...Array.from({ length: 3 }, (_, index) => ({
      grade: 2,
      semester: 1,
      subject: "전문",
      name: `전문교과${index + 1}`,
      type: "전문교과",
      credits: 2,
      rankGrade: 1,
    })),
  ];
  const out = calc.calculate(rule, data, {
    unexcusedAbsence: 4,
    tardy: 30,
    schoolViolenceLevel: 4,
  });
  assert.equal(out.selected.length, 15);
  assert.equal(
    out.selected.filter((course) => course.type === "전문교과").length,
    2,
  );
  assert.equal(out.academicScore, 848);
  assert.deepEqual(out.attendance, { total: 4, score: 70 });
  assert.equal(out.schoolViolence.deduction, 20);
  assert.equal(out.total, 898);
});
test("연세대 미래 2022개정 교과는 등급·성취도 75:25와 성취비율·출결을 반영한다", () => {
  const rule = global.SCORE_RULES.find(
    (r) => r.id === "yonsei-future-general-humanities-2022-curriculum-2028",
  );
  const data = Array.from({ length: 16 }, (_, index) => ({
    grade: index < 8 ? 1 : 2,
    semester: (index % 2) + 1,
    subject: ["국어", "수학", "영어", "사회"][index % 4],
    name: `과목${index + 1}`,
    type: "일반선택",
    credits: 2,
    rankGrade: 1,
    achievement: "A",
    achievementRatio: "A:50,B:20,C:15,D:10,E:5",
  }));
  const out = calc.calculate(rule, data, {
    unexcusedAbsence: 2,
    tardy: 7,
  });
  assert.equal(out.selected.length, 16);
  assert.equal(out.selected[0].adjustedAchievement, "B");
  assert.equal(out.academicScore, 88.425);
  assert.deepEqual(out.attendance, { total: 6, score: 8 });
  assert.equal(out.total, 96.425);
});
test("청주대 5등급제는 공통 교과별 2과목과 선택 9과목의 A비율을 반영한다", () => {
  const rule = global.SCORE_RULES.find(
    (r) => r.id === "cheongju-general-five-grade-2028",
  );
  const common = ["국어", "수학", "영어"].flatMap((subject) =>
    Array.from({ length: 2 }, (_, index) => ({
      grade: 1,
      semester: index + 1,
      subject,
      name: `${subject}공통${index + 1}`,
      type: "공통과목",
      credits: 3,
      rankGrade: 1,
      achievement: "A",
      achievementRatio: "A:10,B:20,C:30,D:25,E:15",
    })),
  );
  const choices = Array.from({ length: 9 }, (_, index) => ({
    grade: index < 5 ? 1 : 2,
    semester: (index % 2) + 1,
    subject: "과학",
    name: `선택${index + 1}`,
    type: "진로선택",
    credits: 3,
    rankGrade: 1,
    achievement: "A",
    achievementRatio: "A:10,B:20,C:30,D:25,E:15",
  }));
  const out = calc.calculate(rule, common.concat(choices), {
    schoolViolenceLevel: 3,
  });
  assert.equal(out.selected.length, 15);
  assert.equal(out.rawAverage, 980);
  assert.equal(out.selectedCourseBonus, 9);
  assert.equal(out.academicScore, 989);
  assert.equal(out.schoolViolence.deduction, 60);
  assert.equal(out.total, 929);
});
test("청주대 5등급제는 A 성취비율이 빠진 과목을 임의 환산하지 않는다", () => {
  const rule = global.SCORE_RULES.find(
    (r) => r.id === "cheongju-general-five-grade-2028",
  );
  const out = calc.calculate(
    rule,
    [
      {
        grade: 1,
        semester: 1,
        subject: "국어",
        name: "공통국어",
        type: "공통과목",
        credits: 3,
        rankGrade: 1,
        achievement: "A",
      },
    ],
    {},
  );
  assert.equal(out.blocked, true);
  assert.deepEqual(out.missing, ["반영 후보 과목의 성취도 A 분포비율"]);
});
test("광신대는 평균등급의 정수 구간 적용 기준이 없어 계산을 차단한다", () => {
  const rule = global.SCORE_RULES.find(
    (r) => r.id === "kwangshin-student-record-2028",
  );
  const out = calc.calculate(rule, [], {});
  assert.equal(out.blocked, true);
  assert.equal(out.status, "상세 기준 미공개");
});
test("남서울대 교과 100%는 상위 15과목 평균을 27개 구간으로 환산한다", () => {
  const rule = global.SCORE_RULES.find(
    (r) => r.id === "namseoul-gyogwa-100-five-grade-2028",
  );
  const data = Array.from({ length: 15 }, (_, index) => ({
    grade: index < 8 ? 1 : 2,
    semester: (index % 2) + 1,
    subject: ["국어", "수학", "영어", "사회", "과학"][index % 5],
    name: `과목${index + 1}`,
    type: "일반선택",
    credits: 2,
    rankGrade: index < 12 ? 1 : 2,
  }));
  const out = calc.calculate(rule, data, { schoolViolenceLevel: 4 });
  assert.equal(out.selected.length, 15);
  assert.equal(out.rawAverage, 1.2);
  assert.equal(out.academicScore, 970);
  assert.equal(out.schoolViolence.deduction, 20);
  assert.equal(out.total, 950);
});
test("나사렛대 교과 100%는 상위 15과목 평균을 전형 배점표로 환산한다", () => {
  const rule = global.SCORE_RULES.find(
    (r) => r.id === "korea-nazarene-gyogwa-100-2028",
  );
  const data = Array.from({ length: 15 }, (_, index) => ({
    grade: index < 8 ? 1 : 2,
    semester: (index % 2) + 1,
    subject: ["국어", "수학", "영어", "사회", "과학"][index % 5],
    name: `과목${index + 1}`,
    type: "일반선택",
    credits: 2,
    rankGrade: index < 12 ? 1 : 2,
  }));
  const out = calc.calculate(rule, data, { schoolViolenceLevel: 2 });
  assert.equal(out.rawAverage, 1.2);
  assert.equal(out.academicScore, 990);
  assert.equal(out.schoolViolence.deduction, 13);
  assert.equal(out.total, 977);
});
test("동덕여대 약학과는 네 교과 평균을 동일비율로 1000점 환산한다", () => {
  const rule = global.SCORE_RULES.find(
    (r) => r.id === "dongduk-pharmacy-gyogwa-2028",
  );
  const data = ["국어", "영어", "수학", "과학"].flatMap((subject) => [
    {
      grade: 1,
      semester: 1,
      subject,
      name: `${subject}1`,
      type: "공통과목",
      credits: 3,
      rankGrade: 1,
    },
    {
      grade: 1,
      semester: 2,
      subject,
      name: `${subject}2`,
      type: "일반선택",
      credits: 2,
      rankGrade: 2,
    },
  ]);
  const out = calc.calculate(rule, data, { schoolViolenceLevel: 3 });
  assert.equal(out.rawAverage, 97.5);
  assert.equal(out.academicScore, 975);
  assert.equal(out.schoolViolence.deduction, 10);
  assert.equal(out.total, 965);
});
test("동덕여대 약학과는 필수 반영교과가 없으면 계산하지 않는다", () => {
  const rule = global.SCORE_RULES.find(
    (r) => r.id === "dongduk-pharmacy-gyogwa-2028",
  );
  const out = calc.calculate(
    rule,
    [
      {
        grade: 1,
        semester: 1,
        subject: "국어",
        name: "국어",
        type: "공통과목",
        credits: 3,
        rankGrade: 1,
      },
    ],
    {},
  );
  assert.equal(out.blocked, true);
  assert.deepEqual(out.missing, ["모든 필수 반영교과의 이수 과목"]);
});
test("한국외대 학교장추천은 등급환산점수표 미공개로 계산을 차단한다", () => {
  const rule = global.SCORE_RULES.find(
    (r) => r.id === "hufs-school-recommendation-2028",
  );
  const out = calc.calculate(rule, [], {});
  assert.equal(out.blocked, true);
  assert.equal(out.status, "모집요강 확인 필요");
});
test("한양대 ERICA 지역균형은 환산점수표 미공개로 계산을 차단한다", () => {
  const rule = global.SCORE_RULES.find(
    (r) => r.id === "hanyang-erica-regional-balance-2028",
  );
  const out = calc.calculate(rule, [], {});
  assert.equal(out.blocked, true);
  assert.equal(out.status, "모집요강 확인 필요");
});
test("동국대 WISE는 석차등급과 성취도 조합을 이수단위 가중 환산한다", () => {
  const rule = global.SCORE_RULES.find(
    (r) => r.id === "dongguk-wise-academic-excellence-general-2028",
  );
  const data = [
    {
      grade: 1,
      semester: 1,
      subject: "국어",
      name: "국어",
      type: "공통과목",
      credits: 3,
      rankGrade: 1,
      achievement: "A",
    },
    {
      grade: 1,
      semester: 1,
      subject: "영어",
      name: "영어",
      type: "공통과목",
      credits: 3,
      rankGrade: 2,
      achievement: "B",
    },
  ];
  const out = calc.calculate(rule, data, { schoolViolenceLevel: 2 });
  assert.equal(out.rawAverage, 98.5);
  assert.equal(out.academicScore, 985);
  assert.equal(out.schoolViolence.deduction, 200);
  assert.equal(out.total, 785);
});
test("세한대는 1학년 상위 4과목과 2~3학년 상위 6과목을 40:60으로 환산한다", () => {
  const rule = global.SCORE_RULES.find(
    (r) => r.id === "sehan-gyogwa-common-2028",
  );
  const data = [
    ...[1, 2, 3, 4, 5].map((rankGrade, index) => ({
      grade: 1,
      semester: index % 2 ? 2 : 1,
      subject: ["국어", "영어", "수학", "사회", "과학"][index],
      name: `1학년${index + 1}`,
      type: "공통과목",
      credits: 2,
      rankGrade,
    })),
    ...[1, 2, 3, 4, 5, 5, 5].map((rankGrade, index) => ({
      grade: index < 4 ? 2 : 3,
      semester: index === 6 ? 2 : 1,
      subject: ["국어", "영어", "수학", "사회", "과학", "한국사", "국어"][
        index
      ],
      name: `2~3학년${index + 1}`,
      type: "일반선택",
      credits: 2,
      rankGrade,
    })),
  ];
  const out = calc.calculate(rule, data, {});
  assert.equal(out.selected.length, 10);
  assert.equal(out.rawAverage, 3);
  assert.equal(out.academicScore, 980);
  assert.equal(out.total, 980);
});
test("세한대는 학교폭력 호수별 감점표가 없어 해당 입력 시 계산을 차단한다", () => {
  const rule = global.SCORE_RULES.find(
    (r) => r.id === "sehan-gyogwa-common-2028",
  );
  const out = calc.calculate(rule, [], { schoolViolenceLevel: 1 });
  assert.equal(out.blocked, true);
  assert.equal(out.status, "입력 기준 미공개");
});
test("고려대 세종 일반전형은 이수단위 가중점수와 진로선택 가산점을 반영한다", () => {
  const rule = global.SCORE_RULES.find(
    (r) => r.id === "korea-sejong-gyogwa-humanities-2028",
  );
  const data = [
    {
      grade: 1,
      semester: 1,
      subject: "국어",
      name: "공통국어",
      type: "공통과목",
      credits: 3,
      rankGrade: 1,
    },
    {
      grade: 2,
      semester: 1,
      subject: "사회",
      name: "사회문제탐구",
      type: "진로선택",
      credits: 2,
      rankGrade: 2,
      achievement: "A",
    },
    {
      grade: 2,
      semester: 1,
      subject: "사회",
      name: "융합사회",
      type: "융합선택",
      credits: 2,
      rankGrade: 1,
    },
  ];
  const out = calc.calculate(rule, data, {});
  assert.equal(out.selected.length, 2);
  assert.equal(out.selected[1].courseBonusPercent, 3);
  assert.equal(out.academicScore, 970.8);
  assert.equal(out.total, 970.8);
});
test("고려대 세종은 학교폭력 호수별 감점표 공개 전에는 해당 총점을 계산하지 않는다", () => {
  const rule = global.SCORE_RULES.find(
    (r) => r.id === "korea-sejong-gyogwa-natural-2028",
  );
  const out = calc.calculate(rule, [], { schoolViolenceLevel: 2 });
  assert.equal(out.blocked, true);
  assert.equal(out.status, "입력 기준 미공개");
});
test("국립경국대는 두 교과군 상위 15과목·이수학점·출결·학교폭력을 반영한다", () => {
  const rule = global.SCORE_RULES.find(
    (r) => r.id === "gyeongguk-gyogwa-common-2028",
  );
  const data = [
    ...Array.from({ length: 10 }, (_, index) => ({
      grade: index < 5 ? 1 : 2,
      semester: (index % 2) + 1,
      subject: ["국어", "수학", "영어"][index % 3],
      name: `주요${index + 1}`,
      type: "공통과목",
      credits: 2,
      rankGrade: 1,
      achievement: "A",
    })),
    ...Array.from({ length: 5 }, (_, index) => ({
      grade: 2,
      semester: (index % 2) + 1,
      subject: ["사회", "과학", "한국사"][index % 3],
      name: `탐구${index + 1}`,
      type: "일반선택",
      credits: 2,
      rankGrade: 2,
      achievement: "B",
    })),
  ];
  const out = calc.calculate(rule, data, {
    unexcusedAbsence: 4,
    tardy: 3,
    schoolViolenceLevel: 4,
  });
  assert.equal(out.selected.length, 15);
  assert.equal(out.rawAverage, 0.9375);
  assert.equal(out.academicScore, 785);
  assert.equal(out.attendance.total, 5);
  assert.equal(out.attendance.score, 185);
  assert.equal(out.schoolViolence.deduction, 20);
  assert.equal(out.total, 950);
});
test("국립군산대는 출결 환산표가 미공개이므로 총점을 계산하지 않는다", () => {
  const rule = global.SCORE_RULES.find(
    (r) => r.id === "gunsan-gyogwa-common-2028",
  );
  const out = calc.calculate(rule, [], {});
  assert.equal(out.blocked, true);
  assert.equal(out.status, "모집요강 확인 필요");
});
test("협성대는 교과군별 14과목에서 진로선택 상위 2과목으로 낮은 점수를 대체한다", () => {
  const rule = global.SCORE_RULES.find(
    (r) => r.id === "hyupsung-gyogwa-2028-graduate-2028",
  );
  const ordinary = [
    ...Array.from({ length: 5 }, (_, index) => ({
      subject: index % 2 ? "수학" : "국어",
      rankGrade: index === 4 ? 5 : 1,
    })),
    ...Array.from({ length: 4 }, (_, index) => ({
      subject: "영어",
      rankGrade: index === 3 ? 4 : 1,
    })),
    ...Array.from({ length: 5 }, (_, index) => ({
      subject: ["사회", "한국사", "과학"][index % 3],
      rankGrade: index === 4 ? 3 : 1,
    })),
  ].map((course, index) => ({
    ...course,
    grade: index < 7 ? 1 : 2,
    semester: (index % 2) + 1,
    name: `일반${index + 1}`,
    type: "일반선택",
    credits: 2,
    achievement: "A",
  }));
  const career = ["A", "B"].map((achievement, index) => ({
    grade: 2,
    semester: 1,
    subject: index ? "사회" : "국어",
    name: `진로${index + 1}`,
    type: "진로선택",
    credits: 2,
    achievement,
  }));
  const out = calc.calculate(rule, ordinary.concat(career), {
    schoolViolenceLevel: 4,
  });
  assert.equal(out.selected.length, 14);
  assert.equal(
    out.selected.some((course) => course.rankGrade === 5),
    false,
  );
  assert.equal(out.rawAverage, 99.357);
  assert.equal(out.schoolViolence.deduction, 20);
  assert.equal(out.total, 79.357);
});
test("광주교대 지역인재는 정량 교과 산출식이 모집요강 공개 예정이므로 계산을 차단한다", () => {
  const rule = global.SCORE_RULES.find(
    (r) => r.id === "gwangju-edu-regional-2028",
  );
  const out = calc.calculate(rule, [], {});
  assert.equal(out.blocked, true);
  assert.equal(out.status, "모집요강 확인 필요");
  assert.equal(rule.qualitativeComponents[0].maximumScore, 200);
});
test("김천대 일반교과는 공통·일반 70%와 진로·융합 30%를 이수학점 가중한다", () => {
  const rule = global.SCORE_RULES.find(
    (r) => r.id === "gimcheon-general-gyogwa-2028",
  );
  const ordinary = ["국어", "영어", "수학", "사회", "과학"].flatMap(
    (subject, subjectIndex) =>
      [1, 2].map((rankGrade, index) => ({
        grade: subjectIndex < 3 ? 1 : 2,
        semester: index + 1,
        subject,
        name: `${subject}${index + 1}`,
        type: index ? "일반선택" : "공통과목",
        credits: index ? 1 : 3,
        rankGrade,
        achievement: index ? "B" : "A",
      })),
  );
  const special = ["A", "B", "C", "D", "E"].map((achievement, index) => ({
    grade: 2,
    semester: 1,
    subject: ["국어", "영어", "수학", "사회", "과학"][index],
    name: `선택${index + 1}`,
    type: index % 2 ? "융합선택" : "진로선택",
    credits: 2,
    achievement,
  }));
  const out = calc.calculate(rule, ordinary.concat(special), {
    schoolViolenceLevel: 5,
  });
  assert.equal(out.selected.length, 15);
  assert.equal(out.rawAverage, 95.71);
  assert.equal(out.academicScore, 957.1);
  assert.equal(out.schoolViolence.deduction, 20);
  assert.equal(out.total, 937.1);
});
test("동아대 지역인재교과는 상위 12과목과 선택과목 상한·이수단위·학교폭력을 반영한다", () => {
  const rule = global.SCORE_RULES.find(
    (r) => r.id === "donga-regional-gyogwa-general-2028",
  );
  const ordinary = Array.from({ length: 10 }, (_, index) => ({
    grade: index < 5 ? 1 : 2,
    semester: (index % 2) + 1,
    subject: ["국어", "영어", "수학", "사회", "과학"][index % 5],
    name: `보통${index + 1}`,
    type: index % 2 ? "일반선택" : "공통과목",
    credits: 2,
    rankGrade: index < 8 ? 1 : 2,
  }));
  const special = Array.from({ length: 6 }, (_, index) => ({
    grade: 2,
    semester: 1,
    subject: ["국어", "영어", "수학"][index % 3],
    name: `선택${index + 1}`,
    type: index % 2 ? "융합선택" : "진로선택",
    credits: 3,
    achievement: index < 5 ? "A" : "B",
  }));
  const out = calc.calculate(rule, ordinary.concat(special), {
    schoolViolenceLevel: 4,
  });
  assert.equal(out.selected.length, 12);
  assert.equal(
    out.selected.filter((course) =>
      ["진로선택", "융합선택"].includes(course.type),
    ).length,
    4,
  );
  assert.equal(out.academicScore, 1000);
  assert.equal(out.schoolViolence.deduction, 130);
  assert.equal(out.total, 870);
});
test("을지대 EU서류형은 이수단위 가중 평균과 80단위 미만 보정·학교폭력을 반영한다", () => {
  const rule = global.SCORE_RULES.find(
    (r) => r.id === "eulji-eu-document-2028",
  );
  const courses = ["국어", "영어", "수학", "사회", "과학"].map(
    (subject, index) => ({
      grade: index < 3 ? 1 : 2,
      semester: (index % 2) + 1,
      subject,
      name: `${subject}Ⅰ`,
      type: index ? "일반선택" : "공통과목",
      credits: 16,
      rankGrade: index + 1,
    }),
  );
  const full = calc.calculate(rule, courses, { schoolViolenceLevel: 2 });
  assert.equal(full.rawAverage, 73.2);
  assert.equal(full.academicScore, 732);
  assert.equal(full.schoolViolence.deduction, 40);
  assert.equal(full.total, 692);

  const short = calc.calculate(
    rule,
    courses.map((course) => ({ ...course, credits: 10 })),
    { schoolViolenceLevel: 4 },
  );
  assert.equal(short.academicScore, 658.8);
  assert.equal(short.status, "부적격");
  assert.equal(short.total, null);
});
test("제주국제대는 학기별 이수단위 평균에 학년 비율과 출석·학교폭력을 적용한다", () => {
  const rule = global.SCORE_RULES.find(
    (r) => r.id === "jeju-international-gyogwa-2028",
  );
  const courses = [1, 2, 3].flatMap((grade) =>
    [1, 2].map((semester) => ({
      grade,
      semester,
      subject: semester === 1 ? "국어" : "체육·예술",
      name: semester === 1 ? "국어" : "체육",
      type: semester === 1 ? "일반선택" : "체육·예술",
      credits: semester === 1 ? 4 : 2,
      rankGrade: semester === 1 ? grade : undefined,
      achievement: semester === 1 ? undefined : ["A", "B", "C"][grade - 1],
    })),
  );
  const out = calc.calculate(rule, courses, {
    unexcusedAbsence: 8,
    tardy: 3,
    early: 2,
    missingClass: 1,
    schoolViolenceLevel: 4,
  });
  assert.equal(out.rawAverage, 823.05);
  assert.equal(out.academicScore, 823.05);
  assert.equal(out.attendance.total, 10);
  assert.equal(out.attendance.score, 93.25);
  assert.equal(out.schoolViolence.deduction, 3);
  assert.equal(out.total, 913.3);
});
test("한신대 학교장추천은 상위 15과목과 출결·학교폭력 감점을 적용한다", () => {
  const rule = global.SCORE_RULES.find(
    (r) => r.id === "hanshin-school-recommendation-2028",
  );
  const courses = Array.from({ length: 17 }, (_, index) => ({
    grade: index < 8 ? 1 : 2,
    semester: (index % 2) + 1,
    subject: ["국어", "영어", "수학", "사회", "과학"][index % 5],
    name: `과목${index + 1}`,
    type: index % 3 ? "일반선택" : "진로선택",
    credits: (index % 3) + 1,
    rankGrade: index < 5 ? 1 : index < 10 ? 2 : index < 15 ? 3 : 5,
  }));
  const out = calc.calculate(rule, courses, {
    unexcusedAbsence: 4,
    tardy: 3,
    early: 2,
    missingClass: 1,
    schoolViolenceLevel: 6,
  });
  assert.equal(out.selected.length, 15);
  assert.equal(
    out.selected.some((course) => course.rankGrade === 5),
    false,
  );
  assert.equal(out.rawAverage, 98);
  assert.equal(out.academicScore, 882);
  assert.equal(out.attendance.total, 6);
  assert.equal(out.attendance.score, 95);
  assert.equal(out.schoolViolence.deduction, 50);
  assert.equal(out.total, 927);
});
test("호남대 교과중심은 평균등급 구간과 학점·진로 가산점·출결·학교폭력을 반영한다", () => {
  const rule = global.SCORE_RULES.find(
    (r) => r.id === "honam-gyogwa-centered-2028",
  );
  const ordinary = Array.from({ length: 20 }, (_, index) => ({
    grade: index < 10 ? 1 : 2,
    semester: (index % 2) + 1,
    subject: ["국어", "영어", "수학", "사회", "과학"][index % 5],
    name: `보통${index + 1}`,
    type: index % 2 ? "일반선택" : "공통과목",
    credits: 4,
    rankGrade: index < 10 ? 2 : 3,
  }));
  const career = ["A", "B", "C", "D"].map((achievement, index) => ({
    grade: 2,
    semester: 1,
    subject: ["국어", "영어", "수학", "사회"][index],
    name: `진로${index + 1}`,
    type: index % 2 ? "융합선택" : "진로선택",
    credits: 2,
    achievement,
  }));
  const out = calc.calculate(rule, ordinary.concat(career), {
    unexcusedAbsence: 1,
    tardy: 9,
    schoolViolenceLevel: 4,
  });
  assert.equal(out.rawAverage, 2.5);
  assert.equal(out.creditThresholdBonus, 5);
  assert.equal(out.supplementalAchievementBonus, 7.5);
  assert.equal(out.academicScore, 72.5);
  assert.equal(out.attendance.total, 1);
  assert.equal(out.attendance.score, 16);
  assert.equal(out.schoolViolence.deduction, 8);
  assert.equal(out.total, 80.5);
});
test("가톨릭대 지역균형은 필수 교과 이수학점 평균과 출결·학교폭력 부적격을 반영한다", () => {
  const rule = global.SCORE_RULES.find(
    (r) => r.id === "catholic-regional-balance-2028",
  );
  const courses = ["국어", "수학", "영어", "사회", "과학"].flatMap(
    (subject, subjectIndex) =>
      [1, 2, 3, 4].map((termIndex) => ({
        grade: termIndex <= 2 ? 1 : 2,
        semester: (termIndex % 2) + 1,
        subject,
        name: `${subject}${termIndex + 1}`,
        type: termIndex === 3 ? "진로선택" : "일반선택",
        credits: subjectIndex === 0 ? 4 : 2,
        rankGrade: termIndex === 3 ? undefined : subjectIndex < 3 ? 1 : 2,
        achievement: termIndex === 3 ? "B" : undefined,
      })),
  );
  const out = calc.calculate(rule, courses, {
    unexcusedAbsence: 2,
    tardy: 1,
    early: 2,
    missingClass: 0,
  });
  assert.equal(out.rawAverage, 99);
  assert.equal(out.academicScore, 89.1);
  assert.equal(out.attendance.total, 5);
  assert.equal(out.attendance.score, 9);
  assert.equal(out.total, 98.1);

  const disqualified = calc.calculate(rule, courses, {
    schoolViolenceLevel: 1,
  });
  assert.equal(disqualified.status, "부적격");
  assert.equal(disqualified.total, null);
});
test("강원대 교과전형은 등급·성취도 이수학점 평균과 출결·취득총점 비율 감점을 적용한다", () => {
  const rule = global.SCORE_RULES.find(
    (r) => r.id === "kangwon-gyogwa-common-2028",
  );
  const courses = ["국어", "영어", "수학", "사회", "과학"].map(
    (subject, index) => ({
      grade: index < 3 ? 1 : 2,
      semester: (index % 2) + 1,
      subject,
      name: `${subject}Ⅰ`,
      type: index < 3 ? "일반선택" : "진로선택",
      credits: index + 1,
      rankGrade: index < 2 ? 1 : index < 4 ? 2 : 3,
      achievement: ["A", "A", "B", "C", "D"][index],
    }),
  );
  const out = calc.calculate(rule, courses, {
    unexcusedAbsence: 2,
    tardy: 3,
    early: 2,
    missingClass: 1,
    schoolViolenceLevel: 3,
  });
  assert.equal(out.rawAverage, 928.8);
  assert.equal(out.academicScore, 928.8);
  assert.equal(out.attendance.total, 4);
  assert.equal(out.attendance.score, -6);
  assert.equal(out.schoolViolence.deduction, 92.28);
  assert.equal(out.total, 830.52);

  const blocked = calc.calculate(
    rule,
    courses.map((course, index) =>
      index === 0 ? { ...course, achievement: "" } : course,
    ),
    {},
  );
  assert.equal(blocked.status, "입력 부족");
});
test("건국대 서울 KU지역균형은 등급 기준점수표 미공개로 총점을 계산하지 않는다", () => {
  const rule = global.SCORE_RULES.find(
    (r) => r.id === "konkuk-ku-regional-2028",
  );
  const out = calc.calculate(rule, [], {});
  assert.equal(out.blocked, true);
  assert.equal(out.status, "모집요강 확인 필요");
});
test("건국대 글로컬은 등급·성취도 결합과 학점 감산·개근·학교폭력을 반영한다", () => {
  const rule = global.SCORE_RULES.find(
    (r) => r.id === "konkuk-glocal-humanities-2028",
  );
  const courses = ["국어", "영어", "수학", "사회"].flatMap(
    (subject, subjectIndex) =>
      [1, 2].map((rankGrade, index) => ({
        grade: subjectIndex < 2 ? 1 : 2,
        semester: index + 1,
        subject,
        name: `${subject}${index + 1}`,
        type: index ? "진로선택" : "일반선택",
        credits: 5,
        rankGrade,
        achievement: index ? "B" : "A",
      })),
  );
  const out = calc.calculate(rule, courses, {
    perfectAttendanceYears: 2,
    schoolViolenceLevel: 4,
  });
  assert.equal(out.rawAverage, 9.25);
  assert.equal(out.creditDeficitFinalMultiplier, 0.9);
  assert.equal(out.academicScore, 852.75);
  assert.equal(out.attendance.score, 20);
  assert.equal(out.schoolViolence.deduction, 100);
  assert.equal(out.total, 772.75);
});
test("경상국립대는 시행계획의 최소 이수학점과 폭력 감점표 미공개로 총점을 계산하지 않는다", () => {
  const rule = global.SCORE_RULES.find(
    (r) => r.id === "gnu-student-record-common-2028",
  );
  const out = calc.calculate(rule, [], {});
  assert.equal(out.blocked, true);
  assert.equal(out.status, "모집요강 확인 필요");
});
test("경북대는 졸업연도·전형별 세부 환산기준 확인 전 총점을 계산하지 않는다", () => {
  const rule = global.SCORE_RULES.find(
    (r) => r.id === "knu-student-record-common-2028",
  );
  const out = calc.calculate(rule, [], {});
  assert.equal(out.blocked, true);
  assert.equal(out.status, "일부 계산 가능");
});
test("가야대는 석차등급별 환산점수표 미공개로 총점을 계산하지 않는다", () => {
  const rule = global.SCORE_RULES.find(
    (r) => r.id === "kaya-student-record-common-2028",
  );
  const out = calc.calculate(rule, [], {});
  assert.equal(out.blocked, true);
  assert.equal(out.status, "모집요강 확인 필요");
});
test("강서대 간호학과는 국수영과 사회·과학 중 유리한 교과의 상위 과목을 반영한다", () => {
  const rule = global.SCORE_RULES.find((r) => r.id === "gangseo-nursing-2028");
  const courses = ["국어", "수학", "영어", "사회", "과학"].flatMap(
    (subject, subjectIndex) =>
      Array.from({ length: 5 }, (_, index) => ({
        grade: Math.floor(index / 2) + 1,
        semester: (index % 2) + 1,
        subject,
        name: `${subject}${index + 1}`,
        type: "일반선택",
        credits: 2,
        rankGrade: subject === "사회" ? 4 : subjectIndex < 3 ? 1 : 2,
      })),
  );
  const out = calc.calculate(rule, courses, { schoolViolenceLevel: 1 });
  assert.equal(out.selected.length, 20);
  assert.equal(
    out.selected.some((course) => course.subject === "사회"),
    false,
  );
  assert.equal(out.rawAverage, 992.5);
  assert.equal(out.schoolViolence.deduction, 50);
  assert.equal(out.total, 942.5);
});
test("건양대 일반 모집단위는 상위 6과목 교과점수와 출결 항목별 감점을 합산한다", () => {
  const rule = global.SCORE_RULES.find(
    (r) => r.id === "konyang-general-six-2028",
  );
  const courses = Array.from({ length: 8 }, (_, index) => ({
    grade: index < 4 ? 1 : 2,
    semester: (index % 2) + 1,
    subject: ["국어", "수학", "영어", "사회", "과학"][index % 5],
    name: `과목${index + 1}`,
    type: "일반선택",
    credits: 10,
    rankGrade: index < 3 ? 1 : index < 6 ? 2 : 3,
  }));
  const out = calc.calculate(rule, courses, {
    unexcusedAbsence: 2,
    tardy: 2,
    early: 1,
    missingClass: 1,
  });
  assert.equal(out.selected.length, 6);
  assert.equal(out.rawAverage, 98);
  assert.equal(out.academicScore, 882);
  assert.equal(out.attendance.score, 97);
  assert.equal(out.total, 979);
});
test("감리교신학대와 강남대는 핵심 환산표 미공개로 계산을 차단한다", () => {
  for (const id of [
    "mtu-student-record-2028",
    "kangnam-regional-balance-2028",
  ]) {
    const out = calc.calculate(
      global.SCORE_RULES.find((r) => r.id === id),
      [],
      {},
    );
    assert.equal(out.blocked, true);
    assert.equal(out.status, "모집요강 확인 필요");
  }
});
test("가천대 학생부우수자는 두 교과군에서 각각 하위 5과목을 제외한다", () => {
  const rule = global.SCORE_RULES.find(
    (r) => r.id === "gachon-student-excellence-2028",
  );
  const courses = ["국어", "수학", "영어", "사회", "과학"].flatMap(
    (subject, subjectIndex) =>
      Array.from({ length: 4 }, (_, index) => ({
        grade: Math.floor(index / 2) + 1,
        semester: (index % 2) + 1,
        subject,
        name: `${subject}${index + 1}`,
        type: "일반선택",
        credits: index + 1,
        rankGrade: Math.min(5, subjectIndex + index + 1),
      })),
  );
  const out = calc.calculate(rule, courses, { schoolViolenceLevel: 6 });
  assert.equal(out.selected.length, 10);
  assert.equal(out.schoolViolence.deduction, 200);
  assert.equal(out.total < 800, true);
});
test("경성대 일반 모집단위는 국수영과 사회·과학 중 유리한 교과 12과목을 학점 가중한다", () => {
  const rule = global.SCORE_RULES.find(
    (r) => r.id === "kyungsung-gyogwa-general-2028",
  );
  const courses = ["국어", "수학", "영어", "사회", "과학"].flatMap((subject) =>
    Array.from({ length: 3 }, (_, index) => ({
      grade: index + 1,
      semester: (index % 2) + 1,
      subject,
      name: `${subject}${index + 1}`,
      type: "일반선택",
      credits: index + 1,
      rankGrade: subject === "사회" ? 5 : subject === "과학" ? 2 : 1,
    })),
  );
  const out = calc.calculate(rule, courses, {});
  assert.equal(out.selected.length, 12);
  assert.equal(
    out.selected.some((course) => course.subject === "사회"),
    false,
  );
  assert.equal(out.rawAverage, 99);
  const disqualified = calc.calculate(rule, courses, {
    schoolViolenceLevel: 1,
  });
  assert.equal(disqualified.status, "부적격");
});
test("경인교대 학교장추천은 전 과목 환산평균과 미인정 출결을 합산한다", () => {
  const rule = global.SCORE_RULES.find(
    (r) => r.id === "ginue-school-recommendation-2028",
  );
  const courses = Array.from({ length: 10 }, (_, index) => ({
    grade: Math.floor(index / 2) + 1,
    semester: (index % 2) + 1,
    subject: ["국어", "수학", "영어", "사회", "과학"][index % 5],
    name: `과목${index + 1}`,
    type: index % 2 ? "진로선택" : "일반선택",
    credits: 2,
    rankGrade: index < 5 ? 1 : undefined,
    achievement: index < 5 ? "B" : "A",
  }));
  const out = calc.calculate(rule, courses, {
    unexcusedAbsence: 2,
    tardy: 3,
  });
  assert.equal(out.rawAverage, 8);
  assert.equal(out.academicScore, 900);
  assert.equal(out.attendance.total, 3);
  assert.equal(out.attendance.score, 99);
  assert.equal(out.total, 999);
});
test("경동대와 경일대는 핵심 교과·출결 환산표 미공개로 계산을 차단한다", () => {
  for (const id of [
    "kyungdong-student-record-2028",
    "kiu-student-record-2028",
  ]) {
    const out = calc.calculate(
      global.SCORE_RULES.find((r) => r.id === id),
      [],
      {},
    );
    assert.equal(out.blocked, true);
    assert.equal(out.status, "모집요강 확인 필요");
  }
});
test("계명대 인문계열은 네 교과 중 상위 세 교과 전 과목과 미인정 출결을 반영한다", () => {
  const rule = global.SCORE_RULES.find(
    (r) => r.id === "keimyung-gyogwa-humanities-2028",
  );
  const courses = ["국어", "수학", "영어", "사회"].flatMap(
    (subject, subjectIndex) =>
      [1, 2, 3].map((grade, index) => ({
        grade,
        semester: (index % 2) + 1,
        subject,
        name: `${subject}${index + 1}`,
        type: "일반선택",
        credits: index + 1,
        rankGrade: subjectIndex === 3 ? 5 : subjectIndex + 1,
      })),
  );
  const out = calc.calculate(rule, courses, {
    unexcusedAbsence: 2,
    tardy: 4,
    early: 2,
  });
  assert.equal(
    out.selected.some((course) => course.subject === "사회"),
    false,
  );
  assert.equal(out.rawAverage, 70);
  assert.equal(out.attendance.score, 16);
  assert.equal(out.total, 86);
  const blocked = calc.calculate(rule, courses, { schoolViolenceLevel: 3 });
  assert.equal(blocked.blocked, true);
  assert.equal(blocked.status, "입력 기준 미공개");
});
test("선문대 교과 100%는 상위 15과목과 부족 과목·학교폭력 감점을 반영한다", () => {
  const rule = global.SCORE_RULES.find(
    (r) => r.id === "sunmoon-gyogwa-100-2028",
  );
  const courses = Array.from({ length: 12 }, (_, index) => ({
    grade: index < 6 ? 1 : 2,
    semester: (index % 2) + 1,
    subject: ["국어", "영어", "수학", "사회", "과학", "한국사"][index % 6],
    name: `과목${index + 1}`,
    type: "일반선택",
    credits: 2,
    rankGrade: index < 6 ? 1 : 2,
  }));
  const out = calc.calculate(rule, courses, { schoolViolenceLevel: 4 });
  assert.equal(out.selected.length, 15);
  assert.equal(out.rawAverage, 7.6);
  assert.equal(out.academicScore, 760);
  assert.equal(out.schoolViolence.deduction, 34);
  assert.equal(out.total, 726);
});
test("세명대·우송대 미구현 전형은 불완전한 환산 기준으로 총점을 확정하지 않는다", () => {
  for (const id of [
    "semyung-student-record-2028",
    "woosong-student-record-2028",
  ]) {
    const out = calc.calculate(
      global.SCORE_RULES.find((r) => r.id === id),
      [],
      {},
    );
    assert.equal(out.blocked, true);
  }
});
test("국립한국교통대 일반전형은 교과별 상위3·진로 상위3과 이수학점 가산·학교폭력을 적용한다", () => {
  const rule = global.SCORE_RULES.find((r) => r.id === "ut-general-natural-2028");
  const courses = ["국어","영어","수학","과학"].flatMap((subject) => [
    {grade:1,semester:1,subject,name:`${subject}1`,type:"공통과목",credits:9,rankGrade:2,achievement:"A"},
    {grade:1,semester:2,subject,name:`${subject}2`,type:"일반선택",credits:8,rankGrade:2,achievement:"A"},
    {grade:2,semester:1,subject,name:`${subject}3`,type:"일반선택",credits:8,rankGrade:2,achievement:"A"},
    {grade:2,semester:2,subject,name:`${subject}4`,type:"일반선택",credits:1,rankGrade:5,achievement:"E"},
  ]).concat([
    {grade:2,semester:1,subject:"과학",name:"진로1",type:"진로선택",credits:2,rankGrade:3,achievement:"C"},
    {grade:2,semester:2,subject:"수학",name:"진로2",type:"진로선택",credits:2,rankGrade:3,achievement:"C"},
    {grade:3,semester:1,subject:"영어",name:"진로3",type:"진로선택",credits:2,rankGrade:3,achievement:"C"},
    {grade:3,semester:1,subject:"국어",name:"진로4",type:"진로선택",credits:1,rankGrade:5,achievement:"E"},
  ]);
  const out = calc.calculate(rule,courses,{schoolViolenceLevel:9});
  assert.equal(out.blocked,false);
  assert.equal(out.selected.length,15);
  assert.equal(out.selected.filter((course)=>course.type==="진로선택").length,3);
  assert.equal(out.selected.some((course)=>course.name.endsWith("4")),false);
  assert.equal(out.rawAverage,96.9811);
  assert.equal(out.creditThresholdAcademicBonus,96.9811);
  assert.equal(out.schoolViolence.deduction,90);
  assert.equal(out.total,976.79);
  assert.equal(out.attendance,null);
});
test("명지대 인문사회계열은 전 반영교과 이수학점 평균·학점가산·출결을 1000점으로 환산한다", () => {
  const rule = global.SCORE_RULES.find((r) => r.id === "myongji-humanities-2028");
  const out = calc.calculate(rule, [
    {grade:1,semester:1,subject:"국어",name:"국어",type:"공통과목",credits:4,rankGrade:1},
    {grade:1,semester:2,subject:"수학",name:"수학",type:"일반선택",credits:4,rankGrade:2},
    {grade:2,semester:1,subject:"과학",name:"물리",type:"일반선택",credits:3,rankGrade:1},
  ], {unexcusedAbsence:2,tardy:9});
  assert.equal(out.blocked, false);
  assert.equal(out.selected.length, 2);
  assert.equal(out.rawAverage, 98);
  assert.equal(out.selectedCreditBonus, 3.6);
  assert.equal(out.academicScore, 885.6);
  assert.equal(out.attendance.score, 98);
  assert.equal(out.total, 983.6);
});
test("명지대는 학교폭력 복합표 열 검수 전 해당 입력을 조건부 차단한다", () => {
  const rule = global.SCORE_RULES.find((r) => r.id === "myongji-natural-2028");
  const out = calc.calculate(rule, [
    {grade:1,semester:1,subject:"수학",name:"수학",type:"공통과목",credits:3,rankGrade:1},
  ], {schoolViolenceLevel:4});
  assert.equal(out.blocked, true);
  assert.match(out.missing.join(" "), /학교폭력/);
});
test("전남대 일반 교과전형은 이수학점 가중 교과·3/5단계 성취도·출결·학교폭력을 합산한다", () => {
  const rule = global.SCORE_RULES.find((r) => r.id === "jnu-gyogwa-common-nonhumanities-2028");
  const out = calc.calculate(rule, [
    {grade:1,semester:1,subject:"국어",name:"공통국어",type:"공통과목",credits:4,rankGrade:1},
    {grade:1,semester:2,subject:"수학",name:"공통수학",type:"일반선택",credits:4,rankGrade:2},
    {grade:2,semester:1,subject:"과학",name:"물리",type:"진로선택",credits:3,achievement:"A",achievementScale:"5"},
    {grade:2,semester:2,subject:"사회",name:"사회문제",type:"융합선택",credits:2,achievement:"B",achievementScale:"3"},
    {grade:3,semester:1,subject:"영어",name:"영어문화",type:"진로선택",credits:2,achievement:"C",achievementScale:"5"},
  ], {unexcusedAbsence:1,tardy:2,early:1,missingClass:1,schoolViolenceLevel:1});
  assert.equal(out.blocked, false);
  assert.equal(out.rawAverage, 95);
  assert.equal(out.supplementalAchievementBonus, 11);
  assert.equal(out.academicScore, 884.75);
  assert.equal(out.attendance.total, 2);
  assert.equal(out.attendance.score, 99.048);
  assert.equal(out.schoolViolence.deduction, 25);
  assert.equal(out.total, 958.798);
});
test("전남대는 성취도 단계가 없거나 진로·융합선택이 3과목 미만이면 임의 계산하지 않는다", () => {
  const rule = global.SCORE_RULES.find((r) => r.id === "jnu-gyogwa-common-nonhumanities-2028");
  const base = [{grade:1,semester:1,subject:"국어",name:"국어",type:"공통과목",credits:3,rankGrade:1}];
  const noScale = calc.calculate(rule, base.concat([
    {grade:2,semester:1,subject:"국어",name:"진로1",type:"진로선택",credits:2,achievement:"A"},
    {grade:2,semester:1,subject:"수학",name:"진로2",type:"진로선택",credits:2,achievement:"B",achievementScale:"5"},
    {grade:2,semester:1,subject:"영어",name:"진로3",type:"진로선택",credits:2,achievement:"C",achievementScale:"5"},
  ]), {});
  assert.equal(noScale.blocked, true);
  assert.match(noScale.missing.join(" "), /성취도 단계/);
  const shortage = calc.calculate(rule, base.concat([
    {grade:2,semester:1,subject:"국어",name:"진로1",type:"진로선택",credits:2,achievement:"A",achievementScale:"5"},
    {grade:2,semester:1,subject:"수학",name:"진로2",type:"진로선택",credits:2,achievement:"B",achievementScale:"5"},
  ]), {});
  assert.equal(shortage.blocked, true);
  assert.match(shortage.missing.join(" "), /비교내신/);
});
test("울산대 일반 모집단위는 공개된 상위12과목 교과 800점 구성점수를 계산한다",()=>{
  const rule=global.SCORE_RULES.find((r)=>r.id==="ulsan-student-record-2028");
  const courses=["국어","수학","영어"].flatMap((subject)=>
    Array.from({length:4},(_,i)=>({grade:i<2?1:2,semester:i%2+1,subject,name:`${subject}${i+1}`,type:i===3?"진로선택":"일반선택",credits:i===0?1:3,rankGrade:i+1}))
  ).concat(Array.from({length:5},(_,i)=>({grade:i<3?1:2,semester:i%2+1,subject:i%2?"사회":"과학",name:`탐구${i+1}`,type:"일반선택",credits:3,rankGrade:i+1})));
  const out=calc.calculate(rule,courses,{});
  assert.equal(out.blocked,false);
  assert.equal(out.status,"일부 계산 가능");
  assert.equal(out.selected.length,12);
  assert.equal(out.selected.some((course)=>course.credits===1),false);
  assert.equal(out.rawAverage,2.75);
  assert.equal(out.academicScore,666.015);
  assert.equal(out.total,666.015);
  assert.equal(out.maximumScore,1000);
});
test("인천대 인문계열은 교과별 평균등급 구간·교과비율·이수학점 가산을 적용한다",()=>{
  const rule=global.SCORE_RULES.find((r)=>r.id==="inu-gyogwa-humanities-2028");
  const out=calc.calculate(rule,[
    {grade:1,semester:1,subject:"국어",name:"국어",type:"공통과목",credits:3,rankGrade:1},
    {grade:1,semester:1,subject:"수학",name:"수학",type:"공통과목",credits:3,rankGrade:2},
    {grade:1,semester:1,subject:"영어",name:"영어",type:"공통과목",credits:3,rankGrade:3},
    {grade:1,semester:1,subject:"사회",name:"사회",type:"일반선택",credits:3,rankGrade:4}
  ],{});
  assert.equal(out.blocked,false);
  assert.equal(out.rawAverage,307.7);
  assert.equal(out.selectedCreditBonus,0.6);
  assert.equal(out.academicScore,308.3);
  assert.equal(out.total,308.3);
});
test("인천대는 반영교과가 없으면 해당 교과 최저점, 학교폭력 입력 시 조건부 차단을 적용한다",()=>{
  const rule=global.SCORE_RULES.find((r)=>r.id==="inu-gyogwa-natural-2028");
  const courses=[
    {grade:1,semester:1,subject:"국어",name:"국어",type:"공통과목",credits:2,rankGrade:1},
    {grade:1,semester:1,subject:"수학",name:"수학",type:"공통과목",credits:2,rankGrade:1},
    {grade:1,semester:1,subject:"영어",name:"영어",type:"공통과목",credits:2,rankGrade:1}
  ];
  const out=calc.calculate(rule,courses,{});
  assert.equal(out.blocked,false);
  assert.equal(out.rawAverage,320);
  assert.equal(out.total,320.3);
  assert.equal(calc.calculate(rule,courses,{schoolViolenceLevel:4}).blocked,true);
});
test("서경대 언어위주 5등급제는 교과별 이수학점 평균과 50:10:10:30 비율을 적용한다", () => {
  const rule = global.SCORE_RULES.find(
    (r) => r.id === "sku-language-component-2028",
  );
  const courses = [
    ["국어", 1, "A"],
    ["영어", 2, "B"],
    ["수학", 3, "C"],
    ["사회", 4, "D"],
  ].map(([subject, rankGrade, achievement], index) => ({
    grade: 1,
    semester: index % 2 + 1,
    subject,
    name: `${subject} 과목`,
    type: "일반선택",
    credits: 4,
    rankGrade,
    achievement,
  }));
  const out = calc.calculate(rule, courses, {});
  assert.equal(out.blocked, false);
  assert.equal(out.rawAverage, 96.6);
  assert.equal(out.total, 96.6);
});
test("대구한의대·예원예술대·차의과학대는 미공개 환산표를 추정하지 않는다", () => {
  for (const id of [
    "dhu-student-record-2028",
    "yewon-student-record-2028",
    "cha-student-record-2028",
  ]) {
    const out = calc.calculate(
      global.SCORE_RULES.find((r) => r.id === id),
      [],
      {},
    );
    assert.equal(out.blocked, true);
  }
});
test("광주여대는 표에 정확히 일치하는 평균등급의 교과·출결·학교폭력을 계산한다", () => {
  const rule = global.SCORE_RULES.find((r) => r.id === "kwu-student-record-2028");
  const courses = Array.from({ length: 35 }, (_, index) => ({
    grade: index < 12 ? 1 : index < 24 ? 2 : 3,
    semester: 1,
    subject: ["국어", "수학", "영어", "사회", "과학", "한국사"][index % 6],
    name: `반영과목${index + 1}`,
    type: "일반선택",
    credits: 2,
    rankGrade: 2,
  }));
  const out = calc.calculate(rule, courses, {
    unexcusedAbsence: 0,
    schoolViolenceLevel: 6,
  });
  assert.equal(out.blocked, false);
  assert.equal(out.rawAverage, 2);
  assert.equal(out.academicScore, 275);
  assert.equal(out.attendance.score, 35);
  assert.equal(out.total, 303);
});
test("광주여대는 0.5단계 사이 평균등급을 임의 보간하지 않는다", () => {
  const rule = global.SCORE_RULES.find((r) => r.id === "kwu-student-record-2028");
  const out = calc.calculate(rule, [
    { grade:1, semester:1, subject:"국어", name:"국어", type:"공통과목", credits:4, rankGrade:2 },
    { grade:1, semester:1, subject:"영어", name:"영어", type:"공통과목", credits:1, rankGrade:3 },
  ], { unexcusedAbsence: 0 });
  assert.equal(out.blocked, true);
  assert.equal(out.status, "계산 기준 불충분");
});
test("동의대 학생부교과는 상위 15과목 합계와 출결·학교폭력 총점 감점을 적용한다", () => {
  const rule = global.SCORE_RULES.find((r) => r.id === "deu-gyogwa-2028");
  const courses = Array.from({ length: 15 }, (_, index) => ({
    grade: index < 10 ? 1 : 2,
    semester: index % 2 + 1,
    subject: ["국어", "수학", "영어", "사회", "과학"][index % 5],
    name: `과목${index + 1}`,
    type: "일반선택",
    credits: 2,
    rankGrade: Math.floor(index / 5) + 1,
  }));
  const out = calc.calculate(rule, courses, {
    unexcusedAbsence: 2,
    tardy: 3,
    schoolViolenceLevel: 1,
  });
  assert.equal(out.academicScore, 675);
  assert.equal(out.attendance.score, 75);
  assert.equal(out.schoolViolence.deduction, 50);
  assert.equal(out.total, 700);
});
test("서울시립대는 석차등급 환산식 미공개 상태에서 계산을 차단한다", () => {
  const out = calc.calculate(
    global.SCORE_RULES.find((r) => r.id === "uos-student-record-2028"),
    [],
    {},
  );
  assert.equal(out.blocked, true);
});
test("고려대 학교추천은 석차등급 또는 성취도를 이수학점 가중해 80점으로 환산한다", () => {
  const rule = global.SCORE_RULES.find(
    (r) => r.id === "korea-school-recommendation-2028",
  );
  const out = calc.calculate(
    rule,
    [
      { grade: 1, semester: 1, subject: "국어", name: "국어", type: "공통과목", credits: 3, rankGrade: 1 },
      { grade: 1, semester: 1, subject: "과학", name: "과학", type: "진로선택", credits: 2, achievement: "B" },
    ],
    {},
  );
  assert.equal(out.rawAverage, 98);
  assert.equal(out.total, 78.4);
});
test("부산대 교과우수는 전 반영과목 이수학점 가중평균을 80점으로 환산한다", () => {
  const rule = global.SCORE_RULES.find((r) => r.id === "pusan-gyogwa80-2028");
  const out = calc.calculate(
    rule,
    [
      { grade: 1, semester: 1, subject: "국어", name: "국어", type: "공통과목", credits: 3, rankGrade: 1 },
      { grade: 1, semester: 1, subject: "영어", name: "영어", type: "일반선택", credits: 2, rankGrade: 2 },
    ],
    {},
  );
  assert.equal(out.rawAverage, 99.2);
  assert.equal(out.total, 79.36);
});
test("고신대·금강대·남부대와 부산교대 정성전형은 임의 계산하지 않는다", () => {
  for (const id of [
    "kosin-student-record-2028",
    "geumgang-student-record-2028",
    "nambu-student-record-2028",
    "bnue-integrated-record-2028",
  ]) {
    const out = calc.calculate(global.SCORE_RULES.find((r) => r.id === id), [], {});
    assert.equal(out.blocked, true);
  }
});
test("강원대 제2캠퍼스는 교과등급·성취도 학점평균과 출결·학교폭력을 반영한다",()=>{
  const rule=global.SCORE_RULES.find((r)=>r.id==="kangwon-campus2-general-2028");
  const out=calc.calculate(rule,[
    {grade:1,semester:1,subject:"국어",name:"국어",type:"공통과목",credits:4,rankGrade:1,achievement:"A"},
    {grade:1,semester:2,subject:"수학",name:"수학",type:"일반선택",credits:4,rankGrade:2,achievement:"B"},
    {grade:2,semester:1,subject:"과학",name:"융합과학",type:"융합선택",credits:3,rankGrade:1,achievement:"A"},
  ],{unexcusedAbsence:1,tardy:2,early:1,missingClass:1,schoolViolenceLevel:3});
  assert.equal(out.blocked,false);
  assert.equal(out.selected.length,2);
  assert.equal(out.excluded.some((course)=>course.name==="융합과학"),true);
  assert.equal(out.rawAverage,485);
  assert.equal(out.academicScore,975.5);
  assert.equal(out.attendance.total,2);
  assert.equal(out.attendance.score,-3);
  assert.equal(out.schoolViolence.deduction,97.25);
  assert.equal(out.total,875.25);
});
test("강원대 제2캠퍼스 학교폭력 8호 이상은 부적격 처리한다",()=>{
  const rule=global.SCORE_RULES.find((r)=>r.id==="kangwon-campus2-arts-2028");
  const out=calc.calculate(rule,[{grade:1,semester:1,subject:"국어",name:"국어",type:"일반선택",credits:3,rankGrade:1,achievement:"A"}],{schoolViolenceLevel:8});
  assert.equal(out.disqualified,true);
  assert.equal(out.total,null);
});
test("동국대 서울 학생부교과는 공통과목을 제외한 상위10과목 정량 700점을 계산한다",()=>{
  const rule=global.SCORE_RULES.find((r)=>r.id==="dongguk-seoul-gyogwa-2028");
  const courses=Array.from({length:10},(_,i)=>({grade:i<5?1:2,semester:i%2+1,subject:["국어","수학","영어","사회","과학"][i%5],name:`선택${i+1}`,type:i%2?"일반선택":"진로선택",credits:2,rankGrade:1,achievement:"A"})).concat([
    {grade:1,semester:1,subject:"수학",name:"공통수학",type:"공통과목",credits:4,rankGrade:1,achievement:"A"}
  ]);
  const out=calc.calculate(rule,courses,{schoolViolenceLevel:1});
  assert.equal(out.blocked,false);
  assert.equal(out.status,"일부 계산 가능");
  assert.equal(out.selected.length,10);
  assert.equal(out.selected.some((course)=>course.type==="공통과목"),false);
  assert.equal(out.rawAverage,100);
  assert.equal(out.academicScore,700);
  assert.equal(out.schoolViolence.deduction,100);
  assert.equal(out.total,600);
});
test("동국대 서울 학생부교과는 학교폭력 6호 이상을 부적격 처리한다",()=>{
  const rule=global.SCORE_RULES.find((r)=>r.id==="dongguk-seoul-gyogwa-2028");
  const courses=Array.from({length:10},(_,i)=>({grade:1,semester:1,subject:"국어",name:`국어${i}`,type:"일반선택",credits:2,rankGrade:1,achievement:"A"}));
  const out=calc.calculate(rule,courses,{schoolViolenceLevel:6});
  assert.equal(out.disqualified,true);
  assert.equal(out.total,null);
});
test("서울기독대 일반전형은 학년별 상위 7과목과 30:30:40 및 출결을 적용한다", () => {
  const rule = global.SCORE_RULES.find((r) => r.id === "scu-general-2028");
  const courses = [1, 2, 3].flatMap((grade) =>
    Array.from({ length: 7 }, (_, index) => ({
      grade,
      semester: grade === 3 ? 1 : index % 2 + 1,
      subject: "국어",
      name: `${grade}학년과목${index + 1}`,
      type: "일반선택",
      credits: 2,
      rankGrade: 1,
    })),
  );
  const out = calc.calculate(rule, courses, { unexcusedAbsence: 0 });
  assert.equal(out.academicScore, 400);
  assert.equal(out.attendance.score, 100);
  assert.equal(out.total, 500);
});
test("성결대 2028 졸업예정자는 상위 12과목의 석차 80%와 성취도 20%를 반영한다", () => {
  const rule = global.SCORE_RULES.find((r) => r.id === "sungkyul-gyogwa-2028");
  const courses = Array.from({ length: 12 }, (_, index) => ({
    grade: index < 6 ? 1 : 2,
    semester: index % 2 + 1,
    subject: ["국어", "수학", "영어", "사회", "과학"][index % 5],
    name: `과목${index + 1}`,
    type: "일반선택",
    credits: 2,
    rankGrade: 1,
    achievement: "A",
  }));
  const out = calc.calculate(rule, courses, {});
  assert.equal(out.academicScore, 1000);
  assert.equal(out.total, 1000);
});
test("서울교대·서울한영대·연세대 서울·우석대·홍익대는 미공개 분기를 추정하지 않는다", () => {
  for (const id of [
    "snue-recommendation-2028",
    "shyu-student-record-2028",
    "yonsei-seoul-recommendation-2028",
    "woosuk-student-record-2028",
    "hongik-student-record-2028",
  ]) {
    const out = calc.calculate(global.SCORE_RULES.find((r) => r.id === id), [], {});
    assert.equal(out.blocked, true);
  }
});
test("조선대 교과전형은 전 반영과목 학점평균·융합선택 가산·출결·학교폭력을 합산한다", () => {
  const rule=global.SCORE_RULES.find((r)=>r.id==="chosun-gyogwa-2028");
  const out=calc.calculate(rule,[
    {grade:1,semester:1,subject:"국어",name:"국어",type:"공통과목",credits:4,rankGrade:1},
    {grade:1,semester:2,subject:"수학",name:"수학",type:"일반선택",credits:4,rankGrade:2},
    {grade:2,semester:1,subject:"과학",name:"융합1",type:"융합선택",credits:2,achievement:"A"},
    {grade:2,semester:2,subject:"사회",name:"융합2",type:"융합선택",credits:2,achievement:"B"},
  ],{unexcusedAbsence:1,tardy:2,early:1,missingClass:1,schoolViolenceLevel:1});
  assert.equal(out.blocked,false);
  assert.equal(out.selected.length,2);
  assert.equal(out.rawAverage,44.5);
  assert.equal(out.topAchievementAverageBandBonus,1.5);
  assert.equal(out.academicScore,446);
  assert.equal(out.attendance.total,2.3);
  assert.equal(out.attendance.score,48.85);
  assert.equal(out.schoolViolence.deduction,5);
  assert.equal(out.total,489.85);
});
test("조선대 융합선택 가산점은 상위 2과목을 확인할 수 없으면 임의 산출하지 않는다",()=>{
  const rule=global.SCORE_RULES.find((r)=>r.id==="chosun-gyogwa-2028");
  const out=calc.calculate(rule,[
    {grade:1,semester:1,subject:"국어",name:"국어",type:"공통과목",credits:3,rankGrade:1},
    {grade:2,semester:1,subject:"과학",name:"융합",type:"융합선택",credits:2,achievement:"A"},
  ],{});
  assert.equal(out.blocked,true);
  assert.match(out.missing.join(" "),/2개 이상/);
});
test("추계예술대 콘텐츠창작학부는 국영수 이수단위 가중점수를 1000점으로 환산한다", () => {
  const rule = global.SCORE_RULES.find((r) => r.id === "chugye-content-2028");
  const out = calc.calculate(rule, [
    { grade:1, semester:1, subject:"국어", name:"국어", type:"공통과목", credits:3, rankGrade:1 },
    { grade:1, semester:1, subject:"영어", name:"영어", type:"일반선택", credits:2, rankGrade:2 },
  ], {});
  assert.equal(out.rawAverage, 98);
  assert.equal(out.total, 980);
});
test("한국공학대 공학계열은 네 교과별 상위 4과목을 500점으로 환산한다", () => {
  const rule = global.SCORE_RULES.find((r) => r.id === "tukorea-gyogwa-2028");
  const courses = ["국어","수학","영어","과학"].flatMap((subject) =>
    Array.from({length:4}, (_, index) => ({ grade:index < 2 ? 1 : 2, semester:index % 2 + 1, subject, name:`${subject}${index+1}`, type:"일반선택", credits:2, rankGrade:1 })),
  );
  const out = calc.calculate(rule, courses, {});
  assert.equal(out.selected.length, 16);
  assert.equal(out.total, 500);
});
test("동명대 등 공개 환산식이 불완전한 대학은 총점을 계산하지 않는다", () => {
  for (const id of ["tu-student-record-2028","sookmyung-student-record-2028","chodang-student-record-2028","htus-student-record-2028"]) {
    const out = calc.calculate(global.SCORE_RULES.find((r) => r.id === id), [], {});
    assert.equal(out.blocked, true);
  }
});
test("신한대 학생부100% 전형은 상위12과목을 이수단위 가중해 1000점으로 환산한다", () => {
  const rule = global.SCORE_RULES.find((r) => r.id === "shinhan-record-1000-2028");
  const courses = Array.from({length:13},(_,i)=>({grade:i<8?1:2,semester:(i%2)+1,subject:["국어","영어","수학","사회","과학"][i%5],name:`과목${i}`,type:"일반선택",credits:i===12?10:2,rankGrade:i===12?5:(i%5)+1}));
  const out = calc.calculate(rule,courses,{schoolViolenceLevel:2});
  assert.equal(out.blocked,false);
  assert.equal(out.selected.length,12);
  assert.equal(out.excluded.length,1);
  assert.equal(out.rawAverage,86.25);
  assert.equal(out.academicScore,862.5);
  assert.equal(out.total,762.5);
});
test("신한대 일반전형은 면접을 제외한 교과 550점 구성점수만 계산한다", () => {
  const rule = global.SCORE_RULES.find((r) => r.id === "shinhan-general-component-2028");
  const courses = Array.from({length:12},(_,i)=>({grade:i<8?1:2,semester:(i%2)+1,subject:["국어","영어","수학","사회","과학"][i%5],name:`과목${i}`,type:"일반선택",credits:2,rankGrade:1}));
  const out = calc.calculate(rule,courses,{});
  assert.equal(out.blocked,false);
  assert.equal(out.status,"일부 계산 가능");
  assert.equal(out.academicScore,550);
  assert.equal(out.total,550);
  assert.equal(out.maximumScore,1000);
});
test("국립공주대는 이수학점 가중 교과 900점과 미인정 출결 100점을 합산한다", () => {
  const rule = global.SCORE_RULES.find((r) => r.id === "kongju-student-record-2028");
  const out = calc.calculate(rule, [
    { grade:1, semester:1, subject:"국어", name:"국어", type:"공통과목", credits:3, rankGrade:1 },
    { grade:1, semester:1, subject:"과학", name:"과학융합", type:"융합선택", credits:2, achievement:"B" },
  ], { unexcusedAbsence:4, tardy:2, early:1 });
  assert.equal(out.rawAverage, 7.2);
  assert.equal(out.academicScore, 860);
  assert.equal(out.attendance.total, 5);
  assert.equal(out.attendance.score, 97);
  assert.equal(out.total, 957);
});
test("한국해양대의 미공개 평균등급 환산식은 총점을 내지 않는다", () => {
  for (const id of ["kmou-student-record-2028"]) {
    const out = calc.calculate(global.SCORE_RULES.find((r) => r.id === id), [], {});
    assert.equal(out.blocked, true);
  }
});
test("동신대는 미공개 이수단위 가산점을 제외한 교과 구성점수를 계산한다", () => {
  const rule = global.SCORE_RULES.find((r) => r.id === "dongsin-student-record-2028");
  const out = calc.calculate(rule,[
    {grade:1,semester:1,subject:"국어",name:"국어",type:"공통과목",credits:3,rankGrade:1},
    {grade:1,semester:1,subject:"수학",name:"수학",type:"공통과목",credits:2,rankGrade:3},
  ],{});
  assert.equal(out.blocked,false);
  assert.equal(out.status,"일부 계산 가능");
  assert.equal(out.rawAverage,90);
  assert.equal(out.academicScore,900);
  assert.equal(out.total,900);
  const violence = calc.calculate(rule,[{grade:1,semester:1,subject:"국어",name:"국어",type:"공통과목",credits:3,rankGrade:1}],{schoolViolenceLevel:4});
  assert.equal(violence.blocked,true);
});
test("후속 검수 대학은 미공개 표나 미구현 분기를 임의 계산하지 않는다", () => {
  for (const id of ["catholic-daejeon-record-2028","dongseo-record-2028","ytus-record-2028","hanyang-seoul-record-2028","knue-record-2028"]) {
    const out = calc.calculate(global.SCORE_RULES.find((r) => r.id === id), [], {});
    assert.equal(out.blocked, true);
  }
});
test("서울여대 교과우수자는 60학점 이상 교과 90점과 출결 10점을 계산한다", () => {
  const rule = global.SCORE_RULES.find((r) => r.id === "swu-gyogwa-2028");
  const courses = Array.from({length:20}, (_, index) => { const grade=index<8?1:index<16?2:3; return {grade,semester:grade===3?1:index%2+1,subject:["국어","수학","영어","사회","과학","한국사"][index%6],name:`과목${index+1}`,type:"일반선택",credits:3,rankGrade:index<10?1:2}; });
  const out = calc.calculate(rule, courses, {unexcusedAbsence:4,tardy:2,early:1,missingClass:1});
  assert.equal(out.academicScore, 88.2);
  assert.equal(out.attendance.score, 8.3);
  assert.equal(out.total, 96.5);
});
test("서울여대 교과우수자는 반영교과 60학점 미만이면 지원자격 미충족으로 차단한다", () => {
  const rule = global.SCORE_RULES.find((r) => r.id === "swu-gyogwa-2028");
  const out = calc.calculate(rule,[{grade:1,semester:1,subject:"국어",name:"국어",type:"공통과목",credits:3,rankGrade:1}],{});
  assert.equal(out.blocked,true);
  assert.equal(out.status,"지원자격 미충족");
});
test("신규 검수 대학의 불완전 규칙은 총점을 확정하지 않는다", () => {
  for (const id of ["acts-record-2028","u1-record-2028","iccu-record-2028","cau-record-2028","hknu-record-2028","gnue-record-2028"]) {
    const out=calc.calculate(global.SCORE_RULES.find((r)=>r.id===id),[],{});
    assert.equal(out.blocked,true);
  }
});
test("칼빈대는 계열별 반영교과와 진로선택 환산등급 및 학교폭력 감점을 적용한다", () => {
  const humanities = global.SCORE_RULES.find((r) => r.id === "calvin-humanities-arts-2028");
  const humanitiesOut = calc.calculate(humanities, [
    {grade:1,semester:1,subject:"영어",name:"공통영어",type:"공통과목",credits:4,rankGrade:1},
    {grade:2,semester:1,subject:"영어",name:"영어권 문화",type:"진로선택",credits:2,achievement:"A"},
    {grade:2,semester:2,subject:"과학",name:"물리학",type:"일반선택",credits:4,rankGrade:5},
  ], {schoolViolenceLevel:2});
  assert.equal(humanitiesOut.blocked, false);
  assert.equal(humanitiesOut.selected.length, 2);
  assert.equal(humanitiesOut.academicScore, 49.8);
  assert.equal(humanitiesOut.total, 44.8);

  const natural = global.SCORE_RULES.find((r) => r.id === "calvin-natural-2028");
  const naturalOut = calc.calculate(natural, [
    {grade:1,semester:1,subject:"과학",name:"통합과학",type:"공통과목",credits:3,achievement:"C"},
    {grade:2,semester:1,subject:"과학",name:"생명과학",type:"진로선택",credits:5,achievement:"B"},
  ], {});
  assert.equal(naturalOut.blocked, false);
  assert.equal(naturalOut.rawAverage, 3.5);
  assert.equal(naturalOut.total, 39.3);
});
test("한국항공대 공학계열은 교과별 평균과 20·20·30·30 비율을 적용한다", () => {
  const rule = global.SCORE_RULES.find((r) => r.id === "kau-engineering-2028");
  const courses = [
    ...Array.from({length:3},(_,i)=>({grade:1,semester:1,subject:"국어",name:`국어${i}`,type:"일반선택",credits:2,rankGrade:1})),
    ...Array.from({length:3},(_,i)=>({grade:1,semester:1,subject:"영어",name:`영어${i}`,type:"일반선택",credits:2,rankGrade:2})),
    ...Array.from({length:3},(_,i)=>({grade:2,semester:1,subject:"수학",name:`수학${i}`,type:"일반선택",credits:2,rankGrade:3})),
    ...Array.from({length:3},(_,i)=>({grade:2,semester:1,subject:"과학",name:`과학${i}`,type:i===2?"진로선택":"일반선택",credits:2,rankGrade:4,achievement:i===2?"D":""})),
  ];
  const out = calc.calculate(rule, courses, { schoolViolenceLevel: 4 });
  assert.equal(out.blocked, false);
  assert.equal(out.rawAverage, 96.6);
  assert.equal(out.academicScore, 966);
  assert.equal(out.total, 936);
  assert.equal(out.maximumScore, 1000);
});
test("한국항공대 공학계열은 교과별 최소 반영과목 수가 부족하면 차단한다", () => {
  const rule = global.SCORE_RULES.find((r) => r.id === "kau-engineering-2028");
  const out = calc.calculate(rule, [
    {grade:1,semester:1,subject:"국어",name:"국어",type:"공통과목",credits:2,rankGrade:1},
    {grade:1,semester:1,subject:"영어",name:"영어",type:"공통과목",credits:2,rankGrade:1},
    {grade:1,semester:1,subject:"수학",name:"수학",type:"공통과목",credits:2,rankGrade:1},
    {grade:1,semester:1,subject:"과학",name:"과학",type:"공통과목",credits:2,rankGrade:1},
  ], {});
  assert.equal(out.blocked, true);
  assert.match(out.missing.join(" "), /3개 이상/);
});
test("한국항공대 유형Ⅰ 비공학계열은 사회와 과학 중 높은 교과군을 반영한다", () => {
  const rule = global.SCORE_RULES.find((r) => r.id === "kau-humanities-type1-2028");
  const make = (subject, grades) => grades.map((rankGrade, i) => ({grade:i < 2 ? 1 : 2,semester:(i % 2)+1,subject,name:`${subject}${i}`,type:"일반선택",credits:2,rankGrade}));
  const courses = [
    ...make("국어", [1,1,1]), ...make("영어", [2,2,2]), ...make("수학", [3,3,3]),
    ...make("사회", [4,4,4]), ...make("과학", [1,1,1]),
  ];
  const out = calc.calculate(rule, courses, {});
  assert.equal(out.blocked, false);
  assert.equal(out.rawAverage, 98.2);
  assert.equal(out.total, 982);
});
test("한국항공대 유형Ⅱ 공학계열은 교과별 상위5과목과 진로선택 최대3과목을 가산한다", () => {
  const rule = global.SCORE_RULES.find((r) => r.id === "kau-engineering-type2-2028");
  const subjects = ["국어","영어","수학","과학"];
  const courses = subjects.flatMap((subject) => Array.from({length:6},(_,i)=>({grade:i<4?1:2,semester:(i%2)+1,subject,name:`${subject}${i}`,type:i<3?"진로선택":"일반선택",credits:2,rankGrade:i+1,achievement:i===0?"A":i===1?"B":"C"})));
  const out = calc.calculate(rule, courses, {});
  assert.equal(out.blocked, false);
  assert.equal(out.selected.length, 20);
  assert.equal(out.rawAverage, 98);
  assert.equal(out.supplementalAchievementBonus, 6);
  assert.equal(out.total, 986);
});
test("성균관대 추천인재는 공통·선택 정량평가 700점만 계산하고 정성 300점은 제외한다", () => {
  const rule = global.SCORE_RULES.find(
    (item) => item.id === "skku-recommendation-2028",
  );
  const out = calc.calculate(
    rule,
    [
      { grade: 1, semester: 1, subject: "국어", name: "공통국어", type: "공통과목", credits: 2, rankGrade: 1 },
      { grade: 1, semester: 2, subject: "수학", name: "공통수학", type: "공통과목", credits: 2, rankGrade: 2 },
      { grade: 2, semester: 1, subject: "영어", name: "영어Ⅰ", type: "일반선택", credits: 1, rankGrade: 1 },
      { grade: 2, semester: 2, subject: "사회", name: "사회문화", type: "일반선택", credits: 3, rankGrade: 3 },
    ],
    {},
  );
  assert.equal(out.blocked, false);
  assert.equal(out.status, "일부 계산 가능");
  assert.equal(out.academicScore, 665);
  assert.equal(out.total, 665);
  assert.equal(out.maximumScore, 1000);
  assert.equal(rule.componentMaximumScore, 700);
});
test("국립순천대 실기전형은 공개된 교과 250점만 계산하고 미복원 출결·학교폭력 점수는 제외한다", () => {
  const rule = global.SCORE_RULES.find((item) => item.id === "scnu-record-2028");
  const courses = [
    { grade: 1, semester: 1, subject: "국어", name: "국어", type: "공통과목", credits: 2, rankGrade: 1 },
    { grade: 2, semester: 1, subject: "과학", name: "과학", type: "일반선택", credits: 2, rankGrade: 3 },
  ];
  const out = calc.calculate(rule, courses, {});
  assert.equal(out.blocked, false);
  assert.equal(out.rawAverage, 2);
  assert.equal(out.academicScore, 187.5);
  assert.equal(out.total, 187.5);
  assert.equal(rule.componentMaximumScore, 250);
  const violence = calc.calculate(rule, courses, { schoolViolenceLevel: 4 });
  assert.equal(violence.blocked, true);
  assert.match(violence.missing.join(" "), /학교폭력/);
});
test("광주대 일반학생은 교과별 상위 4과목 평균등급과 출결을 1000점으로 환산한다", () => {
  const rule=global.SCORE_RULES.find((r)=>r.id==="gwangju-general-2028");
  const courses=["국어","영어","수학"].flatMap((subject)=>Array.from({length:4},(_,i)=>({grade:1,semester:i%2+1,subject,name:`${subject}${i+1}`,type:"일반선택",credits:2,rankGrade:1}))).concat(Array.from({length:4},(_,i)=>({grade:2,semester:i%2+1,subject:i<2?"사회":"과학",name:`탐구${i+1}`,type:"일반선택",credits:2,rankGrade:2})));
  const out=calc.calculate(rule,courses,{unexcusedAbsence:2});
  assert.equal(out.selected.length,16);
  assert.equal(out.rawAverage,1.25);
  assert.equal(out.academicScore,800);
  assert.equal(out.attendance.score,80);
  assert.equal(out.total,880);
});
test("서울과기대 고교추천은 80학점·3학기 이상 교과를 이수학점 가중한다", () => {
  const rule=global.SCORE_RULES.find((r)=>r.id==="seoultech-recommendation-2028");
  const courses=Array.from({length:20},(_,i)=>{const grade=i<7?1:i<14?2:3;return {grade,semester:grade===3?1:i%2+1,subject:["국어","수학","영어","사회","과학"][i%5],name:`과목${i+1}`,type:"일반선택",credits:4,rankGrade:i<10?1:2};});
  const out=calc.calculate(rule,courses,{});
  assert.equal(out.rawAverage,995);
  assert.equal(out.total,995);
});
test("서울과기대 고교추천은 반영교과가 80학점 미만이면 계산을 중단한다", () => {
  const rule=global.SCORE_RULES.find((r)=>r.id==="seoultech-recommendation-2028");
  const out=calc.calculate(rule,[{grade:1,semester:1,subject:"국어",name:"국어",type:"공통과목",credits:4,rankGrade:1}],{});
  assert.equal(out.status,"지원자격 미충족");
  assert.equal(out.blocked,true);
});
test("극동대 등 후속 대학은 미공개 환산표를 추정하지 않는다",()=>{
  for(const id of ["kdu-record-2028","ltu-record-2028","suwon-record-2028","sch-record-2028","inha-record-2028","joongbu-record-2028","kwangwoon-record-2028","cu-record-2028","dnue-record-2028"]){
    const out=calc.calculate(global.SCORE_RULES.find((r)=>r.id===id),[],{});
    assert.equal(out.blocked,true);
  }
});
test("교육대·신학대·예술대 후속 검수 규칙은 미공개 점수를 임의 계산하지 않는다",()=>{
  for(const id of ["cue-jinju-record-2028","cue-cheongju-record-2028","stu-record-2028","sjs-record-2028","suwon-catholic-record-2028","ysu-record-2028","youngsan-seonhak-record-2028","inje-record-2028","kbtus-record-2028","gwangju-catholic-record-2028","dgau-record-2028","sgju-record-2028","snu-record-2028"]){
    const out=calc.calculate(global.SCORE_RULES.find((r)=>r.id===id),[],{});
    assert.equal(out.blocked,true);
  }
});
test("광주가톨릭대와 한라대는 원문에서 확인한 선택·변환 기준을 보존하되 미공개 점수표를 추정하지 않는다",()=>{
  const gwangju=global.SCORE_RULES.find((r)=>r.id==="gwangju-catholic-record-2028");
  assert.equal(gwangju.region,"전남");
  assert.equal(gwangju.creditWeighting,true);
  assert.deepEqual(gwangju.achievementConversionByScale[3],{A:1,B:3,C:5});
  assert.deepEqual(gwangju.schoolViolenceRule.disqualifying,[5,6,7,8,9]);
  assert.equal(calc.calculate(gwangju,[],{}).blocked,true);

  const halla=global.SCORE_RULES.find((r)=>r.id==="halla-record-2028");
  assert.equal(halla.selectionRule.type,"topNWithTypeCap");
  assert.equal(halla.selectionRule.count,15);
  assert.deepEqual(halla.achievementConversion,{A:1,B:3,C:5});
  assert.equal(halla.maximumScore,5);
  assert.equal(halla.overallMaximumScore,400);
  assert.deepEqual(halla.overallSchoolViolenceRule.deductions,{1:3,2:3,3:3,4:5,5:5,6:20,7:20});
  assert.equal(calc.calculate(halla,[],{}).blocked,true);
});
test("한라대 구졸업자 교과 구성요소는 진로·융합 합산 5과목 상한과 이수단위 가중을 적용한다",()=>{
  const rule=global.SCORE_RULES.find((r)=>r.id==="halla-record-2028");
  const courses=[];
  for(let i=0;i<6;i++) courses.push({grade:1,semester:1,subject:"국어",name:`진로${i}`,type:"진로선택",credits:1,achievement:"A"});
  for(let i=0;i<10;i++) courses.push({grade:2,semester:1,subject:"영어",name:`일반${i}`,type:"일반선택",credits:i===0?4:1,rankGrade:i===0?2:3});
  courses.push({grade:2,semester:1,subject:"과학",name:"등급 없는 융합",type:"융합선택",credits:3,achievement:"A"});
  const out=calc.calculate(rule,courses,{});
  assert.equal(out.blocked,false);
  assert.equal(out.selected.length,15);
  assert.equal(out.selected.filter((c)=>["진로선택","융합선택"].includes(c.type)).length,5);
  assert.equal(out.selected.some((c)=>c.name==="등급 없는 융합"),false);
  assert.equal(out.academicScore,2.222);
});
test("인천가톨릭대 학교생활우수자 1단계는 학년비율과 진로선택 상위2과목 가산점을 계산한다",()=>{
  const rule=global.SCORE_RULES.find((r)=>r.id==="iccu-record-2028");
  const courses=[
    {grade:1,semester:1,subject:"국어",name:"국어",type:"공통과목",credits:3,rankGrade:1},
    {grade:2,semester:1,subject:"영어",name:"영어",type:"일반선택",credits:3,rankGrade:2},
    {grade:3,semester:1,subject:"수학",name:"수학",type:"일반선택",credits:3,rankGrade:3},
    {grade:2,semester:2,subject:"사회",name:"사회문제 탐구",type:"진로선택",credits:2,achievement:"A"},
    {grade:3,semester:1,subject:"과학",name:"과학과제 연구",type:"진로선택",credits:2,achievement:"B"}
  ];
  const out=calc.calculate(rule,courses,{});
  assert.equal(out.blocked,false);
  assert.equal(out.rawAverage,95.2);
  assert.equal(out.supplementalAchievementBonus,2.5);
  assert.equal(out.total,97.7);
  assert.equal(out.maximumScore,103);
  assert.equal(calc.calculate(rule,courses,{schoolViolenceLevel:1}).blocked,true);
});
test("화성의과학대 교과우수자는 상위9과목과 진로선택 상한 및 학교폭력을 반영한다",()=>{
  const rule=global.SCORE_RULES.find((r)=>r.id==="hwasung-record-2028");
  const grades=[1,2,3,4,5,1].map((rankGrade,index)=>({
    grade:index<2?1:index<4?2:3,semester:1,subject:["국어","영어","수학","사회","과학","국어"][index],
    name:`일반${index+1}`,type:"일반선택",credits:3,rankGrade
  }));
  const careers=["A","B","C"].map((achievement,index)=>({
    grade:index+1,semester:1,subject:["사회","과학","수학"][index],name:`진로${index+1}`,
    type:"진로선택",credits:2,achievement
  }));
  const out=calc.calculate(rule,grades.concat(careers),{schoolViolenceLevel:1});
  assert.equal(out.blocked,false);
  assert.equal(out.selected.length,9);
  assert.equal(out.academicScore,690);
  assert.equal(out.schoolViolence.deduction,2);
  assert.equal(out.total,688);
  assert.equal(calc.calculate(rule,grades.concat(careers),{schoolViolenceLevel:8}).status,"부적격");
});
test("동서대 일반계교과는 상위14과목을 1,000점으로 환산하고 학교폭력을 감점한다",()=>{
  const rule=global.SCORE_RULES.find((r)=>r.id==="dongseo-record-2028");
  const courses=Array.from({length:14},(_,index)=>({
    grade:index<5?1:index<10?2:3,semester:1,subject:["국어","영어","수학","사회","과학"][index%5],
    name:`과목${index+1}`,type:index%2?"일반선택":"공통과목",credits:3,rankGrade:index<7?1:2
  }));
  const out=calc.calculate(rule,courses,{schoolViolenceLevel:4});
  assert.equal(out.blocked,false);
  assert.equal(out.selected.length,14);
  assert.equal(out.rawAverage,99);
  assert.equal(out.academicScore,990);
  assert.equal(out.schoolViolence.deduction,20);
  assert.equal(out.total,970);
});
test("부산외대 일반고교과는 교과900점과 미인정 결석 출결 및 학교폭력을 합산한다",()=>{
  const rule=global.SCORE_RULES.find((r)=>r.id==="bufs-student-record-2028");
  const courses=Array.from({length:14},(_,index)=>({
    grade:index<5?1:index<10?2:3,semester:1,subject:["국어","수학","영어","사회","과학","제2외국어"][index%6],
    name:`반영${index+1}`,type:index%2?"일반선택":"공통과목",credits:3,rankGrade:1
  }));
  const out=calc.calculate(rule,courses,{unexcusedAbsence:2,tardy:99,schoolViolenceLevel:6});
  assert.equal(out.blocked,false);
  assert.equal(out.academicScore,900);
  assert.equal(out.attendance.total,2);
  assert.equal(out.attendance.score,98);
  assert.equal(out.schoolViolence.deduction,60);
  assert.equal(out.total,938);
  assert.equal(calc.calculate(rule,courses,{schoolViolenceLevel:8}).status,"부적격");
});
test("수원가톨릭대는 원문 5등급 교과표 오류 때문에 총점을 차단하되 공개된 비교과 기준은 보존한다",()=>{
  const rule=global.SCORE_RULES.find((r)=>r.id==="suwon-catholic-record-2028");
  const out=calc.calculate(rule,[
    {grade:1,semester:1,subject:"국어",name:"국어",type:"공통과목",credits:3,rankGrade:1,achievement:"A"}
  ],{unexcusedAbsence:0,volunteerHours:30,schoolViolenceLevel:1});
  assert.equal(out.blocked,true);
  assert.equal(out.status,"원문 확인 불가");
  assert.equal(rule.attendanceRule.bands[0][1],100);
  assert.equal(rule.volunteerRule.bands[0][1],100);
  assert.equal(rule.schoolViolenceRule.deductions[1],10);
  assert.match(rule.verificationStatus,/점수 역전.*등급구간 중복/);
});
test("최종 검수 대기 대학도 미공개 또는 정성평가 점수를 임의 계산하지 않는다",()=>{
  for(const id of ["hanseo-record-2028","dyu-record-2028","cup-record-2028","jnue-record-2028","bible-record-2028","khu-record-2028","bpu-record-2028","mmu-record-2028","daeshin-record-2028","ewha-record-2028","sangha-record-2028","cnue-record-2028","postech-record-2028","hoseo-record-2028","hwasung-record-2028"]){
    const out=calc.calculate(global.SCORE_RULES.find((r)=>r.id===id),[],{});
    assert.equal(out.blocked,true);
  }
});
test("구 대학명·공통 시행계획 캠퍼스 4곳도 원문 근거에 연결된다",()=>{
  for(const id of ["gwnu-main-integrated-2028","gwnu-campus2-integrated-2028","mokpo-campus2-record-2028","dyu-campus2-record-2028"]){
    const rule=global.SCORE_RULES.find((r)=>r.id===id);
    assert.ok(rule.evidence.planId);
    assert.ok(rule.evidence.file);
    const out=calc.calculate(rule,[],{});
    assert.equal(out.blocked,true);
  }
});
test("장로회신학대 학생부우수자는 석차80%와 성취도20%를 640점으로 환산한다",()=>{
  const rule=global.SCORE_RULES.find((r)=>r.id==="puts-record-2028");
  const out=calc.calculate(rule,[
    {grade:1,semester:1,subject:"국어",name:"국어",type:"공통과목",credits:3,rankGrade:1,achievement:"A"},
    {grade:1,semester:1,subject:"영어",name:"영어",type:"일반선택",credits:2,rankGrade:2,achievement:"B"}
  ],{});
  assert.equal(out.academicScore,608);
  assert.equal(out.total,608);
});
test("송원대 학생부우수자는 교과군별 상위2과목과 출결을 합산한다",()=>{
  const rule=global.SCORE_RULES.find((r)=>r.id==="songwon-record-2028");
  const courses=["국어","영어","수학"].flatMap((subject)=>[
    {grade:1,semester:1,subject,name:`${subject}1`,type:"일반선택",credits:2,rankGrade:1},
    {grade:2,semester:1,subject,name:`${subject}2`,type:"일반선택",credits:2,rankGrade:2}
  ]);
  const out=calc.calculate(rule,courses,{unexcusedAbsence:2});
  assert.equal(out.rawAverage,1);
  assert.equal(out.academicScore,750);
  assert.equal(out.attendance.score,246);
  assert.equal(out.total,996);
});
test("성공회대 교과성적전형은 상위12과목 합계에 기본점수480점을 더한다",()=>{
  const rule=global.SCORE_RULES.find((r)=>r.id==="skhu-record-2028");
  const courses=Array.from({length:12},(_,i)=>({grade:i<6?1:2,semester:i%2+1,subject:["국어","영어","수학","사회","과학","한국사"][i%6],name:`과목${i+1}`,type:"일반선택",credits:2,rankGrade:i<8?1:2}));
  const out=calc.calculate(rule,courses,{});
  assert.equal(out.academicScore,596);
  assert.equal(out.total,596);
});
test("아주대 고교추천은 일반과목 80:20과 융합선택 성취도 및 출결을 계산한다",()=>{
  const rule=global.SCORE_RULES.find((r)=>r.id==="ajou-recommendation-2028");
  const out=calc.calculate(rule,[
    {grade:1,semester:1,subject:"국어",name:"국어",type:"공통과목",credits:3,rankGrade:1,achievement:"A"},
    {grade:1,semester:1,subject:"영어",name:"영어",type:"일반선택",credits:2,rankGrade:2,achievement:"B"},
    {grade:2,semester:1,subject:"사회",name:"사회융합",type:"융합선택",credits:2,achievement:"A"}
  ],{unexcusedAbsence:4,tardy:2,early:1});
  assert.equal(out.rawAverage,98.857);
  assert.equal(out.academicScore,88.97);
  assert.equal(out.attendance.total,5);
  assert.equal(out.attendance.score,8);
  assert.equal(out.total,96.97);
});
test("아주대 고교추천은 일반과목의 석차등급이나 성취도가 빠지면 중단한다",()=>{
  const rule=global.SCORE_RULES.find((r)=>r.id==="ajou-recommendation-2028");
  const out=calc.calculate(rule,[{grade:1,semester:1,subject:"국어",name:"국어",type:"공통과목",credits:3,achievement:"A"}],{});
  assert.equal(out.blocked,true);
  assert.match(out.missing.join(" "),/석차등급/);
});
test("대전신학대는 학년별 상위3과목을 40:40:20으로 환산한다",()=>{
  const rule=global.SCORE_RULES.find((r)=>r.id==="daejeon-presbyterian-record-2028");
  const courses=[1,2,3].flatMap((grade)=>Array.from({length:3},(_,i)=>({grade,semester:grade===3?1:i%2+1,subject:["국어","영어","사회"][i],name:`${grade}학년${i+1}`,type:"일반선택",credits:2,rankGrade:grade})));
  const out=calc.calculate(rule,courses,{});
  assert.equal(out.selected.length,9);
  assert.equal(out.academicScore,580);
  assert.equal(out.total,580);
});
test("한림대 일반학과는 우수 3개 교과와 성취도·이수학점·출결·학교폭력을 합산한다",()=>{
  const rule=global.SCORE_RULES.find((r)=>r.id==="hallym-general-gyogwa-2028");
  const grades={국어:1,수학:2,영어:4,사회:3,과학:5};
  const courses=Object.entries(grades).flatMap(([subject,rankGrade])=>
    Array.from({length:3},(_,i)=>({
      grade:i<2?1:2,semester:i%2+1,subject,name:`${subject}${i+1}`,
      type:"일반선택",credits:6,rankGrade,achievement:"B"
    }))
  );
  const out=calc.calculate(rule,courses,{unexcusedAbsence:4,schoolViolenceLevel:4});
  assert.equal(out.blocked,false);
  assert.equal(out.selected.length,9);
  assert.equal(out.selected.some((course)=>course.subject==="사회"),true);
  assert.equal(out.selected.some((course)=>course.subject==="과학"),false);
  assert.equal(out.selected.some((course)=>course.subject==="영어"),false);
  assert.equal(out.rawAverage,2);
  assert.equal(out.academicScore,755);
  assert.equal(out.achievementWeightedAverageBonus,40);
  assert.equal(out.creditThresholdBonusBands,40);
  assert.equal(out.attendance.score,87.5);
  assert.equal(out.schoolViolence.deduction,50);
  assert.equal(out.total,792.5);
});
test("한림대 일반학과는 반영 가능한 교과가 3개 미만이면 계산을 중단한다",()=>{
  const rule=global.SCORE_RULES.find((r)=>r.id==="hallym-general-gyogwa-2028");
  const out=calc.calculate(rule,[
    {grade:1,semester:1,subject:"국어",name:"국어",type:"일반선택",credits:3,rankGrade:1,achievement:"A"},
    {grade:1,semester:1,subject:"수학",name:"수학",type:"일반선택",credits:3,rankGrade:2,achievement:"A"}
  ],{});
  assert.equal(out.blocked,true);
  assert.match(out.missing.join(" "),/교과 3개/);
});
test("한림대 간호학과는 수학40·국어20·영어20·사회과학20 비율을 별도로 적용한다",()=>{
  const rule=global.SCORE_RULES.find((r)=>r.id==="hallym-nursing-gyogwa-2028");
  const grades={수학:1,국어:2,영어:3,사회:4,과학:5};
  const courses=Object.entries(grades).flatMap(([subject,rankGrade])=>
    Array.from({length:3},(_,i)=>({
      grade:i<2?1:2,semester:i%2+1,subject,name:`${subject}${i+1}`,
      type:"일반선택",credits:6,rankGrade,achievement:"B"
    }))
  );
  const out=calc.calculate(rule,courses,{unexcusedAbsence:0});
  assert.equal(out.blocked,false);
  assert.equal(out.selected.length,12);
  assert.equal(out.selected.some((course)=>course.subject==="사회"),true);
  assert.equal(out.selected.some((course)=>course.subject==="과학"),false);
  assert.equal(out.rawAverage,2.2);
  assert.equal(out.academicScore,710);
  assert.equal(out.achievementWeightedAverageBonus,40);
  assert.equal(out.creditThresholdBonusBands,40);
  assert.equal(out.attendance.score,100);
  assert.equal(out.total,810);
});
test("한림대 간호학과는 필수 네 교과군 중 하나가 빠지면 계산을 중단한다",()=>{
  const rule=global.SCORE_RULES.find((r)=>r.id==="hallym-nursing-gyogwa-2028");
  const out=calc.calculate(rule,[
    {grade:1,semester:1,subject:"수학",name:"수학",type:"일반선택",credits:3,rankGrade:1,achievement:"A"},
    {grade:1,semester:1,subject:"국어",name:"국어",type:"일반선택",credits:3,rankGrade:2,achievement:"A"},
    {grade:1,semester:1,subject:"영어",name:"영어",type:"일반선택",credits:3,rankGrade:3,achievement:"A"}
  ],{});
  assert.equal(out.blocked,true);
  assert.match(out.missing.join(" "),/사회·과학/);
});
test("위덕대 일반전형은 전 교과 이수단위 평균의 5등급 구간점수와 출결을 합산한다",()=>{
  const rule=global.SCORE_RULES.find((r)=>r.id==="uiduk-general-student-record-2028");
  const out=calc.calculate(rule,[
    {grade:1,semester:1,subject:"국어",name:"국어",type:"공통과목",credits:3,rankGrade:1},
    {grade:1,semester:2,subject:"수학",name:"수학",type:"일반선택",credits:3,rankGrade:3}
  ],{unexcusedAbsence:3,tardy:9});
  assert.equal(out.blocked,false);
  assert.equal(out.rawAverage,2);
  assert.equal(out.academicScore,720);
  assert.equal(out.attendance.total,3);
  assert.equal(out.attendance.score,180);
  assert.equal(out.total,900);
});
test("위덕대 일반전형은 학교폭력 8호부터 부적격 처리한다",()=>{
  const rule=global.SCORE_RULES.find((r)=>r.id==="uiduk-general-student-record-2028");
  const courses=[{grade:1,semester:1,subject:"국어",name:"국어",type:"공통과목",credits:3,rankGrade:1}];
  const level7=calc.calculate(rule,courses,{unexcusedAbsence:0,schoolViolenceLevel:7});
  const level8=calc.calculate(rule,courses,{unexcusedAbsence:0,schoolViolenceLevel:8});
  assert.equal(level7.total,1000);
  assert.equal(level8.disqualified,true);
  assert.equal(level8.status,"부적격");
  assert.equal(level8.total,null);
});
test("위덕대 건학인재우수전형은 전 교과 중 우수 10과목만 반영한다",()=>{
  const rule=global.SCORE_RULES.find((r)=>r.id==="uiduk-geonhak-talent-2028");
  const courses=Array.from({length:12},(_,i)=>({
    grade:i<6?1:2,semester:i%2+1,subject:["국어","수학","영어","사회","과학","기타"][i%6],
    name:`과목${i+1}`,type:"일반선택",credits:2,rankGrade:i<8?1:5
  }));
  const out=calc.calculate(rule,courses,{unexcusedAbsence:0});
  assert.equal(out.blocked,false);
  assert.equal(out.selected.length,10);
  assert.equal(out.selected.filter((course)=>course.rankGrade===5).length,2);
  assert.equal(out.rawAverage,1.8);
  assert.equal(out.academicScore,800);
  assert.equal(out.attendance.score,200);
  assert.equal(out.total,1000);
});
test("한일장신대 간호학과는 전체 교과 원점수 평균에 기본점수 900점을 더한다",()=>{
  const rule=global.SCORE_RULES.find((r)=>r.id==="hanil-jangshin-nursing-2028");
  const courses=[
    {grade:1,semester:1,subject:"국어",name:"국어",type:"공통과목",credits:3,rawScore:90},
    {grade:1,semester:1,subject:"수학",name:"수학",type:"공통과목",credits:4,rawScore:80}
  ];
  const out=calc.calculate(rule,courses,{schoolViolenceLevel:6});
  assert.equal(out.blocked,false);
  assert.equal(out.rawAverage,85);
  assert.equal(out.academicScore,985);
  assert.equal(out.schoolViolence.deduction,50);
  assert.equal(out.total,935);
  assert.equal(out.attendance,null);
});
test("목포가톨릭대 사회복지학과는 봉사시간 점수를 교과점수와 별도로 합산한다",()=>{
  const rule=global.SCORE_RULES.find((r)=>r.id==="mokpo-catholic-volunteer-2028");
  const courses=[1,2,3].flatMap((grade)=>["국어","영어","사회"].map((subject)=>({
    grade,semester:grade===3?1:1,subject,name:`${grade}${subject}`,type:"일반선택",credits:2,rankGrade:2
  })));
  const full=calc.calculate(rule,courses,{volunteerHours:30});
  const minimum=calc.calculate(rule,courses,{volunteerHours:0});
  assert.equal(full.blocked,false);
  assert.equal(full.volunteer.hours,30);
  assert.equal(full.volunteer.score,10);
  assert.equal(minimum.volunteer.score,2);
  assert.equal(full.total-minimum.total,8);
  assert.equal(full.attendance,null);
});
test("호남신학대는 매학기 국어·영어 우수과목과 학년비율·출결·봉사를 합산한다",()=>{
  const rule=global.SCORE_RULES.find((r)=>r.id==="htus-student-record-2028");
  const courses=[];
  for (const [grade,semesters] of [[1,[1,2]],[2,[1,2]],[3,[1]]]) {
    for (const semester of semesters) {
      courses.push(
        {grade,semester,subject:"국어",name:`${grade}-${semester}국어`,type:"일반선택",credits:4,rankGrade:1,achievement:"A"},
        {grade,semester,subject:"영어",name:`${grade}-${semester}영어`,type:"일반선택",credits:2,rankGrade:1,achievement:"A"},
        {grade,semester,subject:"수학",name:`${grade}-${semester}수학`,type:"일반선택",credits:3,rankGrade:2,achievement:"B"}
      );
    }
  }
  const out=calc.calculate(rule,courses,{unexcusedAbsence:1,volunteerHours:25});
  assert.equal(out.blocked,false);
  assert.equal(out.selected.length,10);
  assert.equal(out.rawAverage,400);
  assert.equal(out.academicScore,400);
  assert.equal(out.attendance.score,50);
  assert.equal(out.volunteer.score,50);
  assert.equal(out.total,500);
});
test("호남신학대는 반영 후보 과목의 석차등급과 성취도가 모두 필요하다",()=>{
  const rule=global.SCORE_RULES.find((r)=>r.id==="htus-student-record-2028");
  const out=calc.calculate(rule,[
    {grade:1,semester:1,subject:"국어",name:"국어",type:"일반선택",credits:3,achievement:"A"}
  ],{volunteerHours:10});
  assert.equal(out.blocked,true);
  assert.match(out.missing.join(" "),/석차등급/);
});
test("영남신학대는 2학년·3학년1학기 교과를 66.7:33.3으로 반영하고 출결을 합산한다",()=>{
  const rule=global.SCORE_RULES.find((r)=>r.id==="ytus-record-2028");
  const courses=[2,3].flatMap((grade)=>["국어","영어","사회"].flatMap((subject)=>[
    {grade,semester:1,subject,name:`${grade}-${subject}-1`,type:"일반선택",credits:2,rankGrade:grade===2?1:2},
    ...(grade===2?[{grade,semester:2,subject,name:`${grade}-${subject}-2`,type:"일반선택",credits:2,rankGrade:1}]:[])
  ]));
  courses.push({grade:1,semester:1,subject:"국어",name:"제외국어",type:"공통과목",credits:4,rankGrade:9});
  const out=calc.calculate(rule,courses,{unexcusedAbsence:3});
  assert.equal(out.blocked,false);
  assert.equal(out.excluded.some((course)=>course.name==="제외국어"),true);
  assert.equal(out.rawAverage,468.345);
  assert.equal(out.academicScore,468.345);
  assert.equal(out.attendance.score,102.5);
  assert.equal(out.total,570.845);
});
test("영남신학대는 지정 교과가 없을 때 과학을 대체 교과로 사용한다",()=>{
  const rule=global.SCORE_RULES.find((r)=>r.id==="ytus-record-2028");
  const courses=[2,3].flatMap((grade)=>["국어","영어","과학"].map((subject)=>({
    grade,semester:1,subject,name:`${grade}-${subject}`,type:"일반선택",credits:2,rankGrade:1
  })));
  const out=calc.calculate(rule,courses,{unexcusedAbsence:0});
  assert.equal(out.blocked,false);
  assert.equal(out.selected.filter((course)=>course.selectionGroup==="사회").every((course)=>course.subject==="과학"),true);
  assert.equal(out.total,600);
});
test("대전가톨릭대는 두 교과군 상위 8+4과목의 성취도와 석차 가산점을 학점 가중한다",()=>{
  const rule=global.SCORE_RULES.find((r)=>r.id==="catholic-daejeon-record-2028");
  const courses=[
    ...Array.from({length:9},(_,i)=>({grade:i<5?1:2,semester:i%2+1,subject:["국어","수학","영어"][i%3],name:`주요${i+1}`,type:"일반선택",credits:3,rankGrade:1,achievement:"A"})),
    ...Array.from({length:5},(_,i)=>({grade:i<3?1:2,semester:i%2+1,subject:["사회","한국사","과학"][i%3],name:`탐구${i+1}`,type:"일반선택",credits:2,rankGrade:2,achievement:"B"}))
  ];
  const out=calc.calculate(rule,courses,{});
  assert.equal(out.blocked,false);
  assert.equal(out.status,"일부 계산 가능");
  assert.equal(out.selected.length,12);
  assert.equal(out.selected.filter((course)=>course.selectionGroup==="국어·수학·영어").length,8);
  assert.equal(out.selected.filter((course)=>course.selectionGroup==="사회·한국사·과학").length,4);
  assert.equal(out.academicScore,102);
  assert.equal(out.total,102);
  assert.equal(out.maximumScore,105);
});
test("한국침례신학대는 체육·예술을 제외한 원점수 상위 3과목 평균을 800점으로 환산한다",()=>{
  const rule=global.SCORE_RULES.find((r)=>r.id==="kbtus-record-2028");
  const out=calc.calculate(rule,[
    {grade:1,semester:1,subject:"국어",name:"국어",type:"공통과목",credits:3,rawScore:95},
    {grade:1,semester:1,subject:"수학",name:"수학",type:"공통과목",credits:4,rawScore:90},
    {grade:2,semester:1,subject:"영어",name:"영어",type:"일반선택",credits:2,rawScore:85},
    {grade:2,semester:2,subject:"사회",name:"사회",type:"일반선택",credits:3,rawScore:80},
    {grade:2,semester:2,subject:"체육",name:"운동과건강",type:"체육·예술",credits:2,rawScore:100}
  ],{unexcusedAbsence:20});
  assert.equal(out.blocked,false);
  assert.equal(out.selected.length,3);
  assert.equal(out.selected.some((course)=>course.subject==="체육"),false);
  assert.equal(out.rawAverage,90);
  assert.equal(out.academicScore,720);
  assert.equal(out.total,720);
  assert.equal(out.attendance,null);
});
test("대구예술대 학생부100% 전형은 전 교과 평균등급 구간과 학교폭력 감점을 적용한다",()=>{
  const rule=global.SCORE_RULES.find((r)=>r.id==="dgau-record-2028");
  const out=calc.calculate(rule,[
    {grade:1,semester:1,subject:"국어",name:"국어",type:"공통과목",credits:4,rankGrade:1},
    {grade:1,semester:2,subject:"수학",name:"수학",type:"공통과목",credits:2,rankGrade:2},
    {grade:2,semester:1,subject:"예술",name:"미술",type:"체육·예술",credits:1,rankGrade:2}
  ],{schoolViolenceLevel:6});
  assert.equal(out.blocked,false);
  assert.equal(out.rawAverage,1.666);
  assert.equal(out.academicScore,100);
  assert.equal(out.schoolViolence.deduction,3);
  assert.equal(out.total,97);
  assert.equal(out.attendance,null);
});
test("대구예술대 평균등급이 정확히 2.00이면 두 번째 환산구간을 적용한다",()=>{
  const rule=global.SCORE_RULES.find((r)=>r.id==="dgau-record-2028");
  const out=calc.calculate(rule,[
    {grade:1,semester:1,subject:"국어",name:"국어",type:"공통과목",credits:4,rankGrade:1},
    {grade:1,semester:2,subject:"영어",name:"영어",type:"공통과목",credits:1,rankGrade:3}
  ],{});
  assert.equal(out.rawAverage,2);
  assert.equal(out.total,90);
});
test("서울장신대는 국어·영어 전 과목과 사회 상위2과목을 학년별 30:30:40으로 환산한다",()=>{
  const rule=global.SCORE_RULES.find((r)=>r.id==="sjs-record-2028");
  const courses=[1,2,3].flatMap((grade)=>[
    {grade,semester:1,subject:"국어",name:`${grade}국어`,type:"일반선택",credits:3,rankGrade:grade},
    {grade,semester:grade===3?1:2,subject:"영어",name:`${grade}영어`,type:"일반선택",credits:2,rankGrade:grade},
    {grade,semester:1,subject:"사회",name:`${grade}사회`,type:"일반선택",credits:2,rankGrade:grade}
  ]);
  const out=calc.calculate(rule,courses,{schoolViolenceLevel:4});
  assert.equal(out.blocked,false);
  assert.equal(out.selected.length,8);
  assert.equal(out.selected.filter((course)=>course.selectionGroup==="사회교과 상위 2과목").length,2);
  assert.equal(out.rawAverage,890);
  assert.equal(out.academicScore,890);
  assert.equal(out.schoolViolence.deduction,50);
  assert.equal(out.total,840);
});
test("덕성여대 고교추천은 석차·성취도 중 높은 점수와 진로선택 이수학점 가산·출결을 합산한다",()=>{
  const rule=global.SCORE_RULES.find((r)=>r.id==="duksung-recommendation-science-2028");
  const out=calc.calculate(rule,[
    {grade:1,semester:1,subject:"수학",name:"공통수학",type:"공통과목",credits:3,rankGrade:2,achievement:"A"},
    {grade:2,semester:1,subject:"과학",name:"물리학",type:"진로선택",credits:4,rankGrade:2,achievement:"A"}
  ],{unexcusedAbsence:1,tardy:1});
  assert.equal(out.blocked,false);
  assert.equal(out.selected.every((course)=>course.convertedScore===100),true);
  assert.equal(out.selectedCreditBonus,0.12);
  assert.equal(out.academicScore,900.12);
  assert.equal(out.attendance.total,1.5);
  assert.equal(out.attendance.score,99.5);
  assert.equal(out.total,999.62);
});
test("덕성여대 고교추천은 반영 후보 과목의 석차등급과 성취도가 모두 필요하다",()=>{
  const rule=global.SCORE_RULES.find((r)=>r.id==="duksung-recommendation-humanities-2028");
  const out=calc.calculate(rule,[
    {grade:1,semester:1,subject:"국어",name:"국어",type:"공통과목",credits:3,rankGrade:1}
  ],{});
  assert.equal(out.blocked,true);
  assert.match(out.missing.join(" "),/성취도/);
});
test("중원대 교과100% 전형은 상위12과목과 사회·과학 융합선택 상한 및 학교폭력을 적용한다",()=>{
  const rule=global.SCORE_RULES.find((r)=>r.id==="jungwon-general1-2028");
  const courses=[
    ...Array.from({length:3},(_,i)=>({grade:1,semester:1,subject:i===0?"사회":"과학",name:`융합${i+1}`,type:"융합선택",credits:2,achievement:"A"})),
    ...Array.from({length:10},(_,i)=>({grade:i<5?1:2,semester:i%2+1,subject:["국어","수학","영어","사회","과학"][i%5],name:`일반${i+1}`,type:"일반선택",credits:3,rankGrade:2}))
  ];
  const out=calc.calculate(rule,courses,{schoolViolenceLevel:4});
  assert.equal(out.blocked,false);
  assert.equal(out.selected.length,12);
  assert.equal(out.selected.filter((course)=>course.type==="융합선택").length,2);
  assert.equal(out.rawAverage,90);
  assert.equal(out.academicScore,900);
  assert.equal(out.schoolViolence.deduction,40);
  assert.equal(out.total,860);
});
test("중원대 일반전형2는 가장 유리한 4개 교과군의 상위10과목을 600점으로 환산한다",()=>{
  const rule=global.SCORE_RULES.find((r)=>r.id==="jungwon-general2-2028");
  const courses=["국어","수학","영어","사회","과학"].flatMap((subject)=>
    Array.from({length:3},(_,i)=>({grade:i<2?1:2,semester:i%2+1,subject,name:`${subject}${i+1}`,type:"일반선택",credits:2,rankGrade:subject==="수학"?5:1}))
  );
  const out=calc.calculate(rule,courses,{});
  assert.equal(out.blocked,false);
  assert.equal(out.selected.length,10);
  assert.equal(out.selected.some((course)=>course.subject==="수학"),false);
  assert.equal(out.rawAverage,100);
  assert.equal(out.academicScore,600);
  assert.equal(out.total,600);
});
test("중원대 체육우수인재는 공개된 교과100점과 미인정 결석 출석50점을 구성점수로 계산한다",()=>{
  const rule=global.SCORE_RULES.find((r)=>r.id==="jungwon-athlete-2028");
  const courses=Array.from({length:10},(_,i)=>({grade:i<5?1:2,semester:i%2+1,subject:["국어","영어","사회","과학"][i%4],name:`과목${i+1}`,type:"일반선택",credits:2,rankGrade:1}));
  const out=calc.calculate(rule,courses,{unexcusedAbsence:7,schoolViolenceLevel:2});
  assert.equal(out.blocked,false);
  assert.equal(out.status,"일부 계산 가능");
  assert.equal(out.academicScore,100);
  assert.equal(out.attendance.score,46);
  assert.equal(out.schoolViolence.deduction,20);
  assert.equal(out.total,126);
  assert.equal(out.maximumScore,1000);
});
test("한세대 자유전공은 두 선택 교과군의 유리한 조합을 이수학점 가중으로 계산한다",()=>{
  const rule=global.SCORE_RULES.find((r)=>r.id==="hansei-free-major-2028");
  const out=calc.calculate(rule,[
    {grade:1,semester:1,subject:"영어",name:"영어",type:"공통과목",credits:3,rankGrade:2},
    {grade:1,semester:1,subject:"국어",name:"국어",type:"공통과목",credits:3,rankGrade:1},
    {grade:1,semester:1,subject:"수학",name:"수학",type:"공통과목",credits:3,rankGrade:4},
    {grade:1,semester:1,subject:"사회",name:"사회",type:"일반선택",credits:2,rankGrade:3},
    {grade:1,semester:1,subject:"과학",name:"과학",type:"일반선택",credits:2,rankGrade:5}
  ],{});
  assert.equal(out.blocked,false);
  assert.equal(out.status,"일부 계산 가능");
  assert.equal(out.rawAverage,93.537);
  assert.equal(out.academicScore,93.537);
  assert.equal(out.total,93.537);
  assert.equal(out.maximumScore,100);
});
test("한세대 간호학과는 국영수와 사회·과학 중 높은 교과를 반영한다",()=>{
  const rule=global.SCORE_RULES.find((r)=>r.id==="hansei-nursing-2028");
  const out=calc.calculate(rule,[
    {grade:1,semester:1,subject:"국어",name:"국어",type:"공통과목",credits:2,rankGrade:1},
    {grade:1,semester:1,subject:"영어",name:"영어",type:"공통과목",credits:2,rankGrade:2},
    {grade:1,semester:1,subject:"수학",name:"수학",type:"공통과목",credits:2,rankGrade:3},
    {grade:1,semester:1,subject:"사회",name:"사회",type:"일반선택",credits:2,rankGrade:4},
    {grade:1,semester:1,subject:"과학",name:"과학",type:"일반선택",credits:2,rankGrade:1}
  ],{});
  assert.equal(out.blocked,false);
  assert.equal(out.selected.length,5);
  assert.equal(out.rawAverage,94.475);
});
test("전북대 인문계열은 석차80%·성취도20%와 교과군 가중치를 적용한다",()=>{
  const rule=global.SCORE_RULES.find((r)=>r.id==="jbnu-humanities-2028");
  const courses=[
    {grade:1,semester:1,subject:"국어",name:"국어",type:"공통과목",credits:3,rankGrade:1,achievement:"A",achievementScale:"5"},
    {grade:1,semester:1,subject:"수학",name:"수학",type:"공통과목",credits:3,rankGrade:2,achievement:"B",achievementScale:"5"},
    {grade:1,semester:1,subject:"영어",name:"영어",type:"공통과목",credits:3,rankGrade:3,achievement:"C",achievementScale:"5"},
    {grade:1,semester:1,subject:"사회",name:"사회",type:"일반선택",credits:2,rankGrade:4,achievement:"D",achievementScale:"5"},
    {grade:1,semester:1,subject:"과학",name:"과학",type:"진로선택",credits:2,achievement:"A",achievementScale:"3"}
  ];
  const out=calc.calculate(rule,courses,{schoolViolenceLevel:1});
  assert.equal(out.blocked,false);
  assert.equal(out.rawAverage,78.4);
  assert.equal(out.academicScore,392);
  assert.equal(out.schoolViolence.deduction,35);
  assert.equal(out.total,357);
});
test("전북대는 미이수 교과군을 0점으로 반영한다",()=>{
  const rule=global.SCORE_RULES.find((r)=>r.id==="jbnu-humanities-2028");
  const out=calc.calculate(rule,[
    {grade:1,semester:1,subject:"국어",name:"국어",type:"진로선택",credits:2,achievement:"A",achievementScale:"3"}
  ],{});
  assert.equal(out.blocked,false);
  assert.equal(out.rawAverage,30);
  assert.equal(out.academicScore,150);
});
test("단국대 일반계열은 공개된 교과 950점 구성점수와 융합선택 상위3과목을 계산한다",()=>{
  const rule=global.SCORE_RULES.find((r)=>r.id==="dankook-general-academic-component-2028");
  const courses=[
    {grade:1,semester:1,subject:"국어",name:"국어",type:"공통과목",credits:3,rankGrade:1,achievement:"B",achievementScale:"5"},
    ...["A","B","C","D"].map((achievement,i)=>({grade:2,semester:1,subject:i%2?"사회":"과학",name:`융합${i}`,type:"융합선택",credits:2,achievement,achievementScale:"5"}))
  ];
  const out=calc.calculate(rule,courses,{});
  assert.equal(out.blocked,false);
  assert.equal(out.status,"일부 계산 가능");
  assert.equal(out.selected.length,4);
  assert.equal(out.rawAverage,97.75);
  assert.equal(out.academicScore,928.63);
  assert.equal(out.total,928.63);
});
test("용인대 일반계열은 학년별 서로 다른 교과 원점수 상위3과목을 선택한다",()=>{
  const rule=global.SCORE_RULES.find((r)=>r.id==="yongin-general-raw-component-2028");
  const courses=[1,2,3].flatMap((grade)=>[
    {grade,semester:1,subject:"국어",name:`국어${grade}`,type:"공통과목",credits:3,rawScore:100-grade},
    {grade,semester:1,subject:"수학",name:`수학${grade}`,type:"공통과목",credits:3,rawScore:90-grade},
    {grade,semester:1,subject:"영어",name:`영어${grade}`,type:"공통과목",credits:3,rawScore:80-grade},
    {grade,semester:2,subject:"국어",name:`국어재수강${grade}`,type:"일반선택",credits:2,rawScore:70-grade},
    {grade,semester:1,subject:"과학",name:`융합${grade}`,type:"융합선택",credits:2,rawScore:100},
  ]);
  const out=calc.calculate(rule,courses,{});
  assert.equal(out.blocked,false);
  assert.equal(out.status,"일부 계산 가능");
  assert.equal(out.selected.length,9);
  assert.equal(out.selected.filter((c)=>c.subject==="국어").length,3);
  assert.equal(out.rawAverage,88);
  assert.equal(out.total,88);
});
test("유원대는 시행계획에 실제 기준점수표가 없어 계산하지 않는다",()=>{
  const rule=global.SCORE_RULES.find((r)=>r.id==="u1-record-2028");
  const out=calc.calculate(rule,[],{});
  assert.equal(out.blocked,true);
  assert.equal(out.status,"모집요강 확인 필요");
});
test("부산장신대는 공개표에 정확히 일치하는 학년균형 평균등급의 학생부550점 부분을 계산한다",()=>{
  const rule=global.SCORE_RULES.find((r)=>r.id==="bpu-record-2028");
  const courses=[1,2,3].map((grade)=>({grade,semester:1,subject:"국어",name:`국어${grade}`,type:"공통과목",credits:3,rankGrade:2}));
  const out=calc.calculate(rule,courses,{});
  assert.equal(out.blocked,false);
  assert.equal(out.status,"일부 계산 가능");
  assert.equal(out.rawAverage,2);
  assert.equal(out.academicScore,500);
  assert.equal(out.total,500);
});
test("부산장신대는 소수 평균등급의 구간 기준을 임의 적용하지 않는다",()=>{
  const rule=global.SCORE_RULES.find((r)=>r.id==="bpu-record-2028");
  const out=calc.calculate(rule,[
    {grade:1,semester:1,subject:"국어",name:"국어1",type:"공통과목",credits:3,rankGrade:1},
    {grade:2,semester:1,subject:"국어",name:"국어2",type:"공통과목",credits:3,rankGrade:2},
    {grade:3,semester:1,subject:"국어",name:"국어3",type:"공통과목",credits:3,rankGrade:2},
  ],{});
  assert.equal(out.blocked,true);
  assert.match(out.missing.join(" "),/소수 구간/);
});
test("영산대는 상위 12과목 기준과 성취도·학교폭력 규칙만 공개되어 최종 점수를 차단한다",()=>{
  const rule=global.SCORE_RULES.find((r)=>r.id==="ysu-record-2028");
  const out=calc.calculate(rule,[],{schoolViolenceLevel:4});
  assert.equal(rule.selectionRule.count,12);
  assert.deepEqual(rule.achievementConversion,{A:1,B:3,C:5,"우수":1,"보통":3,"미흡":5});
  assert.equal(rule.schoolViolenceRule.percentDeductions[4],3);
  assert.equal(out.blocked,true);
  assert.equal(out.status,"모집요강 확인 필요");
});
test("신경주대는 학년별 서로 다른 3과목 규칙을 보존하되 별도 득점표 부재로 차단한다",()=>{
  const rule=global.SCORE_RULES.find((r)=>r.id==="sgju-record-2028");
  const out=calc.calculate(rule,[],{schoolViolenceLevel:6});
  assert.equal(rule.selectionRule.type,"perGradeDistinctSubjectsTopN");
  assert.deepEqual(rule.selectionRule.grades,[1,2,3]);
  assert.equal(rule.selectionRule.count,3);
  assert.deepEqual(rule.achievementConversion,{A:1,B:3,C:5});
  assert.equal(rule.schoolViolenceRule.deductions[6],50);
  assert.equal(out.blocked,true);
  assert.equal(out.status,"모집요강 확인 필요");
});
test("인천가톨릭대 제2캠퍼스 미래인재 기본 교과점수는 학년별 상위6과목을 20:40:40으로 반영한다",()=>{
  const rule=global.SCORE_RULES.find((r)=>r.id==="iccu-campus2-future-component-2028");
  const courses=[1,2,3].flatMap((grade)=>Array.from({length:6},(_,i)=>({grade,semester:grade===3?1:i%2+1,subject:["국어","영어","수학","사회","과학","국어"][i],name:`${grade}학년${i+1}`,type:i===5?"일반선택":"공통과목",credits:i+1,rankGrade:grade})));
  courses.push({grade:1,semester:1,subject:"국어",name:"진로제외",type:"진로선택",credits:4,rankGrade:1});
  const out=calc.calculate(rule,courses,{});
  assert.equal(out.blocked,false);
  assert.equal(out.status,"일부 계산 가능");
  assert.equal(out.selected.length,18);
  assert.equal(out.rawAverage,95.2);
  assert.equal(out.total,95.2);
});
test("인천가톨릭대 제2캠퍼스 실기우수 기본 교과점수는 30:40:30 학년비율을 적용한다",()=>{
  const rule=global.SCORE_RULES.find((r)=>r.id==="iccu-campus2-practical-component-2028");
  const courses=[1,2,3].flatMap((grade)=>Array.from({length:6},(_,i)=>({grade,semester:grade===3?1:i%2+1,subject:["국어","영어","수학","사회","과학","국어"][i],name:`${grade}학년${i+1}`,type:"일반선택",credits:3,rankGrade:grade})));
  const out=calc.calculate(rule,courses,{});
  assert.equal(out.blocked,false);
  assert.equal(out.rawAverage,96.2);
  assert.equal(out.total,96.2);
});
test("한성대 교과우수 인문계열은 전 과목 환산과 진로선택의 유리한 지표를 적용한다",()=>{
  const rule=global.SCORE_RULES.find((r)=>r.id==="hansung-gyogwa-humanities-2028");
  const courses=[
    {grade:1,semester:1,subject:"국어",name:"공통국어",type:"공통과목",credits:3,rankGrade:2},
    {grade:2,semester:1,subject:"사회",name:"사회문제탐구",type:"진로선택",credits:2,rankGrade:3,achievement:"A"},
    {grade:2,semester:1,subject:"과학",name:"과학제외",type:"일반선택",credits:2,rankGrade:1},
  ];
  const out=calc.calculate(rule,courses,{schoolViolenceLevel:4});
  assert.equal(out.selected.length,2);
  assert.equal(out.academicScore,980);
  assert.equal(out.schoolViolence.deduction,100);
  assert.equal(out.total,880);
});
test("한성대 지역균형은 5개 교과 1등급을 1000점으로 환산하고 8호를 부적격 처리한다",()=>{
  const rule=global.SCORE_RULES.find((r)=>r.id==="hansung-regional-2028");
  const courses=["국어","영어","수학","사회","과학"].map((subject,i)=>({grade:i<2?1:2,semester:1,subject,name:`${subject}1`,type:"일반선택",credits:3,rankGrade:1}));
  assert.equal(calc.calculate(rule,courses,{}).total,1000);
  assert.equal(calc.calculate(rule,courses,{schoolViolenceLevel:8}).disqualified,true);
});
test("한성대 논술전형은 논술을 제외한 학생부 200점 구성요소만 계산한다",()=>{
  const rule=global.SCORE_RULES.find((r)=>r.id==="hansung-essay-component-2028");
  const out=calc.calculate(rule,[{grade:1,semester:1,subject:"국어",name:"국어",type:"공통과목",credits:3,rankGrade:2}],{});
  assert.equal(out.status,"일부 계산 가능");
  assert.equal(out.academicScore,194);
  assert.equal(out.total,194);
});
test("부산가톨릭대는 교과별 2과목과 나머지 6과목 구조를 보존하되 미공개 환산표를 추정하지 않는다",()=>{
  const rule=global.SCORE_RULES.find((r)=>r.id==="cup-record-2028");
  assert.equal(rule.selectionRule.type,"twoStageGroups");
  assert.deepEqual(rule.selectionRule.stages.map((stage)=>stage.count),[2,2,2,2,6]);
  assert.equal(rule.selectionRule.stages.at(-1).excludeSelected,true);
  assert.equal(rule.schoolViolenceRule.deductions[6],100);
  const out=calc.calculate(rule,[],{});
  assert.equal(out.blocked,true);
  assert.equal(out.status,"모집요강 확인 필요");
});
test("영남대 인문사회 교과 구성값은 학년별 교과 범위와 이수학점 가중을 적용한다",()=>{
  const rule=global.SCORE_RULES.find((r)=>r.id==="yu-humanities-academic-component-2028");
  const courses=[
    {grade:1,semester:1,subject:"과학",name:"통합과학",type:"공통과목",credits:3,rankGrade:1},
    {grade:2,semester:1,subject:"국어",name:"문학",type:"일반선택",credits:1,rankGrade:2},
    {grade:2,semester:1,subject:"과학",name:"물리학",type:"일반선택",credits:5,rankGrade:1},
  ];
  const out=calc.calculate(rule,courses,{});
  assert.equal(out.blocked,false);
  assert.equal(out.status,"일부 계산 가능");
  assert.equal(out.selected.length,2);
  assert.equal(out.rawAverage,99.75);
  assert.equal(out.total,99.75);
});
test("영남대 자연계열은 2학년 사회를 제외하고 예체능은 국영사만 반영한다",()=>{
  const natural=global.SCORE_RULES.find((r)=>r.id==="yu-natural-academic-component-2028");
  const arts=global.SCORE_RULES.find((r)=>r.id==="yu-arts-academic-component-2028");
  const courses=[
    {grade:2,semester:1,subject:"사회",name:"사회문화",type:"일반선택",credits:3,rankGrade:1},
    {grade:2,semester:1,subject:"과학",name:"생명과학",type:"일반선택",credits:3,rankGrade:2},
    {grade:2,semester:1,subject:"국어",name:"문학",type:"일반선택",credits:3,rankGrade:3},
  ];
  assert.deepEqual(calc.calculate(natural,courses,{}).selected.map((c)=>c.subject),["과학","국어"]);
  assert.deepEqual(calc.calculate(arts,courses,{}).selected.map((c)=>c.subject),["사회","국어"]);
});
test("평택대 PTU교과 자연계열은 전 과목 평균 환산등급과 성취도 변환을 계산한다",()=>{
  const rule=global.SCORE_RULES.find((r)=>r.id==="ptu-gyogwa-natural-grade-component-2028");
  const courses=[
    {grade:1,semester:1,subject:"국어",name:"공통국어",type:"공통과목",credits:3,rankGrade:2},
    {grade:1,semester:1,subject:"과학",name:"과학융합",type:"융합선택",credits:2,achievement:"A",achievementScale:"5"},
    {grade:2,semester:1,subject:"과학",name:"과학탐구실험",type:"기타",credits:1,achievement:"C",achievementScale:"3"},
    {grade:2,semester:1,subject:"수학",name:"진로수학",type:"진로선택",credits:2,achievement:"A",achievementScale:"5"},
  ];
  const out=calc.calculate(rule,courses,{});
  assert.equal(out.blocked,false);
  assert.equal(out.status,"일부 계산 가능");
  assert.equal(out.selected.length,3);
  assert.equal(out.rawAverage,2.333);
  assert.match(out.excludedDetails.find((x)=>x.course.name==="진로수학").reason,/석차등급 미산출/);
});
test("평택대 지역균형은 성취도 과목을 제외하고 석차등급 상위6과목을 선택한다",()=>{
  const rule=global.SCORE_RULES.find((r)=>r.id==="ptu-top6-grade-component-2028");
  const courses=Array.from({length:8},(_,i)=>({grade:i<4?1:2,semester:1,subject:["국어","수학","영어","사회","과학"][i%5],name:`과목${i+1}`,type:"일반선택",credits:i+1,rankGrade:(i%5)+1}));
  courses.push({grade:2,semester:1,subject:"과학",name:"성취도만",type:"융합선택",credits:3,achievement:"A",achievementScale:"5"});
  const out=calc.calculate(rule,courses,{});
  assert.equal(out.selected.length,6);
  assert.deepEqual(out.selected.map((c)=>c.convertedScore),[1,1,2,2,3,3]);
  assert.equal(out.rawAverage,2);
  assert.equal(out.total,2);
});
test("한국체대 일반 모집단위는 전 교과 환산등급을 학년별 30:30:40으로 반영한다",()=>{
  const rule=global.SCORE_RULES.find((r)=>r.id==="knsu-general-grade-component-2028");
  const courses=[
    {grade:1,semester:1,subject:"국어",name:"국어",type:"공통과목",credits:3,rankGrade:1},
    {grade:2,semester:1,subject:"과학",name:"과학융합",type:"융합선택",credits:2,achievement:"B"},
    {grade:3,semester:1,subject:"체육",name:"운동과건강",type:"체육·예술",credits:2,achievement:"C"},
  ];
  const out=calc.calculate(rule,courses,{});
  assert.equal(out.blocked,false);
  assert.equal(out.status,"일부 계산 가능");
  assert.equal(out.rawAverage,2.9);
  assert.equal(out.total,2.9);
});
test("한국체대 공연예술학과는 국영3과목 후 나머지7과목을 뽑고 성취도 과목을 2개로 제한한다",()=>{
  const rule=global.SCORE_RULES.find((r)=>r.id==="knsu-performing-grade-component-2028");
  const courses=[
    ...[1,2,3].map((rankGrade,i)=>({grade:1,semester:1,subject:i%2?"영어":"국어",name:`국영${i+1}`,type:"일반선택",credits:3-i,rankGrade})),
    ...Array.from({length:7},(_,i)=>({grade:2,semester:1,subject:"수학",name:`등급${i+1}`,type:"일반선택",credits:2,rankGrade:(i%5)+1})),
    ...Array.from({length:4},(_,i)=>({grade:2,semester:1,subject:"예술",name:`성취${i+1}`,type:"체육·예술",credits:2,achievement:"A"})),
  ];
  const out=calc.calculate(rule,courses,{});
  assert.equal(out.blocked,false);
  assert.equal(out.selected.length,10);
  assert.equal(out.selected.filter((c)=>!Number.isFinite(Number(c.rankGrade))).length,2);
  assert.equal(out.selected.filter((c)=>c.selectionGroup==="국어·영어 우수 3과목").length,3);
});
test("한국체대 공연예술학과는 국어·영어 우수과목이 3개 미만이면 계산하지 않는다",()=>{
  const rule=global.SCORE_RULES.find((r)=>r.id==="knsu-performing-grade-component-2028");
  const courses=Array.from({length:10},(_,i)=>({grade:1,semester:1,subject:i<2?"국어":"수학",name:`과목${i+1}`,type:"일반선택",credits:2,rankGrade:1}));
  const out=calc.calculate(rule,courses,{});
  assert.equal(out.blocked,true);
  assert.match(out.missing.join(" "),/국어·영어/);
});

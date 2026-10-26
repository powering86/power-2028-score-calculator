const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const context = { window: {} };
vm.createContext(context);
vm.runInContext(
  fs.readFileSync(path.resolve(__dirname, "../dist/record-io.js"), "utf8"),
  context,
);
const codec = context.window.RecordCodec;

test("내보낸 성적 JSON을 과목과 출결 데이터로 다시 불러온다", () => {
  const restored = codec.parseJson(
    JSON.stringify({
      courses: [
        {
          grade: 2,
          semester: 1,
          subject: "과학",
          name: "융합과학",
          credits: 3,
          achievementRatio: "A:30,B:45,C:25",
          achievementRate: 30,
          passFail: "P",
          achievementScale: "3",
          ignored: "제외",
        },
      ],
      attendance: {
        unexcusedAbsence: 2,
        tardy: 4,
        perfectAttendanceYears: 2,
        ignored: 99,
      },
    }),
  );
  assert.equal(restored.courses[0].name, "융합과학");
  assert.equal(restored.courses[0].achievementRatio, "A:30,B:45,C:25");
  assert.equal(restored.courses[0].achievementRate, 30);
  assert.equal(restored.courses[0].passFail, "P");
  assert.equal(restored.courses[0].achievementScale, "3");
  assert.equal(restored.courses[0].ignored, undefined);
  assert.equal(restored.attendance.unexcusedAbsence, 2);
  assert.equal(restored.attendance.tardy, 4);
  assert.equal(restored.attendance.perfectAttendanceYears, 2);
  assert.equal(restored.attendance.ignored, undefined);
});

test("courses 배열이 없는 JSON은 거부한다", () => {
  assert.throws(() => codec.parseJson('{"attendance":{}}'), /courses 배열/);
});

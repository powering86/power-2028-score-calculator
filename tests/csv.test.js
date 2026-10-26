const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const context = { window: {} };
vm.createContext(context);
vm.runInContext(
  fs.readFileSync(path.resolve(__dirname, "../dist/csv.js"), "utf8"),
  context,
);

test("CSV의 따옴표 안 쉼표와 이중 따옴표를 보존한다", () => {
  const rows = context.window.CsvCodec.parse(
    '\ufeffname,achievementRatio,note\r\n"융합과학","A:30,B:45,C:25","설명 ""확인"""\r\n',
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(rows)),
    [
      ["name", "achievementRatio", "note"],
      ["융합과학", "A:30,B:45,C:25", '설명 "확인"'],
    ],
  );
});

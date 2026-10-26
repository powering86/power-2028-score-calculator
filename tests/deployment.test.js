const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const dist = path.resolve(__dirname, "../dist");
const html = fs.readFileSync(path.join(dist, "index.html"), "utf8");

test("정적 진입점이 참조하는 로컬 CSS와 스크립트가 모두 배포물에 존재한다", () => {
  const references = [
    ...html.matchAll(/<(?:script|link)\b[^>]+(?:src|href)=["']([^"']+)["']/gi),
  ].map((match) => match[1]);
  assert.ok(references.length > 0);
  for (const reference of references) {
    assert.doesNotMatch(reference, /^https?:\/\//, `외부 실행 자산 사용: ${reference}`);
    if (reference.startsWith("#")) continue;
    const clean = reference.split(/[?#]/)[0];
    assert.ok(fs.existsSync(path.join(dist, clean)), `배포 자산 누락: ${clean}`);
  }
});

test("Cloudflare Pages 출력 디렉터리는 dist로 고정되어 있다", () => {
  const wrangler = fs.readFileSync(path.resolve(__dirname, "../wrangler.toml"), "utf8");
  assert.match(wrangler, /pages_build_output_dir\s*=\s*["']dist["']/);
});

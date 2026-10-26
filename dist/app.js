const $ = (s) => document.querySelector(s),
  $$ = (s) => [...document.querySelectorAll(s)];
const state = { mode: "detail", selectedRule: null, compare: new Set() };
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const options = (items, value) =>
  items
    .map((x) => `<option ${x === value ? "selected" : ""}>${x}</option>`)
    .join("");
const selectionLabel = (rule) => {
  const s = rule.selectionRule || {};
  if (s.note) return s.note;
  if (s.type === "all") return "전 반영과목";
  if (s.type === "perGradeTopN")
    return Object.entries(s.counts)
      .map(([g, n]) => `${g}학년 ${n}과목`)
      .join(" · ");
  if (s.type === "perSubjectTopN") return `교과별 상위 ${s.count}과목`;
  if (s.type === "perGradeSubjectGroups") return "학년별 지정 교과";
  return `상위 ${s.count || 12}과목`;
};
const semesterLabel = (rule) => {
  const semesters = rule.semesters || {};
  if (semesters.note) return semesters.note;
  if (semesters.prospective || semesters.graduate)
    return [
      semesters.prospective && `졸업예정 ${semesters.prospective}`,
      semesters.graduate && `졸업 ${semesters.graduate}`,
    ]
      .filter(Boolean)
      .join(" · ");
  if (semesters.through) return `${semesters.through}까지`;
  return "전형별 기준 확인";
};
const quickModeLabel = (rule) =>
  rule.quickMode ||
  (rule.status === "계산 가능" ? "상세 입력 필요" : "시행계획상 계산 불가");
const statusLabel = (status) =>
  status === "모집요강 확인 필요"
    ? "시행계획 세부 기준 미공개 · 모집요강 확인 필요"
    : status;
const finalGuideNotice = (rule, gaps = []) => {
  if (!["모집요강 확인 필요", "상세 기준 미공개"].includes(rule.status))
    return "";
  const known = rule.verificationStatus || rule.formula || "시행계획에 공개된 범위만 확인됨";
  const missing = gaps.length
    ? gaps.join(" · ")
    : "정확한 환산에 필요한 세부 산식 또는 환산표";
  return `<section class="final-guide-notice" role="note" aria-label="최종 모집요강 확인 안내"><b>시행계획에 세부 산출 기준이 없어 현재 확정 계산할 수 없습니다.</b><p>2028학년도 대학입학전형 시행계획은 전형의 큰 틀을 안내하는 자료입니다. 이 전형은 정확한 점수 산출에 필요한 세부 내용이 시행계획에 모두 공개되지 않았으므로, 누락된 값을 임의로 가정하지 않습니다.</p><dl><div><dt>시행계획에서 확인된 내용</dt><dd>${esc(known)}</dd></div><div><dt>현재 공개되지 않은 기준</dt><dd>${esc(missing)}</dd></div></dl><p class="final-guide-action"><strong>확인 시점:</strong> 해당 대학이 2028학년도 최종 모집요강을 공개하면 반드시 다시 확인하세요.</p><p><strong>확인할 항목:</strong> 석차등급 환산표, 진로선택·성취도 반영법, 출결 환산표, 반영 교과·과목 수, 모집단위별 예외, 소수점 반올림·절사 기준</p></section>`;
};
const unitLabel = (rule) =>
  rule.applicableUnits?.length ? rule.applicableUnits.join(" · ") : "전형별 모집단위 확인";
const studentRecordWeightLabel = (rule) => {
  const componentValue = rule.componentMaximumScore ?? rule.maximumScore,
    overallValue = rule.overallMaximumScore,
    component = componentValue == null ? NaN : Number(componentValue),
    overall = overallValue == null ? NaN : Number(overallValue);
  if (Number.isFinite(component) && Number.isFinite(overall) && overall > 0)
    return `${component}/${overall}점 (${Math.round((component / overall) * 10000) / 100}%)`;
  if (Number.isFinite(component))
    return `${component}점 만점${rule.status === "일부 계산 가능" ? " 공개 정량분" : ""}`;
  return "정량 배점 미공개·정성평가";
};
const scoreRangeLabel = (rule) => {
  if (rule.scoreDirection === "lowerIsBetter") return "등급 산출(낮을수록 우수)";
  const maximumValue = rule.componentMaximumScore ?? rule.maximumScore,
    minimumValue = rule.componentMinimumScore ?? rule.minimumScore,
    maximum = maximumValue == null ? NaN : Number(maximumValue),
    minimum = minimumValue == null ? NaN : Number(minimumValue);
  if (!Number.isFinite(maximum)) return "세부 점수표 미공개";
  if (!Number.isFinite(minimum)) return `최고 ${maximum}점 · 최저점 미공개`;
  return `최고 ${maximum}점 · 최저 ${minimum}점 · 실질 ${Math.round((maximum - minimum) * 100) / 100}점`;
};
function addRow(data = {}) {
  const tr = document.createElement("tr");
  tr.innerHTML = `<td><input class="row-check" type="checkbox"></td><td><select data-k="grade">${options(["1", "2", "3"], String(data.grade || 1))}</select></td><td><select data-k="semester">${options(["1", "2"], String(data.semester || 1))}</select></td><td><select data-k="subject">${options(["국어", "수학", "영어", "사회", "과학", "한국사", "제2외국어/한문", "기술·가정", "정보", "예술", "체육", "기타"], data.subject || "국어")}</select></td><td><input data-k="name" value="${esc(data.name || "")}"></td><td><select data-k="type">${options(["공통과목", "일반선택", "진로선택", "융합선택", "전문교과", "체육·예술", "기타"], data.type || "공통과목")}</select></td><td><input data-k="credits" type="number" min="0" step=".5" value="${esc(data.credits || "")}"></td><td><input data-k="rankGrade" type="number" min="1" max="9" step=".01" value="${esc(data.rankGrade || "")}"></td><td><select data-k="achievement"><option></option>${options(["A", "B", "C", "D", "E"], data.achievement || "")}</select></td><td><select data-k="passFail"><option></option>${options(["P", "F"], data.passFail || (["P", "F"].includes(data.achievement) ? data.achievement : ""))}</select></td><td><select data-k="achievementScale"><option></option>${options(["3", "5"], String(data.achievementScale || ""))}</select></td><td><input data-k="classSize" type="number" min="1" step="1" value="${esc(data.classSize || "")}"></td><td><input data-k="rank" type="number" min="1" step="1" value="${esc(data.rank || "")}"></td><td><input data-k="tiedRank" type="number" min="1" step="1" value="${esc(data.tiedRank || "")}"></td><td><input data-k="rawScore" type="number" step=".01" value="${esc(data.rawScore || "")}"></td><td><input data-k="mean" type="number" step=".01" value="${esc(data.mean || "")}"></td><td><input data-k="stddev" type="number" step=".01" value="${esc(data.stddev || "")}"></td><td><input data-k="achievementRatio" placeholder="A:30,B:45" value="${esc(data.achievementRatio || "")}"></td><td><input data-k="achievementRate" type="number" min="0" max="100" step=".01" value="${esc(data.achievementRate || "")}"></td><td><button class="delete-row" aria-label="행 삭제">×</button></td>`;
  tr.querySelector(".delete-row").onclick = () => {
    tr.remove();
    saveMaybe();
  };
  tr.oninput = saveMaybe;
  $("#courseTable tbody").append(tr);
  updateRequiredFields(state.selectedRule);
}
function updateRequiredFields(rule) {
  const required = new Set(rule ? ScoreValidator.requiredFields(rule) : []);
  const requiredAttendance = new Set(
    rule ? ScoreValidator.requiredAttendanceFields(rule) : [],
  );
  $$("#courseTable [data-field]").forEach((cell) =>
    cell.classList.toggle("required-field", required.has(cell.dataset.field)),
  );
  $$("#courseTable [data-k]").forEach((input) => {
    input.closest("td")?.classList.toggle(
      "required-field",
      required.has(input.dataset.k),
    );
    input.required = required.has(input.dataset.k);
  });
  $$('[data-att]').forEach((input) => {
    const isRequired = requiredAttendance.has(input.dataset.att);
    input.closest("label")?.classList.toggle("required-field", isRequired);
    input.required = isRequired;
  });
  if (!rule) return;
  const labels = ScoreValidator.requirements(rule);
  $("#inputRequirementGuide").innerHTML = `<b>${esc(rule.university)} ${esc(rule.campus)} · ${esc(rule.admissionName)} 필요 입력</b><p>${labels.map(esc).join(" · ")}</p><small>노란색 열만 이 전형의 계산에 필수입니다. 다른 열은 비워 두어도 됩니다.</small>`;
}
function courses() {
  return $$("#courseTable tbody tr").map((tr) =>
    Object.fromEntries(
      [...tr.querySelectorAll("[data-k]")].map((el) => [
        el.dataset.k,
        el.type === "number"
          ? el.value === ""
            ? null
            : Number(el.value)
          : el.value,
      ]),
    ),
  );
}
function attendance() {
  return Object.fromEntries(
    $$("[data-att]").map((x) => [x.dataset.att, Number(x.value || 0)]),
  );
}
function quickInput() {
  return {
    allAverage: $("#quickAll").value,
    majorAverage: $("#quickCore").value,
    achievement: $("#quickAch").value,
    unexcusedAbsence: Number($("#quickAbs").value || 0),
  };
}
function saveMaybe() {
  if ($("#localSave").checked)
    localStorage.setItem(
      "power2028-record",
      JSON.stringify({ courses: courses(), attendance: attendance() }),
    );
}
window.addRow = addRow;
window.saveMaybe = saveMaybe;
function loadSaved() {
  try {
    const d = JSON.parse(localStorage.getItem("power2028-record"));
    if (d?.courses?.length) {
      $("#localSave").checked = true;
      $("#courseTable tbody").innerHTML = "";
      d.courses.forEach(addRow);
      Object.entries(d.attendance || {}).forEach(([k, v]) => {
        const el = $(`[data-att="${k}"]`);
        if (el) el.value = v;
      });
    }
  } catch {}
}
function renderUniversityList() {
  const q = $("#search").value.trim();
  const all = window.UNIVERSITY_CATALOG.filter((u) =>
    (u.name + u.campus + u.region).includes(q),
  );
  const coverage = new Map((window.COVERAGE_ROWS || []).map((x) => [x.raw, x]));
  $("#uniCount").textContent = all.length;
  $("#universityList").innerHTML = all
    .map((u) => {
      const c = coverage.get(u.raw),
        status = c?.verificationStatus || "검수 대기";
      return `<button class="uni-item" data-raw="${esc(u.raw)}"><b>${esc(u.name)}</b><small>${esc(u.campus)} · ${esc(u.region)} · ${esc(u.type)}</small><small>${esc(status)}</small></button>`;
    })
    .join("");
  $$(".uni-item").forEach(
    (b) => (b.onclick = () => showUniversity(b.dataset.raw, b)),
  );
}
function showUniversity(raw, btn) {
  $$(".uni-item").forEach((x) => x.classList.toggle("active", x === btn));
  const u = UNIVERSITY_CATALOG.find((x) => x.raw === raw);
  const rules = SCORE_RULES.filter(
    (r) =>
      r.university === u.name &&
      (!r.campus || r.campus === u.campus || r.campus.includes(u.campus)),
  );
  if (!rules.length) {
    const c = (window.COVERAGE_ROWS || []).find((x) => x.raw === raw),
      source = c?.sourceUrl
        ? `<a href="${esc(c.sourceUrl)}" target="_blank" rel="noreferrer">시행계획 원문 확인</a>`
        : "<span>공개된 원문 링크 없음</span>";
    $("#ruleCards").innerHTML =
      `<div class="empty"><span class="badge warn">${esc(c?.verificationStatus || "검수 대기")}</span><h3>${esc(u.name)} ${esc(u.campus)}</h3><p>${c?.planId ? "원문 텍스트 추출은 완료되었지만 환산 규칙은 아직 원문 표 대조 전입니다." : "2028학년도 시행계획 원문이 공개되지 않아 계산할 수 없습니다."}</p><small>원문 ID ${esc(c?.planId || "-")} · ${esc(c?.extractionStatus || "원문 미공개")}</small><p>${source}</p></div>`;
    return;
  }
  $("#ruleCards").innerHTML = rules
    .map(
      (r) =>
        `<article class="rule-card"><div><span class="badge ${r.status === "계산 가능" ? "" : "warn"}">${esc(statusLabel(r.status))}</span><h3>${esc(r.admissionName)}</h3><p><b>모집단위</b> ${esc(unitLabel(r))}</p><p>${esc(r.selectionRule?.note || r.formula)}</p><small>근거 ${esc(Evidence.label(r.evidence))}</small></div><button data-rule="${r.id}">선택</button></article>`,
    )
    .join("");
  $$("[data-rule]").forEach(
    (b) =>
      (b.onclick = () =>
        selectRule(SCORE_RULES.find((r) => r.id === b.dataset.rule))),
  );
}
function selectRule(rule) {
  state.selectedRule = rule;
  const req = ScoreValidator.requirements(rule),
    gaps = ScoreValidator.disclosureGaps(rule);
  updateRequiredFields(rule);
  $("#resultView").innerHTML =
    `<div class="result-top"><div><span class="badge ${rule.status === "계산 가능" ? "" : "warn"}">${esc(statusLabel(rule.status))}</span><h3>${esc(rule.university)} ${esc(rule.campus)} · ${esc(rule.admissionName)}</h3><p>${esc(rule.admissionType)} · 모집단위 ${esc(unitLabel(rule))}</p></div></div>${finalGuideNotice(rule, gaps)}<div class="metrics"><div class="metric">학생부 정량 반영<b>${esc(studentRecordWeightLabel(rule))}</b></div><div class="metric">점수 범위<b>${esc(scoreRangeLabel(rule))}</b></div><div class="metric">반영학기<b>${esc(semesterLabel(rule))}</b></div><div class="metric">선택방식<b>${esc(selectionLabel(rule))}</b></div><div class="metric">출결<b>${esc(ScoreValidator.attendanceStatus(rule))}</b></div><div class="metric">간편입력<b>${esc(quickModeLabel(rule))}</b></div></div><div class="formula"><b>필요 입력</b><p>${req.map(esc).join(" · ") || "추가 성적 입력 없음"}</p>${gaps.length ? `<b>계산 제한 사유</b><p>${gaps.map(esc).join(" · ")}</p>` : ""}<b>적용 공식</b><p>${esc(rule.formula)}</p></div><div class="evidence"><b>원문 근거</b><p>${esc(Evidence.label(rule.evidence))} · ${esc(rule.verificationStatus)}</p><a href="${esc(Evidence.href(rule.evidence))}" ${Evidence.isExternal(rule.evidence) ? 'target="_blank" rel="noreferrer"' : "download"}>시행계획 원문 ${Evidence.isExternal(rule.evidence) ? "확인" : "다운로드"}</a></div>`;
  $("#result").scrollIntoView({ behavior: "smooth" });
}
function calculate() {
  const r = state.selectedRule;
  if (!r) {
    alert("먼저 대학·전형을 선택하세요.");
    return;
  }
  if (state.mode === "quick") {
    const input = quickInput(),
      assessment = ScoreValidator.quickAssessment(r, input),
      values = [
        input.allAverage && `전 교과 평균 ${input.allAverage}등급`,
        input.majorAverage && `주요 교과 평균 ${input.majorAverage}등급`,
        input.achievement && `진로선택 평균 ${input.achievement}`,
        `미인정 결석 ${input.unexcusedAbsence}일`,
      ]
        .filter(Boolean)
        .join(" · ");
    $("#resultView").insertAdjacentHTML(
      "beforeend",
      `<div class="evidence"><b>간편 판정: ${esc(assessment.mode)}</b><p>${esc(values)}</p><p><strong>${esc(assessment.label)}</strong></p>${assessment.missing?.length ? `<p>정확 계산에 추가로 필요한 학생 입력: ${assessment.missing.map(esc).join(" · ")}</p>` : ""}${assessment.disclosureGaps?.length ? `<p>학생이 입력해도 계산할 수 없는 미공개 기준: ${assessment.disclosureGaps.map(esc).join(" · ")}</p>` : ""}<p>${esc(assessment.warning)}</p></div>`,
    );
    state.compare.add(r.id);
    renderCompare();
    return;
  }
  const inputCourses = courses(),
    inputAttendance = attendance(),
    out = ScoreCalculator.calculate(r, inputCourses, inputAttendance);
  if (out.blocked) {
    const gaps = ScoreValidator.disclosureGaps(r);
    $("#resultView").insertAdjacentHTML(
      "beforeend",
      `<div class="warning"><b>계산을 중단했습니다.</b><p>추가 학생 입력: ${out.missing.map(esc).join(", ")}</p>${gaps.length ? `<p>대학 기준 미공개 또는 정량 미반영: ${gaps.map(esc).join(" · ")}</p>` : ""}</div>`,
    );
  } else {
    const rows = out.selected
      .map((c) => {
        const indicator =
          c.relativeScore != null
            ? `상대점수 ${c.relativeScore}`
            : c.rankGrade
              ? `석차 ${c.rankGrade}등급`
              : c.achievement || "-";
        const calculation = r.creditWeighting
          ? `${c.convertedScore} × ${c.credits || 0} = ${c.weighted}`
          : `${c.convertedScore} × 동일비율 = ${c.weighted}`;
        return `<tr><td>${esc(c.grade)}-${esc(c.semester)}</td><td>${esc(c.subject)}</td><td>${esc(c.name || c.subject)}</td><td>${esc(c.type || "-")}</td><td>${esc(indicator)}</td><td>${c.convertedScore}</td><td>${r.creditWeighting ? c.credits : "미적용"}</td><td>${esc(calculation)}</td></tr>`;
      })
      .join("");
    const excludedRows = (out.excludedDetails || [])
      .map(
        ({ course, reason }) =>
          `<tr><td>${esc(course.grade)}-${esc(course.semester)}</td><td>${esc(course.subject)}</td><td>${esc(course.name || course.subject)}</td><td>${esc(reason)}</td></tr>`,
      )
      .join("");
    const semesterGroups = new Map();
    out.selected.forEach((course) => {
      const key = `${course.grade}-${course.semester}`,
        item = semesterGroups.get(key) || { count: 0, weight: 0, weighted: 0 };
      item.count += 1;
      item.weight += r.creditWeighting ? Number(course.credits || 0) : 1;
      item.weighted += Number(course.weighted || 0);
      semesterGroups.set(key, item);
    });
    const semesterRows = [...semesterGroups.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(
        ([semester, item]) =>
          `<tr><td>${esc(semester)}</td><td>${item.count}</td><td>${item.weight}</td><td>${item.weight ? (item.weighted / item.weight).toFixed(3) : "-"}</td></tr>`,
      )
      .join("");
    const lowerIsBetter = r.scoreDirection === "lowerIsBetter",
      displayMaximum = lowerIsBetter ? null : r.componentMaximumScore || out.maximumScore,
      displayRatio =
        lowerIsBetter
          ? null
          : r.componentMaximumScore && out.total != null
          ? Math.trunc((out.total / r.componentMaximumScore) * 10000) / 100
          : out.ratio,
      scoreText = out.disqualified
      ? "부적격"
      : lowerIsBetter
        ? `${out.total}등급 (낮을수록 우수)`
        : `${out.total}${displayMaximum ? ` / ${displayMaximum}` : ""}${r.componentMaximumScore ? " (공개 정량분)" : ""}`;
    const violenceNote = out.schoolViolence?.level
      ? `<div class="warning"><b>학교폭력 ${out.schoolViolence.level}호 반영</b><p>${out.disqualified ? "시행계획에 따라 부적격 처리됩니다." : `전형 총점에서 ${out.schoolViolence.deduction}점 감점했습니다.`}</p></div>`
      : "";
    const calculationGaps = ScoreValidator.disclosureGaps(r),
      componentNote =
      r.status === "일부 계산 가능"
        ? `<div class="warning"><b>공개된 구성값만 계산했습니다.</b><p>${calculationGaps.map(esc).join(" · ")}</p></div>`
        : "";
    const totalCourseBonus =
      Number(out.selectedCourseBonus || 0) +
      Number(out.selectedCreditBonus || 0) +
      Number(out.selectedYearBonus || 0);
    const bonusNote = totalCourseBonus
      ? `<div class="info-card"><b>반영과목 가산점 +${totalCourseBonus}점</b><p>대학이 정한 등급·학년·과목·이수학점 조건을 적용했습니다.</p></div>`
      : "";
    const rounding = r.rounding?.final
      ? `최종 교과점수는 소수점 ${r.rounding.final.decimals}자리까지 ${r.rounding.final.mode === "round" ? "반올림" : "버림"}했습니다.`
      : "표시 자릿수는 규칙 데이터의 시행계획 기준을 적용했습니다.";
    const attendanceProcess = out.attendance
      ? `미인정 결석 ${Number(inputAttendance.unexcusedAbsence || 0)}일, 지각 ${Number(inputAttendance.tardy || 0)}회, 조퇴 ${Number(inputAttendance.early || 0)}회, 결과 ${Number(inputAttendance.missingClass || 0)}회 → 환산 결석 ${out.attendance.total}일 → 출결 ${out.attendance.score}점`
      : "출결 미반영";
    const volunteerProcess = out.volunteer
      ? `봉사활동 ${out.volunteer.hours}시간 → 봉사 ${out.volunteer.score}점`
      : "봉사활동 미반영";
    const careerCourses = out.selected.filter((course) =>
        ["진로선택", "융합선택"].includes(course.type),
      ),
      careerProcess = careerCourses.length
        ? careerCourses
            .map(
              (course) =>
                `${course.name || course.subject}(${course.type}, ${course.achievement || `${course.rankGrade}등급`} → ${course.convertedScore})`,
            )
            .join(" · ")
        : "진로·융합선택 반영 과목 없음";
    const deduction = Number(out.schoolViolence?.deduction || 0);
    const finalProcess = `교과 ${out.academicScore}점${out.attendance ? ` + 출결 ${out.attendance.score}점` : ""}${out.volunteer ? ` + 봉사 ${out.volunteer.score}점` : ""}${deduction ? ` - 학교폭력 감점 ${deduction}점` : ""} = ${out.disqualified ? "부적격" : `${out.total}점`}`;
    $("#resultView").insertAdjacentHTML(
      "beforeend",
      `<div class="result-top"><div><b>계산 결과</b><div class="score">${scoreText}</div></div><div>${displayRatio != null ? `${r.componentMaximumScore ? "공개 구성점수" : "만점"} 대비 <b>${displayRatio}%</b>` : "만점 대비 비율 없음"}</div></div><div class="metrics"><div class="metric">교과 환산점수<b>${out.academicScore}</b><small>환산 전 평균 ${out.rawAverage ?? "-"}</small></div><div class="metric">출결점수<b>${out.attendance?.score ?? "미반영"}${out.attendance?.rawScore != null ? `<small>표 점수 ${out.attendance.rawScore} × 환산배율</small>` : ""}</b></div><div class="metric">봉사점수<b>${out.volunteer?.score ?? "미반영"}</b></div><div class="metric">환산 결석<b>${out.attendance?.total ?? "-"}일</b></div></div>${componentNote}${bonusNote}${violenceNote}<div class="formula"><b>진로·융합선택 반영 과정</b><p>${esc(careerProcess)}</p><b>출결 환산 과정</b><p>${esc(attendanceProcess)}</p><b>봉사활동 환산 과정</b><p>${esc(volunteerProcess)}</p><b>최종 계산 과정</b><p>${esc(finalProcess)}</p></div><div class="course-results"><h3>반영된 과목과 계산 과정</h3><table><thead><tr><th>학기</th><th>교과</th><th>과목</th><th>과목 유형</th><th>입력지표</th><th>환산점수</th><th>이수학점</th><th>계산식</th></tr></thead><tbody>${rows}</tbody></table><h3>학년·학기별 반영 요약</h3><table><thead><tr><th>학기</th><th>과목 수</th><th>가중치 합</th><th>환산평균</th></tr></thead><tbody>${semesterRows || '<tr><td colspan="4">반영 과목 없음</td></tr>'}</tbody></table><h3>제외된 과목</h3><table><thead><tr><th>학기</th><th>교과</th><th>과목</th><th>제외 사유</th></tr></thead><tbody>${excludedRows || '<tr><td colspan="4">제외 과목 없음</td></tr>'}</tbody></table><p class="note">${esc(rounding)}</p></div>`,
    );
  }
  state.compare.add(r.id);
  renderCompare();
}
function renderCompare() {
  $("#compareBody").innerHTML = [...state.compare]
    .map((id) => {
      const r = SCORE_RULES.find((x) => x.id === id);
      if (state.mode === "quick") {
        const assessment = ScoreValidator.quickAssessment(r, quickInput());
        return `<tr><td>${esc(r.university)}<br><small>${esc(r.campus)}</small></td><td>${esc(r.admissionName)}</td><td>${esc(selectionLabel(r))}</td><td>${r.achievementConversion ? "환산" : "세부기준 미공개"}</td><td>${esc(ScoreValidator.attendanceStatus(r))}</td><td>${assessment.calculable ? esc(assessment.label) : "-"}</td><td>-</td><td>${esc(assessment.mode)}</td><td><a href="${esc(Evidence.href(r.evidence))}" ${Evidence.isExternal(r.evidence) ? 'target="_blank" rel="noreferrer"' : "download"}>원문</a></td></tr>`;
      }
      const o = ScoreCalculator.calculate(r, courses(), attendance()),
        lowerIsBetter = r.scoreDirection === "lowerIsBetter",
        score =
          o.blocked || o.total == null
            ? "-"
            : lowerIsBetter
              ? `${o.total}등급`
            : r.componentMaximumScore
              ? `${o.total}/${r.componentMaximumScore} 공개분`
              : o.total,
        ratio =
          lowerIsBetter
            ? null
            : r.componentMaximumScore && o.total != null
            ? Math.trunc((o.total / r.componentMaximumScore) * 10000) / 100
            : o.ratio;
      return `<tr><td>${esc(r.university)}<br><small>${esc(r.campus)}</small></td><td>${esc(r.admissionName)}</td><td>${esc(selectionLabel(r))}</td><td>${r.achievementConversion ? "환산" : "세부기준 미공개"}</td><td>${esc(ScoreValidator.attendanceStatus(r))}</td><td>${esc(score)}</td><td>${ratio == null ? "-" : ratio + "%"}</td><td>${esc(o.status || r.status)}</td><td><a href="${esc(Evidence.href(r.evidence))}" ${Evidence.isExternal(r.evidence) ? 'target="_blank" rel="noreferrer"' : "download"}>원문</a></td></tr>`;
    })
    .join("");
}
function download(name, text, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 500);
}
$$("[data-mode]").forEach(
  (b) =>
    (b.onclick = () => {
      state.mode = b.dataset.mode;
      $$("[data-mode]").forEach((x) => x.classList.toggle("active", x === b));
      $("#detailPanel").classList.toggle("hidden", state.mode !== "detail");
      $("#quickPanel").classList.toggle("hidden", state.mode !== "quick");
      renderCompare();
    }),
);
$$("[data-go]").forEach(
  (b) =>
    (b.onclick = () =>
      $("#" + b.dataset.go).scrollIntoView({ behavior: "smooth" })),
);
$("#privacyBtn").onclick = () => $("#privacy").showModal();
$("#privacy .close").onclick = () => $("#privacy").close();
$("#addRow").onclick = () => addRow();
$("#bulkSemesterAdd").onclick = () => {
  const grade = Number($("#bulkGrade").value),
    semester = Number($("#bulkSemester").value),
    count = Math.max(1, Math.min(30, Number($("#bulkCount").value || 8)));
  for (let index = 0; index < count; index += 1)
    addRow({ grade, semester, subject: "국어", type: "공통과목" });
  saveMaybe();
};
$("#duplicateRow").onclick = () => {
  const values = courses(),
    selectedIndexes = $$("#courseTable tbody tr")
      .map((row, index) =>
        row.querySelector(".row-check").checked ? index : null,
      )
      .filter((index) => index != null);
  selectedIndexes.forEach((index) => addRow(values[index]));
  saveMaybe();
};
$("#clearAll").onclick = () => {
  if (confirm("입력한 성적과 로컬 저장본을 모두 삭제할까요?")) {
    $("#courseTable tbody").innerHTML = "";
    localStorage.removeItem("power2028-record");
    $("#localSave").checked = false;
    $$('[data-att]').forEach((field) => { field.value = "0"; });
    ["#quickAll", "#quickCore", "#quickAch", "#quickAbs", "#csvInput", "#jsonInput", "#neisExcelInput"].forEach((selector) => { $(selector).value = ""; });
    window.clearTranscriptPhoto?.();
    window.clearNeisExcel?.();
    state.compare.clear();
    renderCompare();
    addRow();
    if (state.selectedRule) selectRule(state.selectedRule);
  }
};
$("#localSave").onchange = (e) =>
  e.target.checked ? saveMaybe() : localStorage.removeItem("power2028-record");
$$("[data-att]").forEach((x) => (x.oninput = saveMaybe));
$("#search").oninput = renderUniversityList;
$("#calculateBtn").onclick = calculate;
$("#exportJson").onclick = () =>
  download(
    "power-2028-record.json",
    JSON.stringify({ courses: courses(), attendance: attendance() }, null, 2),
    "application/json",
  );
$("#exportCsv").onclick = () => {
  const keys = [
    "grade",
    "semester",
    "subject",
    "name",
    "type",
    "credits",
    "rankGrade",
    "achievement",
    "passFail",
    "achievementScale",
    "classSize",
    "rank",
    "tiedRank",
    "rawScore",
    "mean",
    "stddev",
    "achievementRatio",
    "achievementRate",
  ];
  download(
    "power-2028-record.csv",
    "\ufeff" +
      [
        keys.join(","),
        ...courses().map((c) =>
          keys
            .map((k) => `"${String(c[k] ?? "").replaceAll('"', '""')}"`)
            .join(","),
        ),
      ].join("\n"),
    "text/csv",
  );
};
$("#csvInput").onchange = async (e) => {
  if (!e.target.files?.[0]) return;
  try {
    const supported = new Set(["grade", "semester", "subject", "name", "type", "credits", "rankGrade", "achievement", "passFail", "achievementScale", "classSize", "rank", "tiedRank", "rawScore", "mean", "stddev", "achievementRatio", "achievementRate"]),
      text = await e.target.files[0].text(),
      rows = CsvCodec.parse(text),
      headers = (rows.shift() || []).map((value) => value.replace(/^\ufeff/, "").trim()),
      known = headers.map((header, index) => supported.has(header) ? [header, index] : null).filter(Boolean);
    if (!known.length) throw new Error("지원하는 열 이름을 찾지 못했습니다. 먼저 CSV 내보내기 형식의 머리글을 확인해 주세요.");
    $("#courseTable tbody").innerHTML = "";
    rows.filter((values) => values.some((value) => String(value).trim() !== "")).forEach((values) =>
      addRow(Object.fromEntries(known.map(([header, index]) => [header, values[index]]))),
    );
    if (!$("#courseTable tbody").children.length) addRow();
    saveMaybe();
  } catch (error) {
    alert(`CSV를 불러오지 못했습니다. ${error.message || error}`);
  } finally {
    e.target.value = "";
  }
};
$("#jsonInput").onchange = async (event) => {
  if (!event.target.files?.[0]) return;
  try {
    const data = RecordCodec.parseJson(await event.target.files[0].text());
    $("#courseTable tbody").innerHTML = "";
    data.courses.forEach(addRow);
    $$('[data-att]').forEach((input) => {
      input.value = data.attendance[input.dataset.att] ?? 0;
    });
    if (!data.courses.length) addRow();
    saveMaybe();
    event.target.value = "";
  } catch (error) {
    alert(`JSON을 불러오지 못했습니다: ${error.message}`);
  }
};
loadSaved();
if (!$("#courseTable tbody tr")) {
  addRow();
}
renderUniversityList();
$("#catalogCount").textContent =
  COVERAGE_SUMMARY?.catalogCount || UNIVERSITY_CATALOG.length;
$("#sourceConnectedCount").textContent = COVERAGE_SUMMARY?.extracted || 0;
$("#reviewedCampusCount").textContent = COVERAGE_SUMMARY?.reviewedCampuses || 0;
$("#verifiedCampusCount").textContent =
  COVERAGE_SUMMARY?.campusesWithExactRules || 0;
$("#blockedCampusCount").textContent =
  COVERAGE_SUMMARY?.blockedOrPartialCampuses || 0;

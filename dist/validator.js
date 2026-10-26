window.ScoreValidator = {
  disclosureGaps(rule) {
    if (rule.status === "계산 가능") return [];
    if (rule.status === "해당 전형 미반영")
      return ["학생부 교과·출결 정량 환산 대상이 아님"];
    if (rule.status === "원문 확인 불가") return ["2028학년도 시행계획 원문"];
    const text = `${rule.formula || ""} ${rule.verificationStatus || ""}`,
      gaps = [];
    if (!rule.semesters) gaps.push("반영 학기 세부범위");
    if (!rule.includedSubjects?.length) gaps.push("반영 교과 세부범위");
    if (
      /(환산|산출|점수표|등급표).*(미공개|확인 필요|모집요강)|미공개.*(환산|산출|점수표|등급표)/.test(
        text,
      )
    )
      gaps.push("교과 환산식 또는 점수표");
    if (/출결|출석/.test(text) && !rule.attendanceRule)
      gaps.push("출결 환산표");
    if (rule.overallSchoolViolenceRule?.unknownLevels?.length)
      gaps.push("학교폭력 호수별 감점값");
    if (!Number.isFinite(rule.maximumScore)) gaps.push("최종 환산점수 만점");
    if (rule.allowComponentCalculation) gaps.push("공개 구성점수와 최종 총점의 결합 기준");
    if (!gaps.length) gaps.push("시행계획의 최종 세부 계산기준");
    return [...new Set(gaps)];
  },
  requiredFields(rule) {
    if (rule.status !== "계산 가능" && !rule.allowComponentCalculation) return [];
    const fields = [],
      selectionType = rule.selectionRule?.type || "",
      needsGrade =
        !!rule.semesters ||
        /Grade|grade|Year|year/.test(selectionType) ||
        ["gradeWeightedAverage", "gradeSemesterWeightedAverage"].includes(
          rule.aggregation?.type,
        ),
      needsSubject =
        !!rule.includedSubjects?.length ||
        !!rule.excludedSubjects?.length ||
        !!rule.requiredSubjects?.length ||
        !!rule.subjectWeights ||
        /Subject|subject|Group|group|staged/.test(selectionType);
    if (needsGrade) fields.push("grade");
    if (rule.semesters) fields.push("semester");
    if (needsSubject) fields.push("subject");
    if (rule.averageSameCourseAcrossSemesters || rule.excludedCourseNames?.length)
      fields.push("name");
    if (rule.includedCourseTypes?.length || rule.excludedCourseTypes?.length)
      fields.push("type");
    if (rule.gradeConversionTable || rule.gradeAchievementMatrix)
      fields.push("rankGrade");
    if (rule.achievementConversion || rule.gradeAchievementMatrix)
      fields.push("achievement");
    if (rule.requireAchievementScale) fields.push("achievementScale");
    if (
      rule.creditWeighting ||
      rule.aggregation?.type === "dualIndicatorCreditBand"
    )
      fields.push("credits");
    if (rule.minimumClassSize) fields.push("classSize");
    if (rule.rankPercentGradeBands)
      fields.push("rank", "tiedRank", "classSize");
    if (
      rule.achievementRatioRule ||
      rule.achievementCumulativeGradeRule
    )
      fields.push("achievementRatio");
    if (rule.achievementDistributionThresholds) fields.push("achievementRate");
    if (rule.achievementRatioRule) fields.push("rawScore");
    if (rule.distributionZScoreConversion)
      fields.push("rawScore", "mean", "achievementRatio");
    if (rule.zScoreGradeBands) fields.push("rawScore", "mean", "stddev");
    if (rule.courseScoreSource === "rawScore") fields.push("rawScore");
    return [...new Set(fields)];
  },
  requiredAttendanceFields(rule) {
    if (rule.status !== "계산 가능" && !rule.allowComponentCalculation) return [];
    const fields = [];
    if (rule.attendanceRule?.mode === "perfectAttendanceYears") {
      fields.push("perfectAttendanceYears");
    } else if (
      rule.attendanceRule &&
      rule.attendanceRule.mode !== "unpublishedTable"
    ) {
      fields.push("unexcusedAbsence");
      if (rule.attendanceRule.includeEvents !== false)
        fields.push("tardy", "early", "missingClass");
    }
    if (rule.volunteerRule) fields.push("volunteerHours");
    return fields;
  },
  requirements(rule) {
    if (rule.status !== "계산 가능" && !rule.allowComponentCalculation) return [];
    const labels = {
      grade: "학년",
      semester: "학기",
      subject: "교과",
      name: "과목명",
      type: "과목 유형",
      credits: "이수학점",
      rankGrade: "석차등급",
      achievement: rule.gradeAchievementMatrix
        ? "성취도(석차등급과 조합)"
        : "성취도(등급이 없는 과목)",
      achievementScale: "성취도 단계(3단계/5단계)",
      classSize: "수강자 수",
      rank: "석차",
      tiedRank: "공동석차 인원",
      rawScore: "원점수",
      mean: "과목평균",
      stddev: "표준편차",
      achievementRatio: "성취도별 분포비율",
      achievementRate: "현재 성취도의 성취비율(%)",
    };
    const fields = this.requiredFields(rule).map((key) => labels[key]);
    const attendanceLabels = {
      unexcusedAbsence: "미인정 결석",
      tardy: "미인정 지각",
      early: "미인정 조퇴",
      missingClass: "미인정 결과",
      perfectAttendanceYears: "1·2학년 개근 횟수",
      volunteerHours: "봉사활동 시간",
    };
    fields.push(
      ...this.requiredAttendanceFields(rule).map((key) => attendanceLabels[key]),
    );
    return fields;
  },
  quick(rule) {
    return (
      rule.quickMode ||
      (rule.status === "계산 가능" ? "상세 입력 필요" : "시행계획상 계산 불가")
    );
  },
  attendanceStatus(rule) {
    if (rule.attendanceStatus) return rule.attendanceStatus;
    if (rule.attendanceRule?.mode === "unpublishedTable")
      return "반영(세부표 미공개)";
    if (rule.attendanceRule) return "반영";
    const description = `${rule.formula || ""} ${rule.selectionRule?.note || ""}`;
    if (/출결\s*(미반영|반영하지)/.test(description)) return "미반영";
    if (/출결/.test(description)) return "기준 미공개";
    if (/(교과|학생부)\s*100%/.test(description)) return "미반영";
    return "미확인";
  },
  quickAssessment(rule, input = {}) {
    if (rule.quickCalculation?.type === "attendanceDeduction") {
      const absence = Math.max(0, Number(input.unexcusedAbsence || 0)),
        deduction =
          absence * Number(rule.quickCalculation.perUnexcusedAbsence || 0);
      return {
        mode: "간편 계산 가능",
        calculable: true,
        value: -deduction,
        label: `${rule.quickCalculation.unit || "총점"}에서 ${deduction}점 감점`,
        warning: "교과 환산점수가 아니라 시행계획에 공개된 출결 감점만 계산한 결과입니다.",
      };
    }
    if (rule.quickCalculation?.type === "averageGradeBands") {
      const source = rule.quickCalculation.source || "allAverage",
        average = Number(input[source]),
        minimum = Number(rule.quickCalculation.minimum ?? 1),
        maximum = Number(rule.quickCalculation.maximum ?? 9);
      if (!Number.isFinite(average) || average < minimum || average > maximum)
        return {
          mode: "간편 계산 가능",
          calculable: false,
          value: null,
          label: `${minimum}~${maximum} 범위의 평균등급을 입력하세요.`,
          missing: [source === "majorAverage" ? "주요 교과 평균등급" : "전 교과 평균등급"],
          warning: "평균등급 입력 전에는 참고 점수를 계산하지 않습니다.",
        };
      const score = rule.quickCalculation.bands.find(
        ([maximumExclusive]) => average < Number(maximumExclusive),
      )?.[1];
      return {
        mode: "간편 계산 가능",
        calculable: Number.isFinite(Number(score)),
        value: Number(score),
        label: `교과 환산 ${score}점 / ${rule.quickCalculation.maximumScore || rule.maximumScore}점`,
        warning:
          rule.quickCalculation.warning ||
          "평균등급을 사용한 참고 결과이며 상세 과목과 최종 모집요강을 반드시 확인하세요.",
      };
    }
    const missing = this.requirements(rule).filter(
      (label) => !["학년", "학기", "교과", "과목명"].includes(label),
    );
    return {
      mode: this.quick(rule),
      calculable: false,
      value: null,
      label:
        this.quick(rule) === "시행계획상 계산 불가"
          ? "시행계획만으로 환산점수를 계산할 수 없습니다."
          : "평균등급만으로 정확한 대학 환산점수를 만들 수 없습니다.",
      missing,
      disclosureGaps: this.disclosureGaps(rule),
      warning:
        this.quick(rule) === "제한적 추정"
          ? "입력값은 참고 수준으로만 표시되며 점수 계산에는 사용하지 않습니다."
          : "상세 입력 또는 최종 모집요강 확인이 필요합니다.",
    };
  },
};

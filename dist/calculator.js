(function (root) {
  const trunc = (n, d = 3) =>
    Math.trunc((n + Number.EPSILON) * 10 ** d) / 10 ** d;
  const round = (n, d = 3) =>
    Math.round((n + Number.EPSILON) * 10 ** d) / 10 ** d;
  const precision = (n, config, fallback = "truncate") => {
    const mode = config?.mode || fallback,
      decimals = config?.decimals ?? 3;
    if (mode === "none") return n;
    return mode === "round" ? round(n, decimals) : trunc(n, decimals);
  };
  const eligible = (course, rule) => {
    const cutoff = rule.semesters?.through || "3-1";
    return (
      `${course.grade}-${course.semester}` <= cutoff &&
      (!rule.includedGrades?.length ||
        rule.includedGrades.includes(Number(course.grade)))
    );
  };
  const isPassFail = (course) =>
    ["P", "F"].includes(
      String(course.passFail || course.achievement || "").toUpperCase(),
    );
  const allowedSubject = (course, rule) => {
    if (rule.requireRankGrade && !Number.isFinite(Number(course.rankGrade)))
      return false;
    if (
      rule.requireRankGradeCourseTypes?.includes(course.type) &&
      !Number.isFinite(Number(course.rankGrade))
    )
      return false;
    if (
      rule.excludePassFail &&
      isPassFail(course)
    )
      return false;
    if (rule.excludedCourseTypes?.includes(course.type)) return false;
    if (rule.excludedSubjects?.includes(course.subject)) return false;
    if (rule.excludedCourseNames?.includes(course.name)) return false;
    if (
      rule.minimumCourseCredits != null &&
      Number(course.credits || 0) < Number(rule.minimumCourseCredits)
    )
      return false;
    if (
      rule.excludedSubjectCourseTypes?.some(
        (x) => x.type === course.type && x.subjects.includes(course.subject),
      )
    )
      return false;
    if (
      rule.minimumClassSize &&
      course.classSize != null &&
      Number(course.classSize) < rule.minimumClassSize
    )
      return false;
    const gradeSubjects = rule.includedSubjectsByGrade?.[String(course.grade)];
    if (gradeSubjects?.length && !gradeSubjects.includes(course.subject))
      return false;
    if (rule.includedCourseTypes?.includes(course.type)) return true;
    return (
      !rule.includedSubjects?.length ||
      rule.includedSubjects.some(
        (s) =>
          s === "전 교과" ||
          s === course.subject ||
          (s === "탐구" && ["사회", "과학"].includes(course.subject)),
      )
    );
  };
  const exclusionReason = (course, rule) => {
    if (!eligible(course, rule))
      return rule.includedGrades?.length &&
        !rule.includedGrades.includes(Number(course.grade))
        ? `반영 학년(${rule.includedGrades.join("·")}학년)에 해당하지 않음`
        : `반영 학기(${rule.semesters?.through || "3-1"}까지) 초과`;
    if (
      rule.excludePassFail &&
      isPassFail(course)
    )
      return "P/F 과목 제외";
    if (rule.requireRankGrade && !Number.isFinite(Number(course.rankGrade)))
      return "석차등급 미산출 과목 제외";
    if (
      rule.requireRankGradeCourseTypes?.includes(course.type) &&
      !Number.isFinite(Number(course.rankGrade))
    )
      return `${course.type} 중 석차등급 미산출 과목 제외`;
    if (rule.excludedCourseTypes?.includes(course.type))
      return `제외 과목 유형(${course.type})`;
    if (rule.excludedSubjects?.includes(course.subject))
      return `제외 교과(${course.subject})`;
    if (rule.excludedCourseNames?.includes(course.name)) return "제외 지정 과목";
    if (
      rule.minimumCourseCredits != null &&
      Number(course.credits || 0) < Number(rule.minimumCourseCredits)
    )
      return `최소 이수학점 ${rule.minimumCourseCredits} 미만`;
    if (
      rule.minimumClassSize &&
      course.classSize != null &&
      Number(course.classSize) < rule.minimumClassSize
    )
      return `수강자 수 ${rule.minimumClassSize}명 미만`;
    if (!allowedSubject(course, rule)) return "반영 교과·과목 유형에 해당하지 않음";
    return "대학의 상위 과목·교과군 선발에서 제외";
  };
  function attendanceTotal(a, rule) {
    if (!rule) return null;
    const events =
      rule.includeEvents === false
        ? 0
        : Number(a.tardy || 0) +
          Number(a.early || 0) +
          Number(a.missingClass || 0);
    const convertedEvents = rule.eventConversionMode === "threeAsOneRemainderPointThree"
      ? Math.floor(events / 3) + (events % 3) * 0.3
      :
      rule.includeEvents === false
        ? 0
        : rule.round
          ? Math.round(events / rule.divisor)
          : rule.floor
            ? Math.floor(events / rule.divisor)
            : events / rule.divisor;
    return Number(a.unexcusedAbsence || 0) + convertedEvents;
  }
  function attendanceScore(a, rule) {
    if (!rule) return null;
    if (rule.mode === "unpublishedTable") return null;
    if (rule.mode === "perfectAttendanceYears") {
      const years = Math.min(
          Number(rule.maximumYears || 2),
          Math.max(0, Number(a.perfectAttendanceYears || 0)),
        ),
        score = years * Number(rule.pointsPerYear || 0);
      return { total: years, score, label: "1·2학년 개근 횟수" };
    }
    if (rule.mode === "eventDeductions") {
      const deduction =
          Math.max(0, Number(a.unexcusedAbsence || 0) - Number(rule.freeAbsences || 0)) * Number(rule.absenceDeduction || 0) +
          Number(a.tardy || 0) * Number(rule.tardyDeduction || 0) +
          Number(a.early || 0) * Number(rule.earlyDeduction || 0) +
          Number(a.missingClass || 0) * Number(rule.missingClassDeduction || 0),
        score = Math.max(
          Number(rule.minimum || 0),
          Number(rule.maximum || 0) - deduction,
        );
      return {
        total: deduction,
        score: precision(score, rule.rounding),
        deduction,
        label: "미인정 출결 항목별 감점",
      };
    }
    if (rule.mode === "absenceAndGroupedEvents") {
      const events =
          Number(a.tardy || 0) +
          Number(a.early || 0) +
          Number(a.missingClass || 0),
        convertedEvents = Math.floor(events / Number(rule.divisor || 3)),
        deduction =
          Number(a.unexcusedAbsence || 0) * Number(rule.absenceDeduction || 1) +
          convertedEvents * Number(rule.eventGroupDeduction || 1),
        score = Math.max(
          Number(rule.minimum || 0),
          Number(rule.maximum || 0) - deduction,
        );
      return {
        total: Number(a.unexcusedAbsence || 0) + convertedEvents,
        score,
        deduction,
      };
    }
    const total = attendanceTotal(a, rule);
    if (rule.mode === "linear") {
      const capped = Math.min(total, rule.cap ?? total),
        score =
          rule.minimum +
          (rule.maximum - rule.minimum) * ((rule.cap - capped) / rule.cap);
      return { total, score: precision(score, rule.rounding) };
    }
    const rawScore = rule.bands.find(([max]) => total <= max)?.[1] ?? 0;
    if (rule.scale != null)
      return {
        total,
        rawScore,
        score: precision(rawScore * Number(rule.scale), rule.rounding),
      };
    return { total, score: rawScore };
  }
  function volunteerScore(input, rule) {
    if (!rule) return null;
    const hours = Math.max(0, Number(input.volunteerHours || 0)),
      score =
        rule.bands.find(([minimum]) => hours >= Number(minimum))?.[1] ??
        rule.bands.at(-1)?.[1] ??
        0;
    return { hours, score: Number(score) };
  }
  function schoolViolence(level, rule, attendanceValue = 0, maximumScore = 0) {
    const value = Number(level || 0);
    if (!rule || !value) return { level: 0, deduction: 0, disqualified: false };
    const rate = Number(rule.attendanceDeductionRates?.[String(value)] || 0),
      percent = Number(rule.percentDeductions?.[String(value)] || 0);
    return {
      level: value,
      deduction: rate
        ? attendanceValue * rate
        : percent
          ? maximumScore * (percent / 100)
          : Number(rule.deductions?.[String(value)] || 0),
      deductionRate: rate,
      deductionPercent: percent,
      disqualified: rule.disqualifying?.includes(value) || false,
    };
  }
  function achievementRatios(value) {
    const ratios = {};
    String(value || "")
      .split(/[,/]/)
      .forEach((part) => {
        const match = part.match(/([A-E])\s*[:=]?\s*(\d+(?:\.\d+)?)/i);
        if (match) ratios[match[1].toUpperCase()] = Number(match[2]);
      });
    return ratios;
  }
  function cumulativeAchievementGrade(course, rule, achievement) {
    if (!rule.achievementCumulativeGradeRule || course.rankGrade) return null;
    if (achievement === "A") return "1";
    const ratios = achievementRatios(course.achievementRatio);
    const order = ["A", "B", "C", "D", "E"];
    const start = order.indexOf(achievement);
    if (start < 0 || order.slice(start).some((key) => ratios[key] == null))
      return null;
    const cumulative = order
      .slice(start)
      .reduce((sum, key) => sum + ratios[key], 0);
    return String(
      rule.achievementCumulativeGradeRule.bands.find(
        ([minimum]) => cumulative >= minimum,
      )?.[1] ?? 5,
    );
  }
  function derivedRankGrade(course, rule, achievement) {
    if (course.rankGrade && !rule.preferBetterGradeIndicator) return null;
    if (rule.zScoreGradeBands) {
      const raw = Number(course.rawScore),
        mean = Number(course.mean),
        deviation = Number(course.standardDeviation ?? course.stddev);
      if (Number.isFinite(raw) && Number.isFinite(mean) && deviation > 0) {
        const z = round((raw - mean) / deviation, 2);
        return String(
          rule.zScoreGradeBands.find(([minimum]) => z >= minimum)?.[1] ?? 5,
        );
      }
    }
    if (rule.rankPercentGradeBands) {
      const rank = Number(course.rank),
        ties = Number(course.tiedRank || course.tieCount || 1),
        classSize = Number(course.classSize);
      if (rank > 0 && classSize > 0) {
        const percentile =
          ((rank + (Math.max(ties, 1) - 1) / 2) / classSize) * 100;
        return String(
          rule.rankPercentGradeBands.find(
            ([maximum]) => percentile <= maximum,
          )?.[1] ?? 5,
        );
      }
    }
    if (rule.careerAchievementGrades && course.type === "진로선택")
      return String(rule.careerAchievementGrades[achievement] ?? "");
    if (rule.ungradedAchievementGrades)
      return String(rule.ungradedAchievementGrades[achievement] ?? "");
    if (
      rule.fusionCumulativeGradeRule &&
      course.type === "융합선택" &&
      ["사회", "과학"].includes(course.subject)
    ) {
      if (achievement === "A") return "1";
      const ratios = achievementRatios(course.achievementRatio),
        keys = rule.fusionCumulativeGradeRule.ratioKeys?.[achievement] || [];
      if (!keys.length || keys.some((key) => ratios[key] == null)) return null;
      const cumulative = keys.reduce((sum, key) => sum + ratios[key], 0);
      return String(
        rule.fusionCumulativeGradeRule.bands.find(
          ([minimum]) => cumulative >= minimum,
        )?.[1] ?? 5,
      );
    }
    return null;
  }
  function scoreCourse(c, rule) {
    const originalAchievement = String(c.achievement || "").toUpperCase(),
      ratios = achievementRatios(c.achievementRatio),
      achievementOrder = ["A", "B", "C", "D", "E"],
      adjustment = rule.achievementDistributionAdjustment,
      achievementIndex = achievementOrder.indexOf(originalAchievement),
      downgrade =
        adjustment && achievementIndex >= 0
          ? adjustment.rules.find((item) => {
              const total = item.keys.reduce(
                (sum, key) => sum + Number(ratios[key] || 0),
                0,
              );
              return total > Number(item.maximum);
            })
          : null,
      achievement = downgrade
        ? achievementOrder[
            Math.min(achievementIndex + Number(downgrade.steps || 1), 4)
          ]
        : originalAchievement,
      derivedGrade =
        cumulativeAchievementGrade(c, rule, achievement) ||
        derivedRankGrade(c, rule, achievement),
      grade = String(
        rule.preferBetterGradeIndicator && c.rankGrade && derivedGrade
          ? Math.min(Number(c.rankGrade), Number(derivedGrade))
          : (c.rankGrade ?? derivedGrade ?? ""),
      );
    const matrix = rule.gradeAchievementMatrix?.[grade]?.[achievement];
    const g =
      rule.gradeConversionTableByCourseType?.[c.type]?.[grade] ??
      rule.gradeConversionTable?.[grade];
    const achievementAllowed =
      (!rule.achievementEligibleSubjects?.length ||
        rule.achievementEligibleSubjects.includes(c.subject)) &&
      (!rule.achievementEligibleCourseTypes?.length ||
        rule.achievementEligibleCourseTypes.includes(c.type));
    const courseTypeAchievementTable =
        rule.achievementConversionByCourseType?.[c.type],
      achievementScaleTable =
        rule.achievementConversionByScale?.[String(c.achievementScale || "")];
    const a = achievementAllowed
      ? (achievementScaleTable?.[achievement] ??
        courseTypeAchievementTable?.[achievement] ??
        rule.achievementConversion?.[achievement])
      : undefined;
    let distributionConversion = null;
    if (
      rule.distributionZScoreConversion &&
      c.type !== rule.distributionZScoreConversion.excludedCourseType
    ) {
      const raw = Number(c.rawScore),
        mean = Number(c.mean),
        ratios = achievementRatios(c.achievementRatio),
        values = rule.distributionZScoreConversion.classValues,
        keys = Object.keys(values || {});
      if (
        String(c.rawScore ?? "").trim() &&
        String(c.mean ?? "").trim() &&
        keys.length &&
        keys.every((key) => Number.isFinite(ratios[key]))
      ) {
        const variance = keys.reduce(
            (sum, key) =>
              sum +
              (Number(values[key]) - mean) ** 2 * (Number(ratios[key]) / 100),
            0,
          ),
          deviation = Math.sqrt(variance),
          relativeScore =
            deviation > 0
              ? round(
                  (raw - mean) / deviation,
                  rule.distributionZScoreConversion.relativeDecimals ?? 2,
                )
              : null;
        if (relativeScore != null)
          distributionConversion = {
            variance,
            deviation,
            relativeScore,
            score:
              rule.distributionZScoreConversion.bands.find(
                ([minimum]) => relativeScore >= minimum,
              )?.[1] ?? null,
          };
      }
    }
    let score = Number.isFinite(distributionConversion?.score)
      ? distributionConversion.score
      : Number.isFinite(matrix)
        ? matrix
        : rule.combineIndicators === "sum"
          ? (Number.isFinite(g) ? g : 0) + (Number.isFinite(a) ? a : 0)
          : Number.isFinite(g)
            ? g
            : Number.isFinite(a)
              ? a
              : null;
    if (rule.courseScoreSource === "rawScore") {
      const rawScore = Number(c.rawScore);
      score = String(c.rawScore ?? "").trim() && Number.isFinite(rawScore)
        ? rawScore
        : null;
    }
    if (rule.courseScoreTransform?.type === "gradePlusAchievementARatio") {
      const aRatio = Number(ratios.A);
      score =
        Number.isFinite(Number(grade)) && Number.isFinite(aRatio)
          ? Number(rule.courseScoreTransform.maximum || 1000) -
            Number(rule.courseScoreTransform.step || 200) *
              (Number(grade) + aRatio / 100 - 1)
          : null;
    }
    if (rule.preferHigherIndicator && Number.isFinite(g) && Number.isFinite(a))
      score = Math.max(g, a);
    const indicatorWeights =
      rule.indicatorWeightsByCourseType?.[c.type] || rule.indicatorWeights;
    if (indicatorWeights) {
      const gradeWeight = Number(indicatorWeights.grade || 0),
        achievementWeight = Number(indicatorWeights.achievement || 0);
      score =
        rule.achievementOnlyFullWeight && !Number.isFinite(g) && Number.isFinite(a)
          ? a
          : (!gradeWeight || Number.isFinite(g)) &&
              (!achievementWeight || Number.isFinite(a))
            ? (Number.isFinite(g) ? g * gradeWeight : 0) +
              (Number.isFinite(a) ? a * achievementWeight : 0)
            : null;
    }
    const ratioText = String(c.achievementRatio || ""),
      ratioMatch = ratioText.match(
        new RegExp(`${achievement}\\s*[:=]?\\s*(\\d+(?:\\.\\d+)?)`, "i"),
      ),
      ratio = String(c.achievementRate ?? "").trim()
        ? Number(c.achievementRate)
        : ratioMatch
          ? Number(ratioMatch[1])
          : Number(c.achievementRatio);
    if (
      score != null &&
      Number.isFinite(ratio) &&
      ratio >
        Number(
          rule.achievementDistributionThresholds?.[achievement] ?? Infinity,
        )
    )
      score *= Number(rule.achievementDistributionMultiplier || 1);
    const courseBonusPercent =
      score != null &&
      rule.courseAchievementBonus?.courseTypes?.includes(c.type) &&
      rule.courseAchievementBonus?.subjects?.includes(c.subject)
        ? Number(
            rule.courseAchievementBonus.percentByAchievement?.[achievement] ||
              0,
          )
        : 0;
    if (courseBonusPercent) score *= 1 + courseBonusPercent / 100;
    const credit = rule.creditWeighting ? Number(c.credits || 0) : 1,
      subjectWeight = Number(rule.subjectWeights?.[c.subject] || 1);
    return {
      ...c,
      gradeConverted: Number.isFinite(g) ? g : null,
      achievementConverted: Number.isFinite(a) ? a : null,
      originalAchievement,
      adjustedAchievement: achievement,
      achievementOnly: !c.rankGrade && !!achievement,
      derivedGrade,
      effectiveGrade: grade ? Number(grade) : null,
      achievementDistribution: ratio,
      distributionVariance: distributionConversion?.variance ?? null,
      distributionDeviation: distributionConversion?.deviation ?? null,
      relativeScore: distributionConversion?.relativeScore ?? null,
      convertedScore: score,
      courseBonusPercent,
      subjectWeight,
      weighted: score == null ? null : score * credit * subjectWeight,
    };
  }
  function mergeSemesterCourses(courses) {
    const groups = new Map();
    courses.forEach((course) => {
      const key = `${course.grade}|${course.name || course.subject}`;
      groups.set(key, [...(groups.get(key) || []), course]);
    });
    return [...groups.values()].map((items) => {
      if (items.length === 1) return items[0];
      const convertedScore =
          items.reduce((sum, item) => sum + item.convertedScore, 0) /
          items.length,
        credits = items.reduce(
          (sum, item) => sum + Number(item.credits || 0),
          0,
        );
      return {
        ...items[0],
        _inputIndexes: items.flatMap((item) =>
          item._inputIndexes?.length ? item._inputIndexes : [item._inputIndex],
        ),
        semester: "1·2",
        credits,
        convertedScore,
        weighted:
          convertedScore * credits * Number(items[0].subjectWeight || 1),
        mergedSemesters: items.length,
      };
    });
  }
  function selectCourses(courses, rule) {
    const scored = courses
      .filter((c) => eligible(c, rule) && allowedSubject(c, rule))
      .map((c) => scoreCourse(c, rule))
      .filter((c) => c.convertedScore != null)
      .sort((a, b) => {
        if (rule.selectionRule.sort === "convertedScoreAsc")
          return (
            a.convertedScore - b.convertedScore ||
            Number(b.credits || 0) - Number(a.credits || 0)
          );
        if (rule.selectionRule.sort === "rankGradeAsc")
          return (
            Number(a.effectiveGrade ?? Infinity) -
              Number(b.effectiveGrade ?? Infinity) ||
            Number(b.credits || 0) - Number(a.credits || 0)
          );
        return (
          b.convertedScore - a.convertedScore ||
          Number(b.credits || 0) - Number(a.credits || 0)
        );
      });
    if (rule.selectionRule.type === "allWithCategoryCaps") {
      const career = scored
          .filter((c) => c.type === "진로선택" && !c.rankGrade)
          .slice(0, rule.selectionRule.careerCount ?? 3),
        ungraded = scored
          .filter((c) => c.type !== "진로선택" && !c.rankGrade && c.achievement)
          .slice(0, rule.selectionRule.ungradedCount ?? 3),
        ordinary = scored.filter(
          (c) =>
            c.rankGrade ||
            (!career.includes(c) && !ungraded.includes(c) && !c.achievement),
        );
      return ordinary.concat(career, ungraded);
    }
    if (rule.selectionRule.type === "allWithTypeCap") {
      const cappedTypes = rule.selectionRule.cappedCourseTypes || [rule.selectionRule.cappedCourseType],
        ordinary = scored.filter((c) => !cappedTypes.includes(c.type)),
        capped = scored
          .filter((c) => cappedTypes.includes(c.type))
          .slice(0, rule.selectionRule.count);
      return ordinary.concat(capped);
    }
    if (rule.selectionRule.type === "topNWithTypeCap") {
      const cappedTypes = rule.selectionRule.cappedCourseTypes || [],
        cap = Number(rule.selectionRule.typeCap ?? Infinity),
        count = Number(rule.selectionRule.count || 0),
        picked = [];
      for (const course of scored) {
        if (picked.length >= count) break;
        if (
          cappedTypes.includes(course.type) &&
          picked.filter((item) => cappedTypes.includes(item.type)).length >= cap
        )
          continue;
        picked.push(course);
      }
      return picked;
    }
    if (rule.selectionRule.type === "allSubjectsPlusGroupTopN") {
      const required = scored.filter((course) =>
          rule.selectionRule.allSubjects.includes(course.subject),
        ),
        additional = scored
          .filter((course) =>
            rule.selectionRule.topGroupSubjects.includes(course.subject),
          )
          .slice(0, rule.selectionRule.topGroupCount);
      required.forEach((course) => {
        course.selectionGroup = rule.selectionRule.allLabel || "전 과목";
      });
      additional.forEach((course) => {
        course.selectionGroup = rule.selectionRule.topGroupLabel || "상위 과목";
      });
      return required.concat(additional);
    }
    if (rule.selectionRule.type === "commonAllChoiceTopN")
      return scored
        .filter((c) => c.type === "공통과목")
        .concat(
          scored
            .filter((c) => c.type !== "공통과목")
            .slice(0, rule.selectionRule.count),
        );
    if (rule.selectionRule.type === "rankedPlusAchievementTopN") {
      const rankedCount = Number(rule.selectionRule.rankedCount || 0),
        achievementCount = Number(rule.selectionRule.achievementCount || 0),
        ranked = scored.filter((course) => course.rankGrade).slice(0, rankedCount),
        achievement = scored
          .filter((course) => !course.rankGrade && course.achievement)
          .slice(0, achievementCount),
        selected = ranked.concat(achievement),
        shortageScore = rule.selectionRule.shortageScore;
      for (let i = ranked.length; shortageScore != null && i < rankedCount; i++)
        selected.push({
          name: "석차등급 반영 부족 과목",
          subject: "부족",
          type: "보정",
          credits: 1,
          rankGrade: 5,
          convertedScore: shortageScore,
          subjectWeight: 1,
          weighted: shortageScore,
          synthetic: true,
        });
      for (
        let i = achievement.length;
        shortageScore != null && i < achievementCount;
        i++
      )
        selected.push({
          name: "성취도 반영 부족 과목",
          subject: "부족",
          type: "보정",
          credits: 1,
          achievement: "E",
          convertedScore: shortageScore,
          subjectWeight: 1,
          weighted: shortageScore,
          synthetic: true,
        });
      return selected;
    }
    if (rule.selectionRule.type === "perGradeSubjectGroups") {
      const selected = [];
      Object.entries(rule.selectionRule.grades).forEach(([grade, groups]) =>
        groups.forEach((group) => {
          const pool = scored.filter(
            (c) =>
              String(c.grade) === grade && group.subjects.includes(c.subject),
          );
          const picked =
            group.mode === "topN" ? pool.slice(0, group.count || 1) : pool;
          selected.push(...picked);
          if (!picked.length && group.shortageScore != null)
            selected.push({
              name: `${grade}학년 ${group.label || group.subjects.join("·")} 부족`,
              subject: "부족",
              type: "보정",
              grade: Number(grade),
              credits: 1,
              rankGrade: 5,
              convertedScore: group.shortageScore,
              subjectWeight: 1,
              weighted: group.shortageScore,
              synthetic: true,
            });
        }),
      );
      return selected;
    }
    if (rule.selectionRule.type === "perSemesterSubjectBest") {
      const selected = [];
      const semesterKeys = [
        ...new Set(scored.map((course) => `${course.grade}-${course.semester}`)),
      ].sort();
      semesterKeys.forEach((semesterKey) => {
        const termCourses = scored.filter(
            (course) => `${course.grade}-${course.semester}` === semesterKey,
          ),
          used = new Set();
        rule.selectionRule.groups.forEach((group) => {
          let picked = termCourses.find(
            (course) =>
              !used.has(course._inputIndex) &&
              group.subjects.includes(course.subject),
          );
          if (!picked && rule.selectionRule.fallbackToUnselectedSubject)
            picked = termCourses.find(
              (course) => !used.has(course._inputIndex),
            );
          if (picked) {
            used.add(picked._inputIndex);
            selected.push({ ...picked, selectionGroup: group.label });
          }
        });
      });
      return selected;
    }
    if (rule.selectionRule.type === "perGradeSubjectGroupsWithFallback") {
      const selected = [];
      rule.selectionRule.grades.forEach((grade) => {
        const gradeCourses = scored.filter(
            (course) => Number(course.grade) === Number(grade),
          ),
          usedFallbackSubjects = new Set();
        rule.selectionRule.groups.forEach((group) => {
          let items = gradeCourses.filter((course) =>
            group.subjects.includes(course.subject),
          );
          if (!items.length) {
            const fallbackSubject = rule.selectionRule.fallbackSubjects.find(
              (subject) =>
                !usedFallbackSubjects.has(subject) &&
                gradeCourses.some((course) => course.subject === subject),
            );
            if (fallbackSubject) {
              usedFallbackSubjects.add(fallbackSubject);
              items = gradeCourses.filter(
                (course) => course.subject === fallbackSubject,
              );
            }
          }
          selected.push(
            ...items.map((course) => ({
              ...course,
              selectionGroup: group.label,
            })),
          );
        });
      });
      return selected;
    }
    if (rule.selectionRule.type === "perGradeTopN") {
      const selected = [];
      Object.entries(rule.selectionRule.counts).forEach(([grade, count]) => {
        const picked = scored
          .filter((c) => String(c.grade) === grade)
          .slice(0, count);
        selected.push(...picked);
        if (rule.selectionRule.allowShortage) return;
        for (let i = picked.length; i < count; i++) {
          const gradeScore = rule.selectionRule.shortageGradeScore,
            achievementScore = rule.selectionRule.shortageAchievementScore;
          selected.push({
            name: `${grade}학년 부족 과목`,
            subject: "부족",
            type: "보정",
            grade: Number(grade),
            credits: 0,
            rankGrade: 5,
            gradeConverted: gradeScore,
            achievementConverted: achievementScore,
            convertedScore: gradeScore + achievementScore,
            subjectWeight: 1,
            weighted: gradeScore + achievementScore,
            synthetic: true,
          });
        }
      });
      return selected;
    }
    if (rule.selectionRule.type === "perGradeDistinctSubjectsTopN") {
      return (rule.selectionRule.grades || [1, 2, 3]).flatMap((grade) => {
        const gradeCourses = scored.filter(
            (course) => Number(course.grade) === Number(grade),
          ),
          bestBySubject = new Map();
        gradeCourses.forEach((course) => {
          if (!bestBySubject.has(course.subject))
            bestBySubject.set(course.subject, course);
        });
        const picked = [...bestBySubject.values()]
          .sort((a, b) => b.convertedScore - a.convertedScore)
          .slice(0, Number(rule.selectionRule.count || 0));
        for (let i = picked.length; i < Number(rule.selectionRule.count || 0); i++)
          if (rule.selectionRule.shortageScore != null)
            picked.push({
              name: `${grade}학년 부족 과목`, subject: "부족", type: "보정",
              grade: Number(grade), credits: 1,
              convertedScore: Number(rule.selectionRule.shortageScore),
              subjectWeight: 1, weighted: Number(rule.selectionRule.shortageScore),
              synthetic: true,
            });
        return picked;
      });
    }
    if (rule.selectionRule.type === "stagedTopNWithUngradedCap") {
      const picked = [],
        cap = Number(rule.selectionRule.ungradedCap ?? Infinity),
        isUngraded = (course) => !Number.isFinite(Number(course.rankGrade)),
        canPick = (course) =>
          !picked.includes(course) &&
          (!isUngraded(course) || picked.filter(isUngraded).length < cap),
        take = (pool, count, label) => {
          pool.forEach((course) => {
            if (picked.filter((item) => item.selectionGroup === label).length >= count)
              return;
            if (!canPick(course)) return;
            course.selectionGroup = label;
            picked.push(course);
          });
        };
      const first = rule.selectionRule.firstStage;
      take(
        scored.filter((course) => first.subjects.includes(course.subject)),
        Number(first.count),
        first.label,
      );
      take(scored, Number(rule.selectionRule.count) - picked.length, rule.selectionRule.remainderLabel);
      return picked;
    }
    if (rule.selectionRule.type === "groupedYearTopN") {
      return rule.selectionRule.groups.flatMap((group) => {
        const picked = scored
          .filter((course) => group.grades.includes(Number(course.grade)))
          .slice(0, group.count);
        picked.forEach((course) => {
          course.selectionGroup = group.label;
        });
        return picked;
      });
    }
    if (rule.selectionRule.type === "perSubjectTopN") {
      const groups =
        rule.selectionRule.groups ||
        rule.selectionRule.subjects.map((subject) => ({ subjects: [subject] }));
      return groups.flatMap((group) => {
        const count = group.count ?? rule.selectionRule.count,
          picked = scored
            .filter((c) => group.subjects.includes(c.subject))
            .slice(0, count);
        if (group.shortageScore != null)
          for (let i = picked.length; i < count; i++)
            picked.push({
              name: `${group.label || group.subjects.join("·")} 부족 과목`,
              subject: "부족",
              type: "보정",
              credits: 1,
              convertedScore: group.shortageScore,
              subjectWeight: 1,
              weighted: group.shortageScore,
              synthetic: true,
            });
        picked.forEach((course) => {
          course.selectionGroup = group.label || group.subjects.join("·");
        });
        return picked;
      });
    }
    if (rule.selectionRule.type === "perSubjectTopNPlusTypeTopN") {
      const extraTypes = rule.selectionRule.extraCourseTypes || [],
        ordinary = scored.filter((course) => !extraTypes.includes(course.type)),
        extra = scored
          .filter((course) => extraTypes.includes(course.type))
          .slice(0, Number(rule.selectionRule.extraCount || 0)),
        selected = (rule.selectionRule.subjects || []).flatMap((subject) =>
          ordinary
            .filter((course) => course.subject === subject)
            .slice(0, Number(rule.selectionRule.perSubjectCount || 0)),
        );
      selected.forEach((course) => { course.selectionGroup = "공통·일반선택 교과별 상위 과목"; });
      extra.forEach((course) => { course.selectionGroup = "진로선택 상위 과목"; });
      return selected.concat(extra);
    }
    if (rule.selectionRule.type === "perGroupBestAlternative") {
      return rule.selectionRule.groups.flatMap((group) => {
        const alternatives = group.alternatives.map((subjects) => {
            const picked = scored
              .filter((course) => subjects.includes(course.subject))
              .slice(0, group.count);
            if (group.shortageScore != null)
              for (let i = picked.length; i < group.count; i++)
                picked.push({
                  name: `${group.label} 부족 과목`,
                  subject: "부족",
                  type: "보정",
                  credits: 1,
                  convertedScore: group.shortageScore,
                  subjectWeight: 1,
                  weighted: group.shortageScore,
                  synthetic: true,
                });
            const denominator = rule.creditWeighting
                ? picked.reduce(
                    (sum, course) => sum + Number(course.credits || 0),
                    0,
                  )
                : picked.length,
              average = denominator
                ? picked.reduce(
                    (sum, course) =>
                      sum +
                      course.convertedScore *
                        (rule.creditWeighting
                          ? Number(course.credits || 0)
                          : 1),
                    0,
                  ) / denominator
                : -Infinity;
            return { picked, average };
          }),
          best = alternatives.sort((a, b) => b.average - a.average)[0];
        best.picked.forEach((course) => {
          course.selectionGroup = group.label;
        });
        return best.picked;
      });
    }
    if (rule.selectionRule.type === "dropWorstPerGroup") {
      return rule.selectionRule.groups.flatMap((group) => {
        const candidates = scored.filter((course) =>
            group.subjects.includes(course.subject),
          ),
          keepCount = Math.max(0, candidates.length - Number(group.drop || 0)),
          picked = candidates.slice(0, keepCount);
        picked.forEach((course) => {
          course.selectionGroup = group.label;
        });
        return picked;
      });
    }
    if (rule.selectionRule.type === "bestSubjectGroupsAllCourses") {
      return rule.selectionRule.groups
        .map((group) => {
          const alternatives = (group.alternatives || [group.subjects]).map(
              (subjects) => {
                const picked = scored.filter((course) =>
                    subjects.includes(course.subject),
                  ),
                  denominator = picked.reduce(
                    (sum, course) =>
                      sum +
                      (rule.creditWeighting
                        ? Number(course.credits || 0)
                        : 1),
                    0,
                  ),
                  average = denominator
                    ? picked.reduce(
                        (sum, course) =>
                          sum +
                          course.convertedScore *
                            (rule.creditWeighting
                              ? Number(course.credits || 0)
                              : 1),
                        0,
                      ) / denominator
                    : -Infinity;
                return { picked, average };
              },
            ),
            best = alternatives.sort((a, b) =>
              rule.selectionRule.lowerIsBetter
                ? a.average - b.average
                : b.average - a.average,
            )[0],
            picked = best.picked,
            average = best.average;
          picked.forEach((course) => {
            course.selectionGroup = group.label;
          });
          return { picked, average };
        })
        .sort((a, b) =>
          rule.selectionRule.lowerIsBetter
            ? a.average - b.average
            : b.average - a.average,
        )
        .slice(0, rule.selectionRule.count)
        .flatMap((group) => group.picked);
    }
    if (rule.selectionRule.type === "bestSubjectGroupsTopN") {
      const groups = rule.selectionRule.groups || [],
        choose = Number(rule.selectionRule.choose || groups.length),
        combinations = [];
      function build(start, picked) {
        if (picked.length === choose) {
          combinations.push(picked);
          return;
        }
        for (let i = start; i < groups.length; i++)
          build(i + 1, picked.concat(groups[i]));
      }
      build(0, []);
      const options = combinations.map((chosenGroups) => {
        const selected = [],
          groupLimit = rule.selectionRule.maxCourseGroup;
        for (const course of scored) {
          const group = chosenGroups.find((item) =>
            item.subjects.includes(course.subject),
          );
          if (!group) continue;
          if (
            groupLimit &&
            (!groupLimit.courseTypes?.length ||
              groupLimit.courseTypes.includes(course.type)) &&
            (!groupLimit.subjects?.length ||
              groupLimit.subjects.includes(course.subject)) &&
            selected.filter(
              (x) =>
                (!groupLimit.courseTypes?.length ||
                  groupLimit.courseTypes.includes(x.type)) &&
                (!groupLimit.subjects?.length ||
                  groupLimit.subjects.includes(x.subject)),
            ).length >= Number(groupLimit.count || 0)
          )
            continue;
          course.selectionGroup = group.label;
          selected.push(course);
          if (selected.length === Number(rule.selectionRule.count)) break;
        }
        return {
          selected,
          score: selected.reduce(
            (sum, course) => sum + Number(course.convertedScore || 0),
            0,
          ),
        };
      });
      options.sort(
        (a, b) =>
          b.selected.length - a.selected.length || b.score - a.score,
      );
      return options[0]?.selected || [];
    }
    if (rule.selectionRule.type === "topN") {
      const limit = rule.selectionRule.maxCourseTypes,
        groupLimit = rule.selectionRule.maxCourseGroup,
        selected = [];
      for (const course of scored) {
        if (
          limit &&
          limit.types.includes(course.type) &&
          selected.filter((x) => limit.types.includes(x.type)).length >=
            limit.count
        )
          continue;
        if (
          groupLimit &&
          (!groupLimit.courseTypes?.length ||
            groupLimit.courseTypes.includes(course.type)) &&
          (!groupLimit.subjects?.length ||
            groupLimit.subjects.includes(course.subject)) &&
          selected.filter(
            (x) =>
              (!groupLimit.courseTypes?.length ||
                groupLimit.courseTypes.includes(x.type)) &&
              (!groupLimit.subjects?.length ||
                groupLimit.subjects.includes(x.subject)),
          ).length >= Number(groupLimit.count || 0)
        )
          continue;
        if (
          course.achievementOnly &&
          rule.selectionRule.maxAchievementOnly != null &&
          selected.filter((x) => x.achievementOnly).length >=
            rule.selectionRule.maxAchievementOnly
        )
          continue;
        selected.push(course);
        if (selected.length === rule.selectionRule.count) break;
      }
      for (
        let i = selected.length;
        rule.selectionRule.shortageScore != null &&
        i < rule.selectionRule.count;
        i++
      ) {
        const score = rule.selectionRule.shortageScore;
        if (score == null) break;
        selected.push({
          name: "부족 과목",
          subject: "부족",
          type: "보정",
          credits: 1,
          rankGrade: 5,
          convertedScore: score,
          subjectWeight: 1,
          weighted: score,
          synthetic: true,
        });
      }
      return selected;
    }
    if (rule.selectionRule.type === "primaryThenFallback") {
      const primary = scored
          .filter(
            (course) =>
              !rule.selectionRule.fallbackCourseTypes.includes(course.type),
          )
          .slice(0, rule.selectionRule.count),
        fallbackNeeded = Math.min(
          rule.selectionRule.fallbackCount || 0,
          rule.selectionRule.count - primary.length,
        ),
        fallback = scored
          .filter((course) =>
            rule.selectionRule.fallbackCourseTypes.includes(course.type),
          )
          .slice(0, fallbackNeeded),
        selected = primary.concat(fallback);
      for (
        let i = selected.length;
        rule.selectionRule.shortageScore != null &&
        i < rule.selectionRule.count;
        i++
      )
        selected.push({
          name: "부족 과목",
          subject: "부족",
          type: "보정",
          credits: 1,
          rankGrade: 5,
          convertedScore: rule.selectionRule.shortageScore,
          subjectWeight: 1,
          weighted: rule.selectionRule.shortageScore,
          synthetic: true,
        });
      return selected;
    }
    if (rule.selectionRule.type === "twoStageGroups") {
      const selected = [];
      rule.selectionRule.stages.forEach((stage) => {
        const pool = scored.filter(
          (c) =>
            stage.subjects.includes(c.subject) &&
            (!stage.excludeSelected || !selected.includes(c)),
        );
        const picked = pool.slice(0, stage.count);
        picked.forEach((course) => {
          course.selectionGroup = stage.label;
        });
        selected.push(...picked);
        for (let i = picked.length; i < stage.count; i++)
          selected.push({
            name: `부족 과목(${stage.label})`,
            subject: "부족",
            credits: 1,
            rankGrade: 5,
            convertedScore: rule.selectionRule.shortageScore,
            subjectWeight: 1,
            weighted: rule.selectionRule.shortageScore,
            selectionGroup: stage.label,
            synthetic: true,
          });
      });
      return selected;
    }
    if (rule.selectionRule.type === "subjectQuotasThenTopN") {
      const selected = [];
      rule.selectionRule.quotas.forEach((quota) => {
        const picked = scored
          .filter(
            (course) =>
              quota.subjects.includes(course.subject) &&
              (!quota.courseTypes?.length ||
                quota.courseTypes.includes(course.type)),
          )
          .slice(0, quota.count);
        picked.forEach((course) => {
          course.selectionGroup = quota.label;
        });
        selected.push(...picked);
      });
      const remainder = scored
        .filter(
          (course) =>
            !selected.includes(course) &&
            (!rule.selectionRule.remainder.courseTypes?.length ||
              rule.selectionRule.remainder.courseTypes.includes(course.type)),
        )
        .slice(0, rule.selectionRule.remainder.count);
      remainder.forEach((course) => {
        course.selectionGroup = rule.selectionRule.remainder.label;
      });
      return selected.concat(remainder);
    }
    if (rule.selectionRule.type === "subjectQuotasWithCareerReplacement") {
      const ordinary = rule.selectionRule.quotas.flatMap((quota) =>
          scored
            .filter(
              (course) =>
                quota.subjects.includes(course.subject) &&
                !rule.selectionRule.careerCourseTypes.includes(course.type),
            )
            .slice(0, quota.count),
        ),
        career = scored
          .filter((course) =>
            rule.selectionRule.careerCourseTypes.includes(course.type),
          )
          .slice(0, rule.selectionRule.careerCount);
      return ordinary
        .concat(career)
        .sort(
          (a, b) =>
            b.convertedScore - a.convertedScore ||
            Number(b.credits || 0) - Number(a.credits || 0),
        )
        .slice(0, rule.selectionRule.totalCount);
    }
    return scored;
  }
  function calculate(rule, courses, attendance = {}) {
    if (rule.status !== "계산 가능" && !rule.allowComponentCalculation)
      return {
        status: rule.status,
        blocked: true,
        missing: ["최종 총점 산출에 필요한 시행계획 세부 기준"],
      };
    if (
      !rule.gradeConversionTable &&
      !rule.achievementConversion &&
      !rule.gradeAchievementMatrix &&
      !rule.distributionZScoreConversion &&
      rule.courseScoreSource !== "rawScore"
    )
      return {
        status: rule.status,
        blocked: true,
        missing: ["시행계획에 공개된 완전한 환산표/산출식"],
      };
    if (
      rule.schoolViolenceRule?.unknownLevels?.includes(
        Number(attendance.schoolViolenceLevel || 0),
      )
    )
      return {
        status: "입력 기준 미공개",
        blocked: true,
        missing: ["학교폭력 해당 호수의 세부 감점점수"],
      };
    courses = courses.map((course, index) => ({ ...course, _inputIndex: index }));
    const candidateCourses = courses.filter(
      (course) => eligible(course, rule) && allowedSubject(course, rule),
    );
    if (
      rule.courseScoreSource === "rawScore" &&
      candidateCourses.some(
        (course) => !String(course.rawScore ?? "").trim(),
      )
    )
      return {
        status: "입력 부족",
        blocked: true,
        missing: ["반영 후보 과목의 원점수"],
      };
    if (rule.distributionZScoreConversion) {
      const excludedType = rule.distributionZScoreConversion.excludedCourseType,
        keys = Object.keys(rule.distributionZScoreConversion.classValues || {}),
        missingDistributionInput = candidateCourses.some((course) => {
          if (course.type === excludedType) return false;
          const ratios = achievementRatios(course.achievementRatio);
          return (
            !String(course.rawScore ?? "").trim() ||
            !String(course.mean ?? "").trim() ||
            keys.some((key) => !Number.isFinite(ratios[key]))
          );
        });
      if (missingDistributionInput)
        return {
          status: "입력 부족",
          blocked: true,
          missing: ["반영 후보 과목의 원점수·과목평균·A~E 성취도별 분포비율"],
        };
    }
    if (
      rule.minimumClassSize &&
      candidateCourses.some((course) => course.classSize == null)
    )
      return {
        status: "입력 부족",
        blocked: true,
        missing: ["반영 후보 과목의 수강자 수"],
      };
    if (
      rule.requireAchievement &&
      candidateCourses.some((course) => !course.achievement)
    )
      return {
        status: "입력 부족",
        blocked: true,
        missing: ["반영 후보 과목의 성취도"],
      };
    if (
      rule.requireAchievementScale &&
      courses.some(
        (course) =>
          eligible(course, rule) &&
          rule.requireAchievementScale.courseTypes?.includes(course.type) &&
          course.achievement &&
          !String(course.achievementScale || "").trim(),
      )
    )
      return {
        status: "입력 부족",
        blocked: true,
        missing: ["진로·융합선택 과목의 성취도 단계(3단계 또는 5단계)"],
      };
    if (
      rule.requireRankGrade &&
      candidateCourses.some((course) => !course.rankGrade)
    )
      return {
        status: "입력 부족",
        blocked: true,
        missing: ["반영 후보 과목의 석차등급"],
      };
    if (
      rule.requireRankGradeExceptCourseTypes &&
      candidateCourses.some(
        (course) =>
          !rule.requireRankGradeExceptCourseTypes.includes(course.type) &&
          !course.rankGrade,
      )
    )
      return {
        status: "입력 부족",
        blocked: true,
        missing: ["융합선택 외 반영 후보 과목의 석차등급"],
      };
    if (
      rule.achievementDistributionThresholds &&
      candidateCourses.some(
        (course) =>
          course.achievement &&
          !String(course.achievementRate ?? "").trim() &&
          !String(course.achievementRatio || "").trim(),
      )
    )
      return {
        status: "입력 부족",
        blocked: true,
        missing: ["성취도가 있는 반영 후보 과목의 현재 성취비율"],
      };
    if (
      rule.requireAchievementRatio &&
      candidateCourses.some(
        (course) => !String(course.achievementRatio || "").trim(),
      )
    )
      return {
        status: "입력 부족",
        blocked: true,
        missing: ["반영 후보 과목의 성취도 A 분포비율"],
      };
    if (
      rule.achievementCumulativeGradeRule &&
      candidateCourses.some(
        (course) =>
          !course.rankGrade &&
          course.achievement &&
          cumulativeAchievementGrade(
            course,
            rule,
            String(course.achievement).toUpperCase(),
          ) == null,
      )
    )
      return {
        status: "입력 부족",
        blocked: true,
        missing: ["석차등급 미기재 과목의 A~E 성취도별 분포비율"],
      };
    const selected = selectCourses(courses, rule);
    if (!selected.length)
      return {
        status: "입력 부족",
        blocked: true,
        missing: ["반영 가능한 과목의 석차등급 또는 성취도"],
      };
    if (rule.minimumTotalCredits != null) {
      const totalCredits = selected
        .filter((course) => !course.synthetic)
        .reduce((sum, course) => sum + Number(course.credits || 0), 0);
      if (totalCredits < Number(rule.minimumTotalCredits))
        return {
          status: "지원자격 미충족",
          blocked: true,
          missing: [`반영교과 총 이수학점 ${rule.minimumTotalCredits} 이상`],
        };
    }
    if (
      rule.minimumSemesters &&
      new Set(
        selected
          .filter((course) => !course.synthetic)
          .map((course) => `${course.grade}-${course.semester}`),
      ).size < Number(rule.minimumSemesters)
    )
      return {
        status: "지원자격 확인 필요",
        blocked: true,
        missing: [`반영 가능한 성적 ${rule.minimumSemesters}개 학기`],
      };
    if (
      rule.requiredSubjects?.some(
        (subject) => !selected.some((course) => course.subject === subject),
      )
    )
      return {
        status: "지원자격 확인 필요",
        blocked: true,
        missing: ["모든 필수 반영교과의 이수 과목"],
      };
    if (
      rule.selectionRule.type === "groupedYearTopN" &&
      rule.selectionRule.groups.some(
        (group) =>
          selected.filter((course) => course.selectionGroup === group.label)
            .length < group.count,
      )
    )
      return {
        status: "입력 부족",
        blocked: true,
        missing: ["학년군별 필수 반영 과목 수"],
      };
    if (
      rule.minimumCourseCount &&
      selected.filter((course) => !course.synthetic).length <
        rule.minimumCourseCount
    )
      return {
        status: "비교점수 적용 대상",
        blocked: true,
        missing: [`반영 가능한 과목 ${rule.minimumCourseCount}개`],
      };
    if (
      rule.selectionRule?.type === "stagedTopNWithUngradedCap" &&
      selected.filter(
        (course) =>
          course.selectionGroup === rule.selectionRule.firstStage.label,
      ).length < Number(rule.selectionRule.firstStage.count)
    )
      return {
        status: "입력 부족",
        blocked: true,
        missing: [
          `${rule.selectionRule.firstStage.label} ${rule.selectionRule.firstStage.count}과목`,
        ],
      };
    const calculationCourses = rule.averageSameCourseAcrossSemesters
      ? mergeSemesterCourses(selected)
      : selected;
    let rawAverage, academicRaw;
    if (rule.aggregation?.type === "dualGradeAchievement") {
      const gradeCourses = selected.filter((course) => course.rankGrade),
        gradeCredits = gradeCourses.reduce(
          (sum, course) =>
            sum + (rule.creditWeighting ? Number(course.credits || 0) : 1),
          0,
        ),
        achievementCredits = selected.reduce(
          (sum, course) =>
            sum + (rule.creditWeighting ? Number(course.credits || 0) : 1),
          0,
        );
      if (!gradeCredits || !achievementCredits)
        return {
          status: "입력 부족",
          blocked: true,
          missing: ["석차등급·성취도·이수학점이 있는 반영 과목"],
        };
      const gradeAverage = precision(
          gradeCourses.reduce(
            (sum, course) =>
              sum +
              Number(
                rule.aggregation.useConvertedGrade
                  ? course.gradeConverted
                  : course.rankGrade,
              ) *
                (rule.creditWeighting ? Number(course.credits || 0) : 1),
            0,
          ) / gradeCredits,
          rule.aggregation.gradeAverageRounding,
        ),
        gradeScore = precision(
          rule.aggregation.useConvertedGrade
            ? gradeAverage
            : (Number(rule.aggregation.baseGrade || 5) - gradeAverage) *
                Number(rule.aggregation.gradeMultiplier || 200),
          rule.aggregation.componentRounding,
        ),
        achievementScore = precision(
          selected.reduce(
            (sum, course) =>
              sum +
              Number(course.achievementConverted || 0) *
              (rule.creditWeighting ? Number(course.credits || 0) : 1),
            0,
          ) / achievementCredits,
          rule.aggregation.componentRounding,
        );
      rawAverage = gradeAverage;
      academicRaw =
        (gradeScore * Number(rule.aggregation.gradeWeight ?? 1) +
          achievementScore * Number(rule.aggregation.achievementWeight ?? 1) +
          Number(rule.aggregation.baseAddition || 0)) *
        Number(rule.academicScale ?? 1);
    } else if (rule.aggregation?.type === "averageGradeBandScore") {
      const denominator = rule.aggregation.creditWeighted
          ? selected.reduce(
              (sum, course) => sum + Number(course.credits || 0),
              0,
            )
          : selected.length,
        gradeAverage = denominator
          ? selected.reduce(
              (sum, course) =>
                sum +
                Number(course.effectiveGrade) *
                  (rule.aggregation.creditWeighted
                    ? Number(course.credits || 0)
                    : 1),
              0,
            ) / denominator
          : null;
      if (gradeAverage == null || !Number.isFinite(gradeAverage))
        return {
          status: "입력 부족",
          blocked: true,
          missing: ["반영 과목의 석차등급"],
        };
      rawAverage = precision(gradeAverage, rule.rounding?.intermediate);
      academicRaw =
        rule.aggregation.bands.find(
          ([maximumExclusive]) => rawAverage < Number(maximumExclusive),
        )?.[1] ?? null;
      if (academicRaw == null)
        return {
          status: "계산 기준 미공개",
          blocked: true,
          missing: ["평균등급에 해당하는 환산점수 구간"],
        };
    } else if (rule.aggregation?.type === "gradeSemesterWeightedAverage") {
      const gradeWeights = rule.aggregation.gradeWeights || {},
        gradeResults = Object.entries(gradeWeights).map(([grade, weight]) => {
          const gradeCourses = selected.filter(
              (course) => Number(course.grade) === Number(grade),
            ),
            semesters = [
              ...new Set(gradeCourses.map((course) => course.semester)),
            ],
            semesterAverages = semesters.map((semester) => {
              const items = gradeCourses.filter(
                  (course) => course.semester === semester,
                ),
                creditWeighted = rule.aggregation.creditWeighted !== false,
                denominator = creditWeighted
                  ? items.reduce(
                      (sum, course) => sum + Number(course.credits || 0),
                      0,
                    )
                  : items.length,
                numerator = items.reduce(
                  (sum, course) =>
                    sum +
                    course.convertedScore *
                      (creditWeighted ? Number(course.credits || 0) : 1),
                  0,
                );
              return denominator
                ? numerator / denominator
                : null;
            });
          return {
            grade,
            weight: Number(weight),
            value: semesterAverages.length
              ? semesterAverages.reduce((sum, value) => sum + value, 0) /
                semesterAverages.length
              : null,
          };
        });
      if (gradeResults.some((result) => result.value == null))
        return {
          status: "입력 부족",
          blocked: true,
          missing: ["1·2·3학년별 반영 과목과 이수학점"],
        };
      rawAverage = gradeResults.reduce(
        (sum, result) => sum + result.value * result.weight,
        0,
      );
      rawAverage = precision(rawAverage, rule.rounding?.intermediate);
      academicRaw = rawAverage * (rule.academicScale ?? 1);
    } else if (rule.aggregation?.type === "gradeSubjectWeightedAverage") {
      const gradeResults = Object.entries(
        rule.aggregation.gradeWeights || {},
      ).map(([grade, weight]) => {
        const groupValues = rule.aggregation.groups.map((group) => {
          const items = selected.filter(
              (course) =>
                Number(course.grade) === Number(grade) &&
                course.selectionGroup === group.label,
            ),
            credits = items.reduce(
              (sum, course) => sum + Number(course.credits || 0),
              0,
            );
          return credits
            ? items.reduce(
                (sum, course) =>
                  sum + course.convertedScore * Number(course.credits || 0),
                0,
              ) / credits
            : null;
        });
        return {
          grade,
          weight: Number(weight),
          value: groupValues.every((value) => value != null)
            ? groupValues.reduce((sum, value) => sum + value, 0) /
              groupValues.length
            : null,
        };
      });
      if (gradeResults.some((result) => result.value == null))
        return {
          status: "입력 부족",
          blocked: true,
          missing: ["2학년·3학년 1학기의 국어·영어·사회 또는 대체 교과 성적"],
        };
      rawAverage = precision(
        gradeResults.reduce(
          (sum, result) => sum + result.value * result.weight,
          0,
        ),
        rule.rounding?.intermediate,
      );
      academicRaw = rawAverage * Number(rule.academicScale ?? 1);
    } else if (rule.aggregation?.type === "subjectGroupGradeBandWeighted") {
      const groupResults = rule.aggregation.groups.map((group) => {
        const items = selected.filter((course) =>
            group.subjects?.includes(course.subject),
          ),
          denominator = rule.aggregation.creditWeighted
            ? items.reduce((sum, course) => sum + Number(course.credits || 0), 0)
            : items.length,
          average = denominator
            ? items.reduce(
                (sum, course) =>
                  sum + course.convertedScore *
                    (rule.aggregation.creditWeighted ? Number(course.credits || 0) : 1),
                0,
              ) / denominator
            : null,
          score = average == null
            ? Number(rule.aggregation.missingScore || 0)
            : Number(
                rule.aggregation.bands.find(([maximum]) => average <= maximum)?.[1] ??
                  rule.aggregation.bands.at(-1)?.[1] ?? 0,
              );
        return { average, score, weight: Number(group.weight || 0) };
      });
      rawAverage = precision(
        groupResults.reduce((sum, result) => sum + result.score * result.weight, 0),
        rule.rounding?.intermediate,
      );
      academicRaw = rawAverage * Number(rule.academicScale ?? 1);
    } else if (rule.aggregation?.type === "subjectGroupAverage") {
      const insufficientGroup = rule.aggregation.groups.find((group) => {
        const items = selected.filter((course) =>
            group.subjects?.length
              ? group.subjects.includes(course.subject)
              : course.selectionGroup === group.label,
          ),
          credits = items.reduce(
            (sum, course) => sum + Number(course.credits || 0),
            0,
          );
        return (
          Number(group.minimumCredits || 0) > credits ||
          Number(group.minimumCount || 0) > items.length
        );
      });
      if (insufficientGroup)
        return {
          status: "입력 부족",
          blocked: true,
          missing: [
            insufficientGroup.minimumCount
              ? `${insufficientGroup.label || insufficientGroup.subjects?.join("·")} 교과 반영 과목 ${insufficientGroup.minimumCount}개 이상`
              : `${insufficientGroup.label || insufficientGroup.subjects?.join("·")} 교과 이수학점 ${insufficientGroup.minimumCredits} 이상`,
          ],
        };
      if (
        rule.aggregation.requireAllGroups &&
        rule.aggregation.groups.some(
          (group) =>
            !selected.some((course) =>
              group.subjects?.length
                ? group.subjects.includes(course.subject)
                : course.selectionGroup === group.label,
            ),
        )
      )
        return {
          status: "지원자격 확인 필요",
          blocked: true,
          missing: ["모든 필수 반영교과의 이수 과목"],
        };
      rawAverage = rule.aggregation.groups.reduce((sum, group) => {
        const items = selected.filter((course) =>
            group.subjects?.length
              ? group.subjects.includes(course.subject)
              : course.selectionGroup === group.label,
          ),
          denominator = rule.aggregation.creditWeighted
            ? items.reduce(
                (value, course) => value + Number(course.credits || 0),
                0,
              )
            : items.length,
          average = denominator
            ? items.reduce(
                (value, course) =>
                  value +
                  course.convertedScore *
                    (rule.aggregation.creditWeighted
                      ? Number(course.credits || 0)
                      : 1),
                0,
              ) / denominator
            : 0;
        return sum + average * Number(group.weight || 0);
      }, 0);
      rawAverage = precision(rawAverage, rule.rounding?.intermediate);
      academicRaw = rawAverage * (rule.academicScale ?? 1);
    } else if (
      rule.aggregation?.type === "subjectGroupAverageWithBestAlternative"
    ) {
      const averageForGroup = (group) => {
          const items = selected.filter((course) =>
              group.subjects?.includes(course.subject),
            ),
            credits = items.reduce(
              (sum, course) => sum + Number(course.credits || 0),
              0,
            ),
            insufficient =
              Number(group.minimumCount || 0) > items.length ||
              Number(group.minimumCredits || 0) > credits;
          if (!items.length || insufficient) return null;
          const denominator = rule.aggregation.creditWeighted
            ? credits
            : items.length;
          return denominator
            ? items.reduce(
                (sum, course) =>
                  sum +
                  course.convertedScore *
                    (rule.aggregation.creditWeighted
                      ? Number(course.credits || 0)
                      : 1),
                0,
              ) / denominator
            : null;
        },
        fixedResults = rule.aggregation.fixedGroups.map((group) => ({
          group,
          value: averageForGroup(group),
        })),
        alternativeResults = rule.aggregation.alternativeGroups
          .map((group) => ({ group, value: averageForGroup(group) }))
          .filter((result) => result.value != null)
          .sort((a, b) => b.value - a.value);
      const missingFixed = fixedResults.find((result) => result.value == null);
      if (missingFixed)
        return {
          status: "입력 부족",
          blocked: true,
          missing: [
            `${missingFixed.group.label} 교과 반영 과목 ${missingFixed.group.minimumCount || 1}개 이상`,
          ],
        };
      if (!alternativeResults.length)
        return {
          status: "입력 부족",
          blocked: true,
          missing: [
            `${rule.aggregation.alternativeGroups.map((group) => group.label).join(" 또는 ")} 교과 중 반영 가능한 과목`,
          ],
        };
      const chosenAlternative = alternativeResults[0];
      rawAverage = precision(
        fixedResults.reduce(
          (sum, result) => sum + result.value * Number(result.group.weight || 0),
          0,
        ) +
          chosenAlternative.value *
            Number(chosenAlternative.group.weight || 0),
        rule.rounding?.intermediate,
      );
      academicRaw = rawAverage * Number(rule.academicScale ?? 1);
    } else if (
      rule.aggregation?.type === "creditWeightedCombinedBestAlternatives"
    ) {
      const fixedSubjects = rule.aggregation.fixedSubjects || [],
        slots = rule.aggregation.alternativeSlots || [],
        choices = slots.reduce(
          (sets, slot) =>
            sets.flatMap((set) =>
              (slot.options || []).map((option) => [...set, option]),
            ),
          [[]],
        ),
        candidates = (choices.length ? choices : [[]])
          .map((choice) => {
            const subjects = [
                ...fixedSubjects,
                ...choice.flatMap((option) => option.subjects || []),
              ],
              items = selected.filter((course) => subjects.includes(course.subject)),
              credits = items.reduce(
                (sum, course) => sum + Number(course.credits || 0),
                0,
              ),
              requiredGroups = [
                ...fixedSubjects.map((subject) => ({ label: subject, subjects: [subject] })),
                ...choice,
              ],
              missingGroup = requiredGroups.find(
                (group) =>
                  !items.some((course) => group.subjects?.includes(course.subject)),
              );
            if (!items.length || !credits || missingGroup) return null;
            return {
              value:
                items.reduce(
                  (sum, course) =>
                    sum + course.convertedScore * Number(course.credits || 0),
                  0,
                ) / credits,
              labels: choice.map((option) => option.label),
            };
          })
          .filter(Boolean)
          .sort((a, b) => b.value - a.value);
      if (!candidates.length)
        return {
          status: "입력 부족",
          blocked: true,
          missing: ["모집단위의 필수 교과와 선택 교과별 반영 가능한 과목"],
        };
      rawAverage = precision(candidates[0].value, rule.rounding?.intermediate);
      academicRaw = rawAverage * Number(rule.academicScale ?? 1);
    } else if (rule.aggregation?.type === "selectionGroupEqualAverage") {
      const groupLabels = [
        ...new Set(
          selected.map((course) => course.selectionGroup).filter(Boolean),
        ),
      ];
      if (groupLabels.length < Number(rule.aggregation.minimumGroups || 1))
        return {
          status: "입력 부족",
          blocked: true,
          missing: [`반영 가능한 교과 ${rule.aggregation.minimumGroups}개 이상`],
        };
      const groupAverages = groupLabels.map((label) => {
        const items = selected.filter(
            (course) => course.selectionGroup === label,
          ),
          denominator = rule.aggregation.creditWeighted
            ? items.reduce(
                (sum, course) => sum + Number(course.credits || 0),
                0,
              )
            : items.length;
        return (
          items.reduce(
            (sum, course) =>
              sum +
              course.convertedScore *
                (rule.aggregation.creditWeighted
                  ? Number(course.credits || 0)
                  : 1),
            0,
          ) / denominator
        );
      });
      rawAverage = precision(
        groupAverages.reduce((sum, value) => sum + value, 0) /
          groupAverages.length,
        rule.rounding?.intermediate,
      );
      academicRaw = rawAverage * (rule.academicScale ?? 1);
    } else if (rule.aggregation?.type === "selectionGroupWeightedAverage") {
      const weights = rule.aggregation.weights || {},
        groupLabels = Object.keys(weights),
        missingGroups = groupLabels.filter(
          (label) =>
            !selected.some((course) => course.selectionGroup === label),
        );
      if (missingGroups.length && rule.aggregation.missingGroupScore == null)
        return {
          status: "입력 부족",
          blocked: true,
          missing: missingGroups.map((label) => `${label} 교과 성적`),
        };
      rawAverage = groupLabels.reduce((sum, label) => {
        const items = selected.filter(
            (course) => course.selectionGroup === label,
          ),
          denominator = rule.aggregation.creditWeighted
            ? items.reduce(
                (value, course) => value + Number(course.credits || 0),
                0,
              )
            : items.length,
          average = denominator
            ? items.reduce(
                (value, course) =>
                  value +
                  course.convertedScore *
                    (rule.aggregation.creditWeighted
                      ? Number(course.credits || 0)
                      : 1),
                0,
              ) / denominator
            : Number(rule.aggregation.missingGroupScore || 0);
        return sum + average * Number(weights[label] || 0);
      }, 0);
      rawAverage = precision(rawAverage, rule.rounding?.intermediate);
      academicRaw = rawAverage * (rule.academicScale ?? 1);
    } else if (rule.aggregation?.type === "courseTypeWeightedAverage") {
      const specialTypes = rule.aggregation.specialCourseTypes || ["진로선택"],
        ordinary = selected.filter((c) => !specialTypes.includes(c.type)),
        career = selected.filter((c) => specialTypes.includes(c.type)),
        weightedAverage = (items) => {
          const credits = items.reduce((s, c) => s + Number(c.credits || 0), 0);
          return credits
            ? items.reduce(
                (s, c) => s + c.convertedScore * Number(c.credits || 0),
                0,
              ) / credits
            : null;
        },
        ordinaryAverage = weightedAverage(ordinary),
        careerAverage = weightedAverage(career);
      if (ordinaryAverage == null)
        return {
          status: "입력 부족",
          blocked: true,
          missing: ["공통·일반선택 반영 과목과 이수학점"],
        };
      rawAverage =
        careerAverage == null
          ? ordinaryAverage
          : ordinaryAverage * Number(rule.aggregation.ordinaryWeight ?? 0.85) +
            careerAverage * Number(rule.aggregation.careerWeight ?? 0.15);
      rawAverage = precision(rawAverage, rule.rounding?.intermediate);
      academicRaw = rawAverage * (rule.academicScale ?? 1);
    } else if (rule.aggregation?.type === "courseTypeGroups") {
      const groupResults = rule.aggregation.groups.map((group) => {
        const items = selected.filter((course) =>
            group.courseTypes.includes(course.type),
          ),
          weight = items.reduce(
            (sum, course) => sum + Number(course.credits || 0),
            0,
          ),
          average = weight
            ? items.reduce(
                (sum, course) =>
                  sum +
                  Number(course.convertedScore || 0) *
                    Number(course.credits || 0),
                0,
              ) / weight
            : null;
        return { group, items, average };
      });
      if (
        rule.aggregation.requireAllGroups &&
        groupResults.some((result) => result.average == null)
      )
        return {
          status: "입력 부족",
          blocked: true,
          missing: ["공통과목과 석차등급이 표시된 선택과목"],
        };
      rawAverage = groupResults.reduce(
        (sum, result) =>
          sum +
          Number(result.average || 0) * Number(result.group.weight || 0),
        0,
      );
      rawAverage = precision(rawAverage, rule.rounding?.intermediate);
      academicRaw = rawAverage * (rule.academicScale ?? 1);
    } else if (rule.aggregation?.type === "dualIndicatorCreditBand") {
      const gradeSum = selected.reduce(
          (s, c) =>
            s +
            Number(c.gradeConverted ?? rule.aggregation.missingIndicatorScore),
          0,
        ),
        achievementSum = selected.reduce(
          (s, c) =>
            s +
            Number(
              c.achievementConverted ?? rule.aggregation.missingIndicatorScore,
            ),
          0,
        ),
        creditSum = selected.reduce((s, c) => s + Number(c.credits || 0), 0),
        creditScore =
          rule.aggregation.creditBands.find(
            ([minimum]) => creditSum >= minimum,
          )?.[1] ?? rule.aggregation.creditBands.at(-1)[1];
      rawAverage =
        (gradeSum / rule.aggregation.divisor +
          achievementSum / rule.aggregation.divisor) *
        creditScore;
      academicRaw = rawAverage * (rule.academicScale ?? 1);
    } else if (rule.aggregation?.type === "sum") {
      if (
        rule.selectionRule?.count &&
        selected.length < Number(rule.selectionRule.count)
      )
        return {
          status: "입력 부족",
          blocked: true,
          missing: [`반영 가능한 과목 ${rule.selectionRule.count}개`],
        };
      rawAverage = precision(
        selected.reduce(
          (sum, course) => sum + Number(course.convertedScore || 0),
          0,
        ),
        rule.rounding?.intermediate,
      );
      academicRaw = rawAverage * (rule.academicScale ?? 1);
    } else if (rule.aggregation?.type === "gradeWeightedAverage") {
      const gradeWeights = rule.aggregation.gradeWeights || {};
      const gradeResults = Object.entries(gradeWeights).map(([grade, weight]) => {
        const items = selected.filter(
            (course) => Number(course.grade) === Number(grade),
          ),
          denominator = rule.creditWeighting
            ? items.reduce((sum, course) => sum + Number(course.credits || 0), 0)
            : items.length;
        return {
          grade,
          weight: Number(weight),
          value: denominator
            ? items.reduce(
                (sum, course) =>
                  sum +
                  Number(course.convertedScore || 0) *
                    (rule.creditWeighting ? Number(course.credits || 0) : 1),
                0,
              ) / denominator
            : null,
        };
      });
      if (gradeResults.some((result) => result.value == null))
        return {
          status: "입력 부족",
          blocked: true,
          missing: ["1·2·3학년별 반영 과목"],
        };
      rawAverage = precision(
        gradeResults.reduce(
          (sum, result) => sum + result.value * result.weight,
          0,
        ),
        rule.rounding?.intermediate,
      );
      academicRaw = rawAverage * (rule.academicScale ?? 1);
    } else if (rule.aggregation?.type === "equalGradeAverage") {
      const grades = rule.aggregation.grades || [1, 2, 3],
        gradeAverages = grades.map((grade) => {
          const items = selected.filter((c) => Number(c.grade) === grade),
            denom = items.reduce(
              (s, c) =>
                s + Number(c.credits || 0) * Number(c.subjectWeight || 1),
              0,
            );
          return denom
            ? items.reduce((s, c) => s + c.weighted, 0) / denom
            : null;
        });
      if (gradeAverages.some((v) => v == null))
        return {
          status: "입력 부족",
          blocked: true,
          missing: ["학년별 반영 과목과 이수학점"],
        };
      rawAverage = precision(
        gradeAverages.reduce((s, v) => s + v, 0) / gradeAverages.length,
        rule.rounding?.intermediate,
      );
      academicRaw = rawAverage * (rule.academicScale ?? 1);
    } else {
      const denom = rule.creditWeighting
        ? calculationCourses.reduce(
            (s, c) => s + Number(c.credits || 0) * Number(c.subjectWeight || 1),
            0,
          )
        : calculationCourses.reduce(
            (s, c) => s + Number(c.subjectWeight || 1),
            0,
          );
      if (!denom)
        return { status: "입력 부족", blocked: true, missing: ["이수학점"] };
      rawAverage = precision(
        calculationCourses.reduce((s, c) => s + c.weighted, 0) / denom,
        rule.rounding?.intermediate,
      );
      academicRaw = rawAverage * (rule.academicScale ?? 1);
    }
    if (rule.scoreTransform?.type === "linearRange")
      academicRaw =
        rule.minimumScore +
        (rule.maximumScore - rule.minimumScore) *
          (rawAverage / (rule.scoreTransform.sourceMaximum || 100));
    if (rule.scoreTransform?.type === "inverseGradeLinear")
      academicRaw =
        (Number(rule.scoreTransform.baseGrade ?? 5) - rawAverage) *
          Number(rule.scoreTransform.multiplier || 1) +
        Number(rule.scoreTransform.baseScore || 0);
    if (rule.scoreTransform?.type === "inverseGradeQuadratic") {
      const maximum = Number(rule.scoreTransform.maximum || 0),
        minimum = Number(rule.scoreTransform.minimum || 0),
        divisor = Number(rule.scoreTransform.divisor || 1),
        normalized = (rawAverage - Number(rule.scoreTransform.bestGrade || 1)) / divisor;
      academicRaw = maximum - (maximum - minimum) * normalized ** 2;
    }
    if (rule.scoreTransform?.type === "bandLookup") {
      const bandScore =
        rule.scoreTransform.bands.find(
          ([maximum]) => rawAverage <= maximum,
        )?.[1] ?? rule.scoreTransform.bands.at(-1)?.[1];
      academicRaw = Number(bandScore || 0) * (rule.academicScale ?? 1);
    }
    if (rule.scoreTransform?.type === "exactLookup") {
      const matched = rule.scoreTransform.values.find(
        ([value]) => Math.abs(rawAverage - Number(value)) < 1e-9,
      );
      if (!matched)
        return {
          status: "계산 기준 불충분",
          blocked: true,
          missing: [
            rule.scoreTransform.missingMessage ||
              "시행계획 환산표에 정확히 일치하는 평균등급",
          ],
        };
      academicRaw = Number(matched[1]) * (rule.academicScale ?? 1);
    }
    if (rule.creditMultiplierBands) {
      const totalCredits = candidateCourses.reduce(
        (sum, course) => sum + Number(course.credits || 0),
        0,
      );
      academicRaw *=
        rule.creditMultiplierBands.find(
          ([minimum]) => totalCredits >= minimum,
        )?.[1] ?? 1;
    }
    if (rule.creditMultiplierUpperBands) {
      const creditCourses = rule.creditMultiplierEligibleCourseTypes?.length
          ? courses.filter(
              (course) =>
                eligible(course, rule) &&
                rule.creditMultiplierEligibleCourseTypes.includes(course.type),
            )
          : candidateCourses,
        totalCredits = creditCourses.reduce(
          (sum, course) => sum + Number(course.credits || 0),
          0,
        );
      academicRaw *=
        rule.creditMultiplierUpperBands.find(
          ([maximum]) => totalCredits <= maximum,
        )?.[1] ?? 1;
    }
    const selectedCourseBonus = rule.selectedCourseBonus
      ? selected.filter((course) => {
          if (course.synthetic) return false;
          if (
            rule.selectedCourseBonus.courseTypes?.length &&
            !rule.selectedCourseBonus.courseTypes.includes(course.type)
          )
            return false;
          if (
            rule.selectedCourseBonus.achievements?.length &&
            !rule.selectedCourseBonus.achievements.includes(
              String(course.achievement || "").toUpperCase(),
            )
          )
            return false;
          const grade = Number(course.rankGrade ?? course.derivedGrade);
          return rule.selectedCourseBonus.ignoreGrade
            ? true
            : Number.isFinite(grade) &&
                grade >= Number(rule.selectedCourseBonus.minimumGrade ?? 1) &&
                grade <= Number(rule.selectedCourseBonus.maximumGrade ?? 1);
        }).length * Number(rule.selectedCourseBonus.amount || 0)
      : 0;
    const selectedCreditBonus = rule.selectedCreditBonus
      ? precision(selected.reduce((sum, course) => {
          if (course.synthetic) return sum;
          if (
            rule.selectedCreditBonus.courseTypes?.length &&
            !rule.selectedCreditBonus.courseTypes.includes(course.type)
          )
            return sum;
          if (
            rule.selectedCreditBonus.subjects?.length &&
            !rule.selectedCreditBonus.subjects.includes(course.subject)
          )
            return sum;
          return (
            sum +
            Number(course.credits || 0) *
              Number(rule.selectedCreditBonus.amountPerCredit || 0)
          );
        }, 0), rule.rounding?.intermediate)
      : 0;
    const selectedYearBonus = rule.selectedYearBonus
      ? selected
          .filter((course) => !course.synthetic)
          .reduce(
            (sum, course) =>
              sum + Number(rule.selectedYearBonus[String(course.grade)] || 0),
            0,
          )
      : 0;
    const supplementalAchievementCandidates = rule.supplementalAchievementBonus
        ? courses.filter(
            (course) =>
              eligible(course, rule) &&
              (!rule.supplementalAchievementBonus.courseTypes?.length ||
                rule.supplementalAchievementBonus.courseTypes.includes(
                  course.type,
                )) &&
              (!rule.supplementalAchievementBonus.subjects?.length ||
                rule.supplementalAchievementBonus.subjects.includes(
                  course.subject,
                )),
          )
        : [],
      insufficientSupplementalAchievement =
        rule.supplementalAchievementBonus?.minimumCount &&
        supplementalAchievementCandidates.length <
          Number(rule.supplementalAchievementBonus.minimumCount);
    if (insufficientSupplementalAchievement)
      return {
        status: "비교내신 필요",
        blocked: true,
        missing: [
          `진로·융합선택 성취도 과목 ${rule.supplementalAchievementBonus.minimumCount}개 이상(미만이면 대학 비교내신 적용)`,
        ],
      };
    const supplementalAchievementBonus = rule.supplementalAchievementBonus
      ? supplementalAchievementCandidates
          .map((course) => ({
            course,
            bonus: Number(
              rule.supplementalAchievementBonus.pointsByScale?.[
                String(course.achievementScale || "")
              ]?.[String(course.achievement || "").toUpperCase()] ??
                rule.supplementalAchievementBonus.points?.[
                  String(course.achievement || "").toUpperCase()
                ] ??
                0,
            ),
          }))
          .sort((a, b) => b.bonus - a.bonus)
          .slice(0, Number(rule.supplementalAchievementBonus.count || 0))
          .reduce((sum, item) => sum + item.bonus, 0)
      : 0;
    const topAchievementAverageBandBonus = rule.topAchievementAverageBandBonus
      ? (() => {
          const config = rule.topAchievementAverageBandBonus,
            values = courses
              .filter((course) =>
                eligible(course, rule) &&
                (!config.courseTypes?.length || config.courseTypes.includes(course.type)) &&
                (!config.subjects?.length || config.subjects.includes(course.subject)) &&
                config.points?.[String(course.achievement || "").toUpperCase()] != null,
              )
              .map((course) => Number(config.points[String(course.achievement).toUpperCase()]))
              .sort((a,b) => b-a)
              .slice(0, Number(config.count || 0));
          if (values.length < Number(config.minimumCount || 0)) return null;
          const average = values.reduce((sum,value)=>sum+value,0)/values.length;
          return Number(config.bands.find(([minimum])=>average>=Number(minimum))?.[1] ?? 0);
        })()
      : 0;
    if (topAchievementAverageBandBonus == null)
      return {status:"입력 부족",blocked:true,missing:[`성취도 가산점 대상 과목 ${rule.topAchievementAverageBandBonus.minimumCount}개 이상`]};
    const achievementWeightedAverageBonus = rule.achievementWeightedAverageBonus
      ? (() => {
          const bonusCourses = courses.filter(
              (course) =>
                eligible(course, rule) &&
                (!rule.achievementWeightedAverageBonus.subjects?.length ||
                  rule.achievementWeightedAverageBonus.subjects.includes(
                    course.subject,
                  )) &&
                rule.achievementWeightedAverageBonus.points?.[
                  String(course.achievement || "").toUpperCase()
                ] != null,
            ),
            denominator = bonusCourses.reduce(
              (sum, course) => sum + Number(course.credits || 0),
              0,
            );
          return denominator
            ? bonusCourses.reduce(
                (sum, course) =>
                  sum +
                  Number(
                    rule.achievementWeightedAverageBonus.points[
                      String(course.achievement || "").toUpperCase()
                    ],
                  ) * Number(course.credits || 0),
                0,
              ) / denominator
            : 0;
        })()
      : 0;
    const creditThresholdBonus = rule.creditThresholdBonus
      ? candidateCourses.reduce(
          (sum, course) => sum + Number(course.credits || 0),
          0,
        ) >= Number(rule.creditThresholdBonus.minimumCredits || Infinity)
        ? Number(rule.creditThresholdBonus.amount || 0)
        : 0
      : 0;
    const totalCandidateCredits = candidateCourses.reduce(
        (sum, course) => sum + Number(course.credits || 0),
        0,
      ),
      creditThresholdBonusBands = rule.creditThresholdBonusBands
        ? (rule.creditThresholdBonusBands.find(
            ([minimum]) => totalCandidateCredits >= Number(minimum),
          )?.[1] ?? 0)
        : 0,
      creditThresholdAcademicBonus = rule.creditThresholdAcademicBonus &&
        totalCandidateCredits >= Number(rule.creditThresholdAcademicBonus.minimumCredits || Infinity)
        ? academicRaw * Number(rule.creditThresholdAcademicBonus.rate || 0)
        : 0;
    const preMultiplierAcademicScore =
        academicRaw +
        Number(rule.academicBaseScore || 0) +
        selectedCourseBonus +
        selectedCreditBonus +
        selectedYearBonus +
        supplementalAchievementBonus +
        achievementWeightedAverageBonus +
        creditThresholdBonus +
        creditThresholdBonusBands +
        creditThresholdAcademicBonus +
        topAchievementAverageBandBonus,
      creditDeficitFinalMultiplier = rule.creditDeficitFinalMultiplier
        ? (() => {
            const credits = candidateCourses.reduce(
              (sum, course) => sum + Number(course.credits || 0),
              0,
            );
            return credits <=
              Number(rule.creditDeficitFinalMultiplier.threshold)
              ? round(
                  Number(rule.creditDeficitFinalMultiplier.base) -
                    (Number(rule.creditDeficitFinalMultiplier.threshold) -
                      credits) *
                      Number(rule.creditDeficitFinalMultiplier.step),
                  6,
                )
              : 1;
          })()
        : 1,
      academicScore = Math.min(
        precision(
          preMultiplierAcademicScore * creditDeficitFinalMultiplier,
          rule.rounding?.final,
        ),
        Number(rule.academicMaximumScore ?? Infinity),
      );
    const att = attendanceScore(attendance, rule.attendanceRule),
      volunteer = volunteerScore(attendance, rule.volunteerRule);
    const uncappedSubtotal =
        academicScore + Number(att?.score || 0) + Number(volunteer?.score || 0),
      subtotal = rule.totalCapBeforeDeductions
        ? Math.min(uncappedSubtotal, Number(rule.totalCapBeforeDeductions))
        : uncappedSubtotal,
      violence = schoolViolence(
        attendance.schoolViolenceLevel,
        rule.schoolViolenceRule,
        att?.score || 0,
        rule.schoolViolenceRule?.percentOfAcquiredScore
          ? subtotal
          : rule.maximumScore,
      );
    const total = violence.disqualified
      ? null
      : precision(
          rule.totalCapAfterDeductions
            ? Math.min(subtotal - violence.deduction, Number(rule.totalCapAfterDeductions))
            : subtotal - violence.deduction,
          rule.rounding?.total,
        );
    const selectedInputIndexes = new Set(
        selected.flatMap((course) =>
          course._inputIndexes?.length
            ? course._inputIndexes
            : [course._inputIndex],
        ),
      ),
      excludedCourses = courses.filter(
        (course) => !selectedInputIndexes.has(course._inputIndex),
      );
    return {
      status: violence.disqualified ? "부적격" : rule.status,
      blocked: false,
      disqualified: violence.disqualified,
      selected,
      calculationCourses,
      excluded: excludedCourses,
      excludedDetails: excludedCourses
        .map((course) => ({ course, reason: exclusionReason(course, rule) })),
      rawAverage,
      average: academicScore,
      academicScore,
      selectedCourseBonus,
      selectedCreditBonus,
      selectedYearBonus,
      supplementalAchievementBonus,
      achievementWeightedAverageBonus,
      creditThresholdBonus,
      creditThresholdBonusBands,
      creditThresholdAcademicBonus,
      topAchievementAverageBandBonus,
      creditDeficitFinalMultiplier,
      attendance: att,
      volunteer,
      schoolViolence: violence,
      total,
      maximumScore: rule.maximumScore,
      ratio:
        rule.maximumScore && total != null
          ? trunc((total / rule.maximumScore) * 100, 2)
          : null,
    };
  }
  const api = {
    calculate,
    selectCourses,
    scoreCourse,
    attendanceTotal,
    attendanceScore,
    volunteerScore,
    schoolViolence,
    trunc,
    round,
    precision,
  };
  root.ScoreCalculator = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);

(function (root) {
  const courseKeys = [
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
  const attendanceKeys = [
    "schoolDays",
    "absence",
    "sickAbsence",
    "unexcusedAbsence",
    "otherAbsence",
    "tardy",
    "early",
    "missingClass",
    "perfectAttendanceYears",
    "schoolViolenceLevel",
  ];
  function normalize(data) {
    if (!data || !Array.isArray(data.courses))
      throw new Error("courses 배열이 없는 성적 JSON입니다.");
    return {
      courses: data.courses.map((course) =>
        Object.fromEntries(courseKeys.map((key) => [key, course?.[key] ?? ""])),
      ),
      attendance: Object.fromEntries(
        attendanceKeys.map((key) => [key, Number(data.attendance?.[key] || 0)]),
      ),
    };
  }
  function parseJson(text) {
    return normalize(JSON.parse(String(text || "")));
  }
  root.RecordCodec = { normalize, parseJson, courseKeys, attendanceKeys };
})(typeof window !== "undefined" ? window : globalThis);

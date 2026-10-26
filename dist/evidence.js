window.Evidence = {
  label: (e = {}) =>
    [e.pages, e.table].filter((value) => value != null && value !== "").join(" · ") ||
    "근거 위치 확인 필요",
  href: (e) => {
    e = e || {};
    const sources = (window.COVERAGE_ROWS || []).filter(
        (row) => row.planId === e.planId,
      ),
      source =
        sources.find((row) => row.localSourceAvailable && e.file) ||
        sources.find((row) => row.sourceUrl) ||
        sources[0];
    if (source?.localSourceAvailable && e.file) return e.file;
    return source?.sourceUrl || e.file || "#";
  },
  isExternal: (e) => /^https?:\/\//.test(window.Evidence.href(e)),
};

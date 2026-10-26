(function (root) {
  function parse(text) {
    const rows = [];
    let row = [],
      value = "",
      quoted = false;
    const source = String(text || "").replace(/^\ufeff/, "");
    for (let index = 0; index < source.length; index += 1) {
      const character = source[index];
      if (quoted) {
        if (character === '"' && source[index + 1] === '"') {
          value += '"';
          index += 1;
        } else if (character === '"') quoted = false;
        else value += character;
      } else if (character === '"' && value === "") quoted = true;
      else if (character === ",") {
        row.push(value);
        value = "";
      } else if (character === "\n") {
        row.push(value.replace(/\r$/, ""));
        rows.push(row);
        row = [];
        value = "";
      } else value += character;
    }
    if (value || row.length) {
      row.push(value.replace(/\r$/, ""));
      rows.push(row);
    }
    return rows.filter((items) => items.some((item) => item !== ""));
  }
  root.CsvCodec = { parse };
})(typeof window !== "undefined" ? window : globalThis);

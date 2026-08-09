// Parser CSV don gian (ho tro dau ngoac kep bao quanh field co dau phay/xuong dong).
function parseCsv(text) {
  const rows = [];
  let i = 0;
  let field = '';
  let row = [];
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    rows.push(row);
    row = [];
  };

  // Bo BOM neu co (file luu tu Excel/Notepad thuong co)
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  while (i < text.length) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += char;
      i++;
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (char === ',') {
      pushField();
      i++;
      continue;
    }
    if (char === '\r') {
      i++;
      continue;
    }
    if (char === '\n') {
      pushField();
      pushRow();
      i++;
      continue;
    }
    field += char;
    i++;
  }
  if (field.length || row.length) {
    pushField();
    pushRow();
  }

  const nonEmptyRows = rows.filter((r) => !(r.length === 1 && r[0] === ''));
  if (!nonEmptyRows.length) return [];

  const header = nonEmptyRows[0].map((h) => h.trim());
  return nonEmptyRows.slice(1).map((r) => {
    const obj = {};
    header.forEach((h, idx) => (obj[h] = (r[idx] ?? '').trim()));
    return obj;
  });
}

function escapeCsvField(field) {
  const s = String(field ?? '');
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * rows: mang cac object cung shape. header lay tu tham so hoac tu key cua row dau tien.
 */
function toCsv(rows, header) {
  const cols = header || (rows[0] ? Object.keys(rows[0]) : []);
  const lines = [cols.join(',')];
  for (const row of rows) {
    lines.push(cols.map((c) => escapeCsvField(row[c])).join(','));
  }
  return lines.join('\n');
}

module.exports = { parseCsv, toCsv };

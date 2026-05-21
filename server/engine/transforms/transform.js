import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat.js';
dayjs.extend(customParseFormat);

// config: { fieldTransforms: [{ field, type, opts }] }
// types: trim, uppercase, lowercase, date_format, replace, regex_extract
function applyOne(value, type, opts = {}) {
  if (value == null) return value;
  const s = String(value);
  switch (type) {
    case 'trim':
      return s.trim();
    case 'uppercase':
      return s.toUpperCase();
    case 'lowercase':
      return s.toLowerCase();
    case 'date_format': {
      const inFmt = opts.input || undefined;
      const outFmt = opts.output || 'YYYY-MM-DD';
      const d = inFmt ? dayjs(s, inFmt) : dayjs(s);
      return d.isValid() ? d.format(outFmt) : s;
    }
    case 'replace': {
      const find = opts.find ?? '';
      const replace = opts.replace ?? '';
      if (!find) return s;
      try {
        return s.split(find).join(replace);
      } catch {
        return s;
      }
    }
    case 'regex_extract': {
      try {
        const re = new RegExp(opts.pattern || '', opts.flags || '');
        const m = s.match(re);
        if (!m) return s;
        const group = typeof opts.group === 'number' ? opts.group : 1;
        return m[group] ?? m[0];
      } catch {
        return s;
      }
    }
    default:
      return s;
  }
}

export function fieldTransform(rows, config = {}) {
  const transforms = config.fieldTransforms || [];
  if (!transforms.length) return rows;
  return rows.map((row) => {
    const out = { ...row };
    for (const t of transforms) {
      if (!t.field) continue;
      out[t.field] = applyOne(out[t.field], t.type, t.opts || {});
    }
    return out;
  });
}

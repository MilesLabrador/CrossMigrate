// Client-side mirror of server/engine/inferType.js — used to suggest column
// types in the schema editor before a pipeline has ever run. Keep the two in
// sync: the server's inference is authoritative at run time.
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T[\d:.Z+-]+)?$/;
const BOOL_SET = new Set(['true', 'false', '1', '0', 'yes', 'no']);

export function inferType(values) {
  const nonNull = values.filter((v) => v !== null && v !== undefined && v !== '');
  if (!nonNull.length) return 'empty';

  let isNum = true, isBool = true, isDate = true;
  for (const v of nonNull) {
    const s = String(v).trim().toLowerCase();
    if (isNum  && isNaN(Number(v)))          isNum  = false;
    if (isBool && !BOOL_SET.has(s))          isBool = false;
    if (isDate && !ISO_DATE.test(String(v))) isDate = false;
    if (!isNum && !isBool && !isDate) break;
  }
  if (isBool) return 'boolean';
  if (isDate) return 'date';
  if (isNum)  return 'number';
  return 'text';
}

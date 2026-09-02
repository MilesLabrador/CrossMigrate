// Shared column-type inference used by schema preview (executeNode) and
// field-stat filtering (transforms/filter). Checks a sample of values and
// returns the narrowest type every non-empty value satisfies.
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T[\d:.Z+-]+)?$/;
const BOOL_SET = new Set(['true', 'false', '1', '0', 'yes', 'no']);

export function inferType(values) {
  const nonNull = values.filter((v) => v !== null && v !== undefined && v !== '');
  if (!nonNull.length) return 'empty';

  let isNum = true, isBool = true, isDate = true;
  for (const v of nonNull) {
    const s = String(v).trim().toLowerCase();
    if (isNum  && isNaN(Number(v)))            isNum  = false;
    if (isBool && !BOOL_SET.has(s))            isBool = false;
    if (isDate && !ISO_DATE.test(String(v)))   isDate = false;
    if (!isNum && !isBool && !isDate) break;
  }
  if (isBool) return 'boolean';
  if (isDate) return 'date';
  if (isNum)  return 'number';
  return 'text';
}

// SelectMap: rename / pick fields per the mapping table
// config: { mappings: [{ source, target, skip }] }
export function selectMap(rows, config = {}) {
  const mappings = (config.mappings || []).filter((m) => !m.skip && m.target);
  if (!mappings.length) return rows;
  return rows.map((row) => {
    const out = {};
    for (const m of mappings) {
      out[m.target] = row[m.source];
    }
    return out;
  });
}

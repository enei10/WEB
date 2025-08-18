// js/core/availability.js
(function () {
  function pickKey(row, candidates){ return candidates.find(k => k in row); }
  function intersectMany(sets){
    if (!sets.length) return new Set();
    return sets.slice(1).reduce((acc, s) => new Set([...acc].filter(x => s.has(x))), new Set(sets[0]));
  }
  async function loadAuto(path){
    const raw = await d3.text(path);
    const delim = raw.includes(";") ? ";" : ",";
    return d3.dsvFormat(delim).parse(raw, d3.autoType);
  }

  // sources: [{ path, y: [...], m: [...] }, ...]
  async function computeIntersection(sources){
    const sets = [];
    for (const s of sources) {
      const rows = await loadAuto(s.path);
      if (!rows.length) { sets.push(new Set()); continue; }
      const yKey = pickKey(rows[0], s.y);
      const mKey = pickKey(rows[0], s.m);
      const ym = new Set(
        rows
          .filter(r => r[yKey] != null && r[mKey] != null)
          .map(r => `${+r[yKey]}|${String(r[mKey]).trim()}`)
      );
      sets.push(ym);
    }

    const inter = intersectMany(sets);
    const byYear = {};
    for (const token of inter) {
      const [y, m] = token.split("|");
      (byYear[y] ||= []).push(m);
    }
    for (const y in byYear) {
      byYear[y] = Array.from(new Set(byYear[y]));
    }
    const years = Object.keys(byYear).map(Number).sort((a,b)=>a-b);
    return { years, byYear };
  }

  window.Availability = { computeIntersection };
})();

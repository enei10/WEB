// js/charts/footprintBars.js
(function () {
  const CSV_PATH = "data/footprint.csv";   // ajusta si tu ruta es otra
  const SEP = ";";

  // Categorías en orden visual B1..E
  const CATS = [
    { key: "CAT B1", label: "Presencia Pasiva (B1)", color: "#6a1b9a" }, // Presencia pasiva
    { key: "CAT B2", label: "Presencia Activa (B2)", color: "#2a9bd6" }, // Presencia activa
    { key: "CAT C",  label: "Tiendas en línea (C)",  color: "#d81b60" }, // Tiendas en línea
    { key: "CAT D",  label: "Servicios en línea (D)",  color: "#be2da1" }, // Servicios en línea
    { key: "CAT E",  label: "Servicios TIC",  color: "#244c9a" }, // Servicios TIC
  ];

  // --------- Layout base (sin selects locales) ----------
  const host = d3.select("#footprint");
  if (host.empty()) return;

  host.selectAll("*").remove(); // limpiar

  const margin = { top: 30, right: 20, bottom: 60, left: 80 };
  const width  = host.node().clientWidth || 720;
  const height = 420;

  const wrap = host.append("div")
    .attr("id", "footprint-bars")
    .style("position", "relative");

  const svg = wrap.append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("preserveAspectRatio", "xMidYMid meet")
    .style("width", "100%")
    .style("height", "auto");

  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  const innerW = width  - margin.left - margin.right;
  const innerH = height - margin.top  - margin.bottom;

  const tooltip = host.append("div").attr("class", "tooltip");

  const x = d3.scaleBand()
    .domain(CATS.map(c => c.label))
    .range([0, innerW])
    .padding(0.25);

  const y = d3.scaleLinear().range([innerH, 0]).nice();

  g.append("g")
    .attr("transform", `translate(0,${innerH})`)
    .call(d3.axisBottom(x).tickSizeOuter(0));

  const yAxisG = g.append("g");
  yAxisG.append("text")
    .attr("x", 0).attr("y", -12)
    .attr("fill", "#333").attr("font-weight", "600")
    .attr("text-anchor", "start")
    .text("Footprint promedio");

  const barsG   = g.append("g");
  const labelsG = g.append("g");

  const fmt = d3.format(".1f");
  const norm = s => String(s || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .trim().toLowerCase();

  // --------- Carga y normalización de datos ----------
  d3.dsv(SEP, CSV_PATH, d3.autoType).then(raw => {
    if (!raw || !raw.length) return;

    // Detectar claves reales para Año/Mes
    const sample   = raw[0];
    const yearKey  = ["Año","Ano","Year"].find(k => k in sample)  || "Año";
    const monthKey = ["Mes","Month"].find(k => k in sample)        || "Mes";

    const toNumber = (x) => {
      if (x == null || x === "") return 0;
      return +String(x).replace(/\./g, "").replace(",", ".");
    };
    // Lee desde "CAT B1" o, si no existe, desde "B1"
    const pickVal = (row, catKey, fallbackLabel) =>
      toNumber(row[catKey] ?? row[fallbackLabel] ?? 0);

    // Estructura normalizada
    const data = raw.map(d => ({
      year:  +d[yearKey],
      month: String(d[monthKey]).trim(),
      ...Object.fromEntries(CATS.map(c => [c.key, pickVal(d, c.key, c.label)]))
    }));

    // Índices de (año,mes) disponibles
    const years = Array.from(new Set(data.map(d => d.year))).filter(Number.isFinite).sort((a,b)=>a-b);
    const monthsByYear = new Map(years.map(y => [y, Array.from(new Set(data.filter(d=>d.year===y).map(d=>d.month)))]));
    let currentYear  = undefined;
    let currentMonth = undefined;

    // --------- Render ----------
    function rowFor(yval, mval) {
      return data.find(d => d.year === +yval && norm(d.month) === norm(mval)) || null;
    }

    function update(yval, mval) {
      const row = rowFor(yval, mval);
      const series = CATS.map(cat => ({
        key: cat.key,
        label: cat.label,
        color: cat.color,
        value: row ? (Number.isFinite(row[cat.key]) ? row[cat.key] : 0) : 0
      }));

      const maxVal = d3.max(series, d => d.value) || 0;
      y.domain([0, maxVal ? maxVal * 1.15 : 1]).nice();
      yAxisG.transition().duration(500).call(d3.axisLeft(y));

      const bars = barsG.selectAll("rect").data(series, d => d.key);

      bars.enter().append("rect")
        .attr("x", d => x(d.label))
        .attr("width", x.bandwidth())
        .attr("y", y(0))
        .attr("height", 0)
        .attr("fill", d => d.color)
        .merge(bars)
        .transition().duration(650).ease(d3.easeCubic)
        .attr("x", d => x(d.label))
        .attr("width", x.bandwidth())
        .attr("y", d => y(d.value))
        .attr("height", d => innerH - y(d.value));

      bars.exit().remove();

      const labels = labelsG.selectAll("text").data(series, d => d.key);

      labels.enter().append("text")
        .attr("text-anchor", "middle")
        .attr("font-size", "12px")
        .attr("fill", "#111")
        .attr("x", d => x(d.label) + x.bandwidth() / 2)
        .attr("y", y(0) - 6)
        .text(d => fmt(d.value))
        .merge(labels)
        .transition().duration(650).ease(d3.easeCubic)
        .attr("x", d => x(d.label) + x.bandwidth() / 2)
        .attrTween("y", function (d) {
          const start = +this.getAttribute("data-y") || (y(0) - 6);
          const it = d3.interpolateNumber(start, y(d.value) - 6);
          return t => {
            const ty = it(t);
            this.setAttribute("data-y", ty);
            return ty;
          };
        })
        .tween("text", function (d) {
          const start = parseFloat(this.textContent.replace(",", ".")) || 0;
          const i = d3.interpolateNumber(start, d.value);
          return t => this.textContent = fmt(i(t));
        });

      labels.exit().remove();

      barsG.selectAll("rect")
        .on("mousemove", (event, d) => {
          const [px, py] = d3.pointer(event, host.node());
          tooltip
            .style("left", (px + 14) + "px")
            .style("top",  (py + 14) + "px")
            .style("opacity", 1)
            .html(`
              <div style="font-weight:600;margin-bottom:2px;">Categoría ${d.label}</div>
              <div>Año: <b>${yval}</b> &nbsp; Mes: <b>${mval}</b></div>
              <div>Footprint: <b>${fmt(d.value)}</b></div>
            `);
        })
        .on("mouseleave", () => tooltip.style("opacity", 0));
    }

    // --------- Integración con Filtro Global ----------
    // 1) Si llega filtro global, lo usamos
    window.FilterBus?.subscribe(({ year, month }) => {
      if (year == null || !month) return;
      currentYear  = year;
      currentMonth = month;
      update(currentYear, currentMonth);
    });

    // 2) Si NO ha llegado filtro global aún, dibuja con el primer (año,mes) disponible
    if (currentYear == null || !currentMonth) {
      const y0 = years[0];
      const m0 = (monthsByYear.get(y0) || [])[0];
      if (y0 != null && m0) {
        currentYear = y0;
        currentMonth = m0;
        update(currentYear, currentMonth);
      }
    }

    // 3) Redibujar al cambiar el tamaño del contenedor (opcional simple)
    window.addEventListener("resize", () => {
      // el SVG es responsive por viewBox; no recalculamos escalas aquí
      // si quisieras recalcular x con nuevo ancho, habría que medir de nuevo y rehacer escalas
    }, { passive: true });
  });
})();

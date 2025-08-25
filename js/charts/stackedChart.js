// js/charts/stackedChart.js
// Requiere D3 v7+

document.addEventListener("DOMContentLoaded", () => {
  const host = d3.select("#stacked-chart");                 // contenedor del card (position:relative en tu CSS)
  const selectorWrap = d3.select("#stacked-selector");      // donde va la leyenda y (ocultos) los selects

  const margin = { top: 40, right: 30, bottom: 60, left: 120 };
  const baseHeight = 400;
  const height = baseHeight - margin.top - margin.bottom;

  // --- medidas dinámicas ---
  const getWidth = () =>
    (host.node()?.clientWidth || 900) - margin.left - margin.right;
  let width = getWidth();

  // --- SVG responsivo ---
  const svgRoot = host.append("svg")
    .attr("viewBox", `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
    .attr("preserveAspectRatio", "xMidYMid meet")
    .style("width", "100%")
    .style("height", "auto");

  const svg = svgRoot.append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  // ===== Niveles / colores (orden fijo) =====
  const niveles = ["Extreme", "Very High", "High", "Medium", "Low", "Very Low", "None"];
  const color = d3.scaleOrdinal()
    .domain(niveles)
    .range(["#cee230ff", "#6baed6", "#b2e2b2", "#238b45", "#fcbba1", "#cb181d", "#fdd0a2"]);

  // Estado de series activas (todas activas al inicio)
  let active = new Set(niveles);

  // ===== Tooltip =====
  const tooltip = host.append("div")
    .attr("class", "chart-tooltip")
    .style("position", "absolute")
    .style("pointer-events", "none")
    .style("opacity", 0);

  // Helpers anticorte (flip + clamp)
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const pad = 8, shift = 12;

  function showTip(event, html){
    if (html) tooltip.html(html);
    tooltip.interrupt().style("opacity", 0.98);

    const [mx, my] = d3.pointer(event, host.node());

    const cw = host.node().clientWidth;
    const ch = host.node().clientHeight;
    const tw = tooltip.node().offsetWidth  || 0;
    const th = tooltip.node().offsetHeight || 0;

    let left = mx + shift;
    let top  = my - 10;

    // si no cabe a la derecha, pásalo a la izquierda
    if (left + tw + pad > cw) left = mx - tw - shift;

    // limitar a los bordes del host
    left = clamp(left, pad, cw - tw - pad);
    top  = clamp(top,  pad, ch - th - pad);

    tooltip.style("left", `${left}px`).style("top", `${top}px`);
  }
  const hideTip = () => tooltip.transition().duration(120).style("opacity", 0);

  // ===== Escalas y ejes (persistentes) =====
  const x = d3.scaleLinear().range([0, width]);
  const y = d3.scaleBand().range([0, height]).padding(0.2);

  svg.append("g").attr("class", "x-axis").attr("transform", `translate(0,${height})`);
  svg.append("g").attr("class", "y-axis");

  // ===== Datos =====
  d3.dsv(";", "data/heartbeat.csv", d => {
    d = d3.autoType(d);
    d.Mes = String(d.Mes).trim(); // importante para filtro global
    return d;
  }).then(data => {
    // --- Meses / Años ordenados ---
    const ordenMeses = [
      "Enero","Febrero","Marzo","Abril","Mayo","Junio",
      "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"
    ];
    const meses = Array.from(new Set(data.map(d => d.Mes)))
      .sort((a, b) => ordenMeses.indexOf(a) - ordenMeses.indexOf(b));
    const anios = Array.from(new Set(data.map(d => d.Año))).sort();

    // ===== Selectores (locales, ocultos por tu CSS) =====
    const selMes = selectorWrap.append("select")
      .attr("id", "selMes")
      .style("margin-right", "10px")
      .on("change", () => updateChart(true));
    selMes.selectAll("option").data(meses).enter().append("option").text(d => d);

    const selAnio = selectorWrap.append("select")
      .attr("id", "selAnio")
      .on("change", () => updateChart(true));
    selAnio.selectAll("option").data(anios).enter().append("option").text(d => d);

    // ===== Leyenda (click -> toggle SIN tachado) =====
    d3.select("#stacked-legend").remove();
    const legend = selectorWrap.append("div")
      .attr("id", "stacked-legend")
      .style("margin-top", "10px")
      .style("display", "flex")
      .style("flex-wrap", "wrap")
      .style("gap", "10px 18px")
      .style("align-items", "center")
      .style("font", "12px/1.2 system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif");

    const legendItems = legend.selectAll(".legend-item")
      .data(niveles).enter()
      .append("div")
        .attr("class", "legend-item")
        .style("display", "inline-flex")
        .style("align-items", "center")
        .style("gap", "8px")
        .style("white-space", "nowrap")
        .style("cursor", "pointer")
        .on("click", (event, key) => {
          if (active.has(key)) active.delete(key); else active.add(key);
          updateLegendStyles();
          updateChart(true);
        });

    legendItems.append("span")
      .attr("class", "swatch")
      .style("width", "12px")
      .style("height", "12px")
      .style("border-radius", "2px")
      .style("box-shadow", "0 0 0 1px rgba(0,0,0,.1) inset")
      .style("background-color", d => color(d));

    legendItems.append("span").text(d => d);

    function updateLegendStyles() {
      legendItems.style("opacity", d => active.has(d) ? 1 : 0.35);
    }

    // === Sincronizar con filtro global ===
    window.FilterBus?.subscribe(({year, month}) => {
      if (year == null || !month) return;
      selAnio.property("value", year);
      selMes.property("value", month);
      updateChart(true);
    });

    // Inicialización (primer año/mes disponibles)
    const primerAnio = anios[0];
    const mesesDePrimerAnio = meses.filter(m => data.some(d => d.Año === primerAnio && d.Mes === m));
    const primerMes = mesesDePrimerAnio[0];
    selAnio.property("value", primerAnio);
    selMes.property("value", primerMes);

    updateLegendStyles();
    updateChart(false);

    // ===== Re-layout sincronizado con el card =====
    const ro = new ResizeObserver(() => {
      width = getWidth();
      svgRoot.attr("viewBox",
        `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`);
      x.range([0, width]);
      updateChart(false); // reusar escalas y repintar
    });
    ro.observe(host.node());

    // Fallback
    window.addEventListener("resize", () => {
      width = getWidth();
      svgRoot.attr("viewBox",
        `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`);
      x.range([0, width]);
      updateChart(false);
    }, { passive: true });

    // ===== Render =====
    function updateChart(withEase = false) {
      const mes  = selMes.property("value");
      const anio = +selAnio.property("value");
      const datosFiltrados = data.filter(d => d.Mes === mes && d.Año === anio);

      // Agrupar por categoría
      const datosPorCategoria = d3.group(datosFiltrados, d => d.Categorías);

      // 1) Total SOLO de series activas (renormaliza a 100)
      // 2) Series inactivas -> 0
      const datosTransformados = Array.from(datosPorCategoria, ([categoria, valores]) => {
        const obj = { Categoria: categoria };
        const totalActivo = d3.sum(valores, d => d3.sum(niveles, k => active.has(k) ? d[k] : 0));

        niveles.forEach(nivel => {
          const sumaNivel = d3.sum(valores, d => d[nivel]);
          obj[nivel] = active.has(nivel)
            ? (totalActivo ? (sumaNivel * 100 / totalActivo) : 0)
            : 0;
        });
        return obj;
      });

      // Stack SIEMPRE con el orden completo (posición/color fijos)
      const series = d3.stack().keys(niveles)(datosTransformados);

      x.domain([0, 100]);
      y.domain(datosTransformados.map(d => d.Categoria)).range([0, height]);

      const t = svg.transition().duration(withEase ? 450 : 250).ease(d3.easeCubic);

      svg.select(".x-axis").transition(t)
        .call(d3.axisBottom(x).ticks(5).tickFormat(d => `${d}%`));

      svg.select(".y-axis").transition(t)
        .call(d3.axisLeft(y));

      // Join de capas por clave fija
      const grupos = svg.selectAll("g.layer")
        .data(series, d => d.key);

      grupos.exit().remove();

      const nuevosGrupos = grupos.enter()
        .append("g")
        .attr("class", "layer");

      const mergedGrupos = nuevosGrupos.merge(grupos)
        .attr("fill", d => color(d.key));

      // Rects
      const rects = mergedGrupos.selectAll("rect")
        .data(d => d.map(p => ({ ...p, key: d.key })), d => `${d.data.Categoria}-${d.key}`);

      rects.enter()
        .append("rect")
        .attr("y", d => y(d.data.Categoria))
        .attr("x", d => x(d[0]))
        .attr("height", y.bandwidth())
        .attr("width", 0)
        .on("mouseover", (event, d) => {
          if (!active.has(d.key)) return;
          const html = `
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
              <span style="width:10px;height:10px;background:${color(d.key)};display:inline-block;border-radius:2px"></span>
              <strong>${d.key}</strong>
            </div>
            ${d.data.Categoria}: <strong>${d3.format(".1f")(d.data[d.key])}%</strong>
          `;
          showTip(event, html);
        })
        .on("mousemove", (event, d) => {
          if (!active.has(d.key)) return;
          showTip(event); // solo reubica, conserva HTML
        })
        .on("mouseleave", hideTip)
        .transition(t)
        .attr("width", d => x(d[1]) - x(d[0]));

      rects
        .on("mouseover", (event, d) => {
          if (!active.has(d.key)) return;
          const html = `
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
              <span style="width:10px;height:10px;background:${color(d.key)};display:inline-block;border-radius:2px"></span>
              <strong>${d.key}</strong>
            </div>
            ${d.data.Categoria}: <strong>${d3.format(".1f")(d.data[d.key])}%</strong>
          `;
          showTip(event, html);
        })
        .on("mousemove", (event, d) => {
          if (!active.has(d.key)) return;
          showTip(event);
        })
        .on("mouseleave", hideTip)
        .transition(t)
        .attr("x", d => x(d[0]))
        .attr("width", d => x(d[1]) - x(d[0]))
        .attr("y", d => y(d.data.Categoria))
        .attr("height", y.bandwidth());

      rects.exit().remove();

      svg.select(".x-axis").raise();
      svg.select(".y-axis").raise();
    }
  });
});

// js/charts/barTreemap.js
// Requiere D3 v7+

(function(){
  const DATA_URL = "data/trustgrade.csv";
  const SERIES   = ["A","B","C","D","E","F"];
  const MONTHS   = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

  const color = d3.scaleOrdinal().domain(SERIES).range(d3.schemeTableau10.slice(0, SERIES.length));
  let active = new Set(SERIES);

  // ===== Layout base =====
  const host = d3.select("#bar-treemap");
  if (host.empty()) return;
  host.selectAll("*").remove();

  const wrap = host.append("div")
    .attr("class","bar-treemap-wrap")
    .style("margin","0 auto")
    .style("position","relative");

  const controls = wrap.append("div")
    .style("display","flex").style("gap","12px")
    .style("justify-content","center").style("align-items","center")
    .style("margin-bottom","10px");

  // (se ocultan globalmente por CSS)
  const yearSel  = controls.append("label").text("Año ").append("select").attr("id","bt-year");
  const monthSel = controls.append("label").text("Mes ").append("select").attr("id","bt-month");

  const stage = wrap.append("div").attr("class","bt-stage");

  // Tooltip estándar + clamp
  const tooltip = wrap.append("div")
    .attr("class", "chart-tooltip")
    .style("position", "absolute")
    .style("pointer-events", "none")
    .style("opacity", 0);

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  function showTip(event, html){
    tooltip.interrupt().style("opacity", 0.98).html(html);
    const [mx, my] = d3.pointer(event, wrap.node());
    const pad = 8, shift = 14;
    const cw = wrap.node().clientWidth;
    const ch = wrap.node().clientHeight;
    const tw = tooltip.node().offsetWidth  || 0;
    const th = tooltip.node().offsetHeight || 0;
    let left = mx + shift;
    let top  = my - 10;
    if (left + tw + pad > cw) left = mx - tw - shift; // flip si no cabe a la derecha
    left = clamp(left, pad, cw - tw - pad);
    top  = clamp(top,  pad, ch - th - pad);
    tooltip.style("left", `${left}px`).style("top", `${top}px`);
  }
  const hideTip = () => tooltip.transition().duration(120).style("opacity", 0);

  // ===== Utilidades de tamaño =====
  function getWidth(){
    return stage.node().clientWidth || host.node().clientWidth || 960;
  }

  async function waitForStableSize(el, { minStabilityMs=220, timeoutMs=3000 } = {}){
    return new Promise(resolve => {
      let last = el.clientWidth, lastChange = performance.now(), start = performance.now();
      const ro = new ResizeObserver(() => {
        const w = el.clientWidth;
        if (w !== last){ last = w; lastChange = performance.now(); }
      });
      ro.observe(el);
      (function check(){
        const now = performance.now();
        if ((now - lastChange >= minStabilityMs && last > 0) || (now - start >= timeoutMs)){
          ro.disconnect(); resolve();
        } else { requestAnimationFrame(check); }
      })();
    });
  }

  // ===== Carga/parseo =====
  async function loadData(){
    const raw = await d3.text(DATA_URL);
    const delim = raw.includes(";") ? ";" : ",";
    const parse = d3.dsvFormat(delim).parse;
    return parse(raw, d3.autoType).map(d => ({
      Año: +d["Año"],
      Mes: String(d["Mes"]).trim(),
      Categorías: String(d["Categorías"]),
      ...Object.fromEntries(SERIES.map(s => [s, d[s] != null ? +d[s] : 0]))
    }));
  }

  function initSelectors(data){
    const years  = Array.from(new Set(data.map(d => d.Año))).sort((a,b)=>a-b);
    const months = Array.from(new Set(data.map(d => d.Mes))).sort((a,b)=>MONTHS.indexOf(a)-MONTHS.indexOf(b));
    yearSel.selectAll("option").data(years).join("option").attr("value", d=>d).text(d=>d);
    monthSel.selectAll("option").data(months).join("option").attr("value", d=>d).text(d=>d);
    yearSel.property("value", years[0]);
    monthSel.property("value", months[0]);
  }

  // Orden fijo de filas (categorías)
  const orderMap = {
    "Presencia Pasiva (B1)": 1,
    "Presencia Activa (B2)": 2,
    "Tiendas en línea (C)": 3,
    "Servicios en línea (D)": 4,
    "Servicios TIC (E)": 5
  };

  function buildRows(data, year, month){
    const filtered = data.filter(d => d.Año === +year && d.Mes === month);
    const byCat = d3.group(filtered, d => d.Categorías);
    const rows = Array.from(byCat, ([cat, rowsCat]) => {
      const sums = Object.fromEntries(
        SERIES.map(s => [s, d3.sum(rowsCat, r => (r[s] || 0))])
      );
      // Si una serie está inactiva => valor 0 en la fila
      SERIES.forEach(s => { if (!active.has(s)) sums[s] = 0; });
      // Total solo con series activas
      const total = d3.sum(SERIES.filter(s => active.has(s)), s => sums[s]);
      return { category: cat, total, ...sums };
    }).filter(r => r.total > 0);

    rows.sort((a,b) => (orderMap[a.category] ?? 999) - (orderMap[b.category] ?? 999));
    return rows;
  }

  // ===== Dibujo =====
  let svgBT = null, gBT = null;

  function drawBarTreemap(rows){
    // Leyenda común (igual estilo que otros charts)
    wrap.select("#bt-legend").remove();
    const legendDiv = wrap.insert("div", ":first-child")
      .attr("id","bt-legend")
      .attr("class","legend")
      .style("display","flex")
      .style("flex-wrap","wrap")
      .style("gap","10px 18px")
      .style("justify-content","center")
      .style("align-items","center")
      .style("margin","8px 0");

    const legendItems = legendDiv.selectAll(".legend-item")
      .data(SERIES)
      .join(enter => {
        const it = enter.append("div")
          .attr("class","legend-item")
          .style("display","inline-flex")
          .style("align-items","center")
          .style("gap","8px")
          .style("white-space","nowrap")
          .style("cursor","pointer")
          .on("click", (event, key) => {
            if (active.has(key)) active.delete(key); else active.add(key);
            updateLegendStyles();
            if (typeof window.btUpdate === "function") window.btUpdate();
          });

        it.append("span")
          .attr("class","swatch")
          .style("width","12px")
          .style("height","12px")
          .style("border-radius","2px")
          .style("box-shadow","0 0 0 1px rgba(0,0,0,.1) inset")
          .style("background-color", d => color(d));
        it.append("span").text(d => d);
        return it;
      });

    function updateLegendStyles(){
      legendItems.style("opacity", d => active.has(d) ? 1 : 0.35);
    }
    updateLegendStyles();

    // --- Layout actual (100% del card, sin tope de 1100px) --- (100% del card, sin tope de 1100px) ---
    const width  = getWidth();
    const height = 520;
    const margin = { top: 24, right: 20, bottom: 64, left: 70 };

    if (!svgBT){
      svgBT = stage.append("svg")
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("preserveAspectRatio", "xMidYMid meet")
        .style("width","100%")
        .style("height","auto");
      gBT = svgBT.append("g");
    } else {
      svgBT.attr("viewBox", `0 0 ${width} ${height}`);
    }

    const g = gBT.attr("transform", `translate(${margin.left},${margin.top})`);
    const innerW = width  - margin.left - margin.right;
    const innerH = height - margin.top  - margin.bottom;

    const categories = rows.map(d => d.category);
    const x = d3.scaleBand().domain(categories).range([0, innerW]).paddingInner(0.12).paddingOuter(0.04);
    const y = d3.scaleLinear().domain([0,1]).range([innerH,0]);

    // Ejes persistentes
    const yAxisG = g.selectAll("g.y-axis").data([null]).join("g").attr("class","y-axis");
    const xAxisG = g.selectAll("g.x-axis").data([null]).join("g").attr("class","x-axis")
      .attr("transform", `translate(0,${innerH})`);

    yAxisG.call(d3.axisLeft(y).ticks(6).tickFormat(d3.format(".0%")));
    xAxisG.call(d3.axisBottom(x)).selectAll("text").attr("dy","0.9em").style("text-anchor","middle");

    // Barras (una por categoría)
    const tFast = d3.transition().duration(280).ease(d3.easeCubic);
    const tNorm = d3.transition().duration(360).ease(d3.easeCubic);

    const barGroups = g.selectAll("g.bar").data(rows, d => d.category);
    barGroups.exit().transition(tFast).style("opacity", 0).remove();

    const barEnter = barGroups.enter().append("g").attr("class","bar").style("opacity",0);
    const bars = barEnter.merge(barGroups)
      .attr("transform", d => `translate(${x(d.category)}, ${y(1)})`);

    barEnter.transition(tFast).style("opacity", 1);

    // Celdas treemap dentro de cada barra
    bars.each(function(row){
      const barW = x.bandwidth();
      const barH = innerH - y(1); // = innerH

      const root = d3.hierarchy({
        name: row.category,
        children: SERIES.map(s => ({ name: s, value: row[s] || 0 }))
      }).sum(d => d.value);

      d3.treemap().size([barW, barH]).paddingInner(2).round(true)(root);

      const gBar = d3.select(this);
      const nodes = root.leaves();
      const total = row.total || 1;

      const cells = gBar.selectAll("g.cell").data(nodes, d => d.data.name);

      // EXIT: shrink + fade
      const cellsExit = cells.exit();
      cellsExit.select("rect").transition(tFast)
        .attr("x", d => (d.x0 + d.x1) / 2)
        .attr("y", d => (d.y0 + d.y1) / 2)
        .attr("width", 0).attr("height", 0)
        .style("opacity", 0);
      cellsExit.select("text").transition(tFast).style("opacity", 0);
      cellsExit.transition().delay(280).remove();

      // ENTER
      const cellsEnter = cells.enter().append("g").attr("class","cell").style("opacity",0);

      cellsEnter.append("rect")
        .attr("x", d => (d.x0 + d.x1) / 2)
        .attr("y", d => (d.y0 + d.y1) / 2)
        .attr("width", 0).attr("height", 0)
        .attr("fill", d => color(d.data.name))
        .on("mouseenter", (event, d) => {
          if (!active.has(d.data.name) || !(d.value > 0)) return;
          const pct = d.value / total;
          const html = `
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
              <span style="width:10px;height:10px;background:${color(d.data.name)};display:inline-block;border-radius:2px"></span>
              <strong>${row.category}</strong>
            </div>
            Clasificación: <strong>${d.data.name}</strong><br>
            Valor: <strong>${d3.format(",d")(d.value)}</strong><br>
            Participación: <strong>${d3.format(".1%")(pct)}</strong>
          `;
          showTip(event, html);
        })
        .on("mousemove", (event, d) => {
          if (!active.has(d.data.name) || !(d.value > 0)) return;
          const pct = d.value / total;
          const html = `
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
              <span style="width:10px;height:10px;background:${color(d.data.name)};display:inline-block;border-radius:2px"></span>
              <strong>${row.category}</strong>
            </div>
            Clasificación: <strong>${d.data.name}</strong><br>
            Valor: <strong>${d3.format(",d")(d.value)}</strong><br>
            Participación: <strong>${d3.format(".1%")(pct)}</strong>
          `;
          showTip(event, html);
        })
        .on("mouseleave", hideTip);

      cellsEnter.append("text")
        .attr("x", d => (d.x0 + d.x1) / 2)
        .attr("y", d => (d.y0 + d.y1) / 2)
        .attr("fill", "white").attr("font-size", 11)
        .attr("pointer-events", "none")
        .style("opacity", 0)
        .text(d => {
          const pct = d.value / total;
          return (d.x1 - d.x0) > 34 && (d.y1 - d.y0) > 16 ? `${d.data.name} ${d3.format(".0%")(pct)}` : "";
        });

      // UPDATE + ENTER
      const cellsAll = cellsEnter.merge(cells);
      cellsEnter.transition(tFast).style("opacity", 1);

      cellsAll.select("rect")
        .style("pointer-events", d => (d.value > 0 && active.has(d.data.name)) ? "auto" : "none")
        .transition(tNorm)
        .attr("x", d => d.x0)
        .attr("y", d => d.y0)
        .attr("width",  d => Math.max(0, d.x1 - d.x0))
        .attr("height", d => Math.max(0, d.y1 - d.y0))
        .attr("fill", d => color(d.data.name));

      cellsAll.select("text").transition(tNorm)
        .attr("x", d => d.x0 + 4)
        .attr("y", d => d.y0 + 12)
        .style("opacity", d => (d.value > 0 && (d.x1 - d.x0) > 34 && (d.y1 - d.y0) > 16) ? 1 : 0)
        .tween("text", function(d){
          const self = d3.select(this);
          return () => {
            const pct = d.value / total;
            const show = (d.value > 0 && (d.x1 - d.x0) > 34 && (d.y1 - d.y0) > 16);
            self.text(show ? `${d.data.name} ${d3.format(".0%")(pct)}` : "");
          };
        });
    });
  }

  // ===== Controlador =====
  (async function main(){
    const data = await loadData();
    initSelectors(data);

    // Filtro global
    window.FilterBus?.subscribe(({year, month}) => {
      if (year == null || !month) return;
      yearSel.property("value", year);
      monthSel.property("value", month);
      drawBarTreemap(buildRows(data, year, month));
    });

    // Función de actualización (local)
    function update(){
      const year  = +yearSel.property("value");
      const month = monthSel.property("value");
      const rows  = buildRows(data, year, month);
      drawBarTreemap(rows);
    }

    window.btUpdate = update;
    yearSel.on("change", update);
    monthSel.on("change", update);

    // Primer render estable
    try { await document.fonts?.ready; } catch(_) {}
    await waitForStableSize(host.node());
    update();

    // Re-render por cambios de tamaño del card / ventana
    const ro = new ResizeObserver(() => update());
    ro.observe(host.node());
    window.addEventListener("resize", () => update(), { passive: true });
  })();
})();

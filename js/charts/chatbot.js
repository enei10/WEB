// js/charts/chatbot.js
// Requiere D3 v7+

document.addEventListener("DOMContentLoaded", async () => {
  const container = d3.select("#chatbot-chart");
  container.style("position", "relative"); // ancla para el tooltip

  const margin = { top: 48, right: 28, bottom: 48, left: 56 };
  const getWidth = () =>
    (container.node().clientWidth || 920) - margin.left - margin.right;

  let width  = getWidth();
  const height = 420 - margin.top - margin.bottom;

  const svg = container.append("svg")
    .attr("viewBox", `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
    .attr("preserveAspectRatio", "xMidYMid meet")
    .style("width", "100%")
    .style("height", "auto");

  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  // Tooltip estándar
  const tooltip = container.append("div")
    .attr("class", "chart-tooltip")
    .style("position", "absolute")
    .style("pointer-events", "none")
    .style("opacity", 0);

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  function showTooltip(event, html) {
    const [mx, my] = d3.pointer(event, container.node());
    tooltip.html(html).style("opacity", 0.98);
    const tw = tooltip.node().offsetWidth || 0;
    const th = tooltip.node().offsetHeight || 0;
    const cw = container.node().clientWidth;
    const ch = container.node().clientHeight;
    let left = mx + 14;
    let top  = my - 10;
    if (left + tw + 8 > cw) left = mx - tw - 14;
    left = clamp(left, 8, cw - tw - 8);
    top  = clamp(top,  8, ch - th - 8);
    tooltip.style("left", `${left}px`).style("top", `${top}px`);
  }
  const hideTooltip = () => tooltip.transition().duration(120).style("opacity", 0);

  // Meses ES y parseo "Dic-2023"
  const mesesES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  const mesesESFull = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
  const parseMesYYYY = (str) => {
    if (!str) return null;
    const [mesStr, yyyyStr] = String(str).split("-");
    const m = mesesES.indexOf(mesStr);
    const y = parseInt(yyyyStr, 10);
    if (m < 0 || isNaN(y)) return null;
    return new Date(Date.UTC(y, m, 1));
  };
  const formatMesHeader = (date) => `${mesesESFull[date.getUTCMonth()]} ${date.getUTCFullYear()}`;

  // ====== Datos ======
  let dataRaw = await d3.dsv(";", "data/chatbot.csv", d3.autoType);

  // Normalizar encabezado Mes (BOM)
  const mesKey = Object.keys(dataRaw[0]).find(k => k.replace(/\uFEFF/g, "").trim() === "Mes") || "Mes";

  // Fecha y orden
  dataRaw.forEach(d => { d.Mes = d[mesKey]; d.fecha = parseMesYYYY(d.Mes); });
  dataRaw = dataRaw
    .filter(d => d.fecha instanceof Date && !isNaN(d.fecha))
    .sort((a,b) => d3.ascending(a.fecha, b.fecha));

  // Series (sin Mes/fecha/Total)
  const allCols = Object.keys(dataRaw[0]);
  const seriesKeys = allCols.filter(k => !["Mes","fecha","Total", mesKey].includes(k));

  // Estado de visibilidad de series (leyenda/tooltip)
  const active = new Map(seriesKeys.map(k => [k, true]));

  // Escalas (x se actualizará en relayout)
  const x = d3.scaleBand().domain(dataRaw.map(d => d.fecha)).range([0, width]).padding(0.2);
  const yMax = d3.max(dataRaw, d => {
    const sMax = d3.max(seriesKeys, k => +d[k] || 0) || 0;
    return Math.max(d.Total ?? 0, sMax);
  });
  const y = d3.scaleLinear().domain([0, yMax]).nice().range([height, 0]);

  // Colores de líneas
  const color = d3.scaleOrdinal().domain(seriesKeys).range(d3.schemeSet1.slice(0, seriesKeys.length));

  // Ejes
  const xAxisG = g.append("g")
    .attr("class", "axis-x-bottom")
    .attr("transform", `translate(0,${height})`);

  const yAxisG = g.append("g")
    .attr("class", "axis-y-left")
    .call(d3.axisLeft(y).ticks(6));

  function drawXAxis(){
    xAxisG.call(d3.axisBottom(x).tickFormat(d => {
      const m = d.getUTCMonth();
      const y4 = d.getUTCFullYear();
      return `${mesesES[m]}-${y4}`;
    }));
  }
  drawXAxis();

  // Barras (Total)
  const barFill = "#e4c3dfff";
  const barsG = g.append("g").attr("class", "bars");
  const bars = barsG
    .selectAll("rect")
    .data(dataRaw, d => d.Mes)
    .join("rect")
    .attr("x", d => x(d.fecha))
    .attr("y", y(0))
    .attr("width", x.bandwidth())
    .attr("height", 0)
    .attr("fill", barFill);

  bars.transition()
    .duration(900)
    .attr("y", d => y(d.Total))
    .attr("height", d => y(0) - y(d.Total))
    .ease(d3.easeCubicOut);

  const valueFmt = d3.format(",.0f");

  bars
    .on("mousemove", (event, d) => {
      const html = `
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
          <span style="width:10px;height:10px;background:#666;display:inline-block;border-radius:2px"></span>
          <strong>${d.Mes}</strong>
        </div>
        Total: <strong>${valueFmt(d.Total)}</strong>`;
      showTooltip(event, html);
    })
    .on("mouseleave", hideTooltip);

  // Datos de líneas
  const seriesData = seriesKeys.map(k => ({
    key: k,
    values: dataRaw.map(d => ({ fecha: d.fecha, Mes: d.Mes, value: +d[k] || 0 }))
  }));

  // Generador de línea
  const lineGen = d3.line()
    .defined(d => d.value != null && !isNaN(d.value))
    .x(d => x(d.fecha) + x.bandwidth() / 2)
    .y(d => y(d.value));

  const linesG = g.append("g").attr("class", "lines");

  // Paths de líneas
  const paths = linesG.selectAll(".line-series")
    .data(seriesData, d => d.key)
    .join("path")
    .attr("class", "line-series")
    .attr("fill", "none")
    .attr("stroke-width", 3)
    .attr("stroke", d => color(d.key))
    .attr("d", d => lineGen(d.values));

  // Puntos (ocultos hasta terminar animación)
  const pointsSeries = linesG.selectAll(".points-series")
    .data(seriesData, d => d.key)
    .join(enter => {
      const gS = enter.append("g")
        .attr("class", "points-series")
        .style("opacity", 0);

      gS.selectAll("circle")
        .data(d => d.values.map(v => ({...v, key: d.key})))
        .join("circle")
        .attr("cx", d => x(d.fecha) + x.bandwidth() / 2)
        .attr("cy", d => y(d.value))
        .attr("r", 3.5)
        .attr("fill", d => color(d.key))
        .attr("stroke", d => color(d.key))
        .attr("stroke-width", 1.25);

      return gS;
    });

  // Animación de líneas + mostrar puntos
  let pending = 0;
  paths.each(function() { pending += 1; });
  paths.each(function() {
    const totalLength = this.getTotalLength();
    d3.select(this)
      .attr("stroke-dasharray", `${totalLength} ${totalLength}`)
      .attr("stroke-dashoffset", totalLength)
      .transition().duration(900).ease(d3.easeCubicOut)
      .attr("stroke-dashoffset", 0)
      .on("end", () => {
        pending -= 1;
        if (pending === 0) {
          pointsSeries
            .transition().duration(300)
            .style("opacity", d => active.get(d.key) ? 1 : 0);
        }
      });
  });

  // Leyenda (toggle)
  const legendDiv = container.insert("div", ":first-child")
    .attr("id","chatbot-legend")
    .style("display","flex")
    .style("flex-wrap","wrap")
    .style("gap","10px 18px")
    .style("justify-content","center")
    .style("align-items","center")
    .style("margin","8px 0");

  const legendItems = legendDiv.selectAll(".legend-item")
    .data(seriesKeys, d => d)
    .join(enter => {
      const it = enter.append("div")
        .attr("class","legend-item")
        .style("display","inline-flex")
        .style("align-items","center")
        .style("gap","8px")
        .style("cursor","pointer")
        .on("click", (ev, key) => {
          const newState = !active.get(key);
          active.set(key, newState);

          d3.select(ev.currentTarget).style("opacity", newState ? 1 : 0.35);

          // líneas / puntos
          linesG.selectAll(".line-series")
            .filter(d => d.key === key)
            .attr("opacity", newState ? 1 : 0);

          linesG.selectAll(".points-series")
            .filter(d => d.key === key)
            .transition().duration(200)
            .style("opacity", newState ? 1 : 0);
        });

      it.append("span")
        .style("width","12px").style("height","12px")
        .style("border-radius","2px")
        .style("box-shadow","0 0 0 1px rgba(0,0,0,.1) inset")
        .style("background-color", d => color(d));

      it.append("span").text(d => d);
      return it;
    });

  legendItems.style("opacity", d => active.get(d) ? 1 : 0.35);

  // Focus-line + overlay
  const focus = g.append("g").attr("class", "focus").style("display", "none");
  focus.append("line")
    .attr("class", "focus-line")
    .attr("stroke", "#888")
    .attr("stroke-width", 1)
    .attr("y1", 0)
    .attr("y2", height);

  const overlay = g.append("rect")
    .attr("width", width)
    .attr("height", height)
    .style("fill", "none")
    .style("pointer-events", "all")
    .on("mouseover", () => { focus.style("display", null); })
    .on("mouseout",  () => { focus.style("display", "none"); hideTooltip(); })
    .on("mousemove", overlayMove);

  function overlayMove(event) {
    const [mx] = d3.pointer(event, g.node());
    const centers = dataRaw.map(d => x(d.fecha) + x.bandwidth() / 2);
    const idx = d3.leastIndex(centers, c => Math.abs(c - mx));
    const row = dataRaw[idx];
    const xCenter = centers[idx];

    focus.select(".focus-line")
      .attr("x1", xCenter)
      .attr("x2", xCenter);

    const header = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
        <strong>${formatMesHeader(row.fecha)}</strong>
      </div>`;

    const totalRow = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:2px;">
        <span style="width:10px;height:10px;background:${barFill};display:inline-block;border-radius:2px"></span>
        <span>Total: <strong>${valueFmt(row.Total)}</strong></span>
      </div>`;

    const rowsData = seriesKeys
      .filter(k => active.get(k))
      .map(k => ({ key: k, value: +row[k] || 0 }))
      .sort((a,b) => b.value - a.value);

    const rows = rowsData.map(({ key, value }) => `
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="width:10px;height:10px;background:${color(key)};display:inline-block;border-radius:2px"></span>
        <span>${key}: <strong>${valueFmt(value)}</strong></span>
      </div>
    `).join("");

    showTooltip(event, header + totalRow + rows);
  }

  // ===== Re-layout sincronizado =====
  function relayout() {
    width = getWidth();
    svg.attr("viewBox", `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`);
    x.range([0, width]);
    overlay.attr("width", width);

    // Reposicionar todo (sin cambiar dominios)
    drawXAxis();

    bars
      .attr("x", d => x(d.fecha))
      .attr("width", x.bandwidth())
      .attr("y", d => y(d.Total))
      .attr("height", d => y(0) - y(d.Total));

    linesG.selectAll(".line-series")
      .attr("d", d => lineGen(d.values));

    linesG.selectAll(".points-series circle")
      .attr("cx", d => x(d.fecha) + x.bandwidth() / 2)
      .attr("cy", d => y(d.value));
  }

  // Espera a que el layout esté estable antes del primer trazado animado (fonts/flujo)
  async function waitForStableSize(el, { minStabilityMs=220, timeoutMs=3000 } = {}) {
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

  try { await document.fonts?.ready; } catch(_) {}
  await waitForStableSize(container.node());

  // (Por si algo cambió antes de animar)
  relayout();

  // Observer + fallback para cambios posteriores
  const ro = new ResizeObserver(() => relayout());
  ro.observe(container.node());
  window.addEventListener("resize", () => relayout(), { passive: true });
});

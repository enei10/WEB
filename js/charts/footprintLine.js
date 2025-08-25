/* js/charts/footprintLine.js
   Requiere D3 v7+
   Gráfico de líneas multi-serie para #footprint-line.
   - Leyenda clickeable
   - Trazo animado con easeCubic (secuencia igual a lineChartCategoria.js)
   - Tooltip con flip/clamp + focus vertical
   - Responsivo con ResizeObserver
*/

(function(){
  const DATA_URL = "data/footprint.csv";
  const margin = { top: 56, right: 28, bottom: 46, left: 64 };

  // ---- Contenedores
  const host = d3.select("#footprint-line").style("position","relative");
  if (host.empty()) return console.error("[footprintLine] Falta #footprint-line");
  host.selectAll("*").remove();

  const wrap = host.append("div").attr("class","fp-wrap").style("position","relative").style("width","100%");

  // 1) Leyenda ARRIBA
  const legend  = wrap.append("div")
    .attr("id","fp-legend")
    .style("display","flex").style("flex-wrap","wrap")
    .style("gap","10px 18px").style("justify-content","center")
    .style("font-size","12px").style("margin-bottom","8px");

  // 2) SVG ABAJO
  const svgHost = wrap.append("div")
    .attr("class","fp-svghost")
    .style("width","100%");

  // Tooltip (igual)
  const tooltip = wrap.append("div")
    .attr("class","chart-tooltip")
    .style("opacity", 0);

  // ---- Utilidades
  const pad = 8, shift = 14;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const getWidth = () => (svgHost.node()?.clientWidth || 900) - margin.left - margin.right;

  let width = Math.max(200, getWidth());
  const height = 420 - margin.top - margin.bottom;

  // ---- SVG
  const svgRoot = svgHost.append("svg")
    .attr("viewBox", `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
    .attr("preserveAspectRatio","xMidYMid meet")
    .style("width","100%").style("height","auto");

  const svg = svgRoot.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  // ---- Escalas, ejes, generador
  const x = d3.scaleTime().range([0, width]);
  const y = d3.scaleLinear().range([height, 0]);
  const xAxisG = svg.append("g").attr("transform", `translate(0,${height})`);
  const yAxisG = svg.append("g");

  const line = d3.line()
    .defined(d => Number.isFinite(d.valor))
    .x(d => x(d.fecha))
    .y(d => y(d.valor));

  // Focus y overlay
  const focus = svg.append("g").attr("class","focus").style("display","none");
  focus.append("line").attr("stroke","#888").attr("stroke-width",1).attr("y1",0).attr("y2",height);

  const overlay = svg.append("rect")
    .attr("width", width).attr("height", height)
    .style("fill","none").style("pointer-events","all");
  overlay.lower();

  // Esperar contenedor estable (misma lógica que el otro chart)
  function waitForStableSize(el, { minStabilityMs=220, timeoutMs=3000 } = {}) {
    return new Promise(resolve => {
      let last = el.clientWidth, lastChange = performance.now(), start = performance.now();
      const ro = new ResizeObserver(() => {
        const w = el.clientWidth;
        if (w !== last) { last = w; lastChange = performance.now(); }
      });
      ro.observe(el);
      (function check(){
        const now = performance.now();
        if ((now - lastChange >= minStabilityMs && last > 0) || (now - start >= timeoutMs)) {
          ro.disconnect(); resolve();
        } else { requestAnimationFrame(check); }
      })();
    });
  }

  // ---- Parseo CSV
  const MONTHS_ES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
  const MONTH_ALIASES = new Map([["ene",0],["feb",1],["mar",2],["abr",3],["may",4],["jun",5],["jul",6],["ago",7],["set",8],["sep",8],["oct",9],["nov",10],["dic",11]]);
  const parseNumber = s => {
    if (s == null) return NaN;
    const t = String(s).trim();
    if (!t || /^na$/i.test(t)) return NaN;
    return +t.replace(/\./g,"").replace(",",".");
  };
  function parseRow(row){
    const out = { ...row };
    for (const k of Object.keys(out)) {
      const key = k.trim().toLowerCase();
      if (["año","ano","anio","year","mes","month"].includes(key)) continue;
      out[k] = parseNumber(out[k]);
    }
    const yv = +(row["Año"] ?? row["Ano"] ?? row["Anio"] ?? row["Year"]);
    const mvRaw = String(row["Mes"] ?? row["Month"] ?? "").trim().toLowerCase();
    let mv = MONTHS_ES.indexOf(mvRaw); if (mv < 0) mv = MONTH_ALIASES.get(mvRaw) ?? 0;
    out.fecha = new Date(yv, mv, 1);
    return out;
  }

  d3.dsv(";", DATA_URL, parseRow).then(async raw => {
    if (!raw?.length) return;

    // --- Preparar datos
    const timeKeys = new Set(["año","ano","anio","year","mes","month","fecha"]);
    const seriesKeys = Object.keys(raw[0]).filter(k => !timeKeys.has(k.trim().toLowerCase()));
    const data = raw.slice().sort((a,b) => a.fecha - b.fecha);
    const dates = data.map(d => d.fecha);
    const byDate = new Map(data.map(d => [+d.fecha, d]));
    const series = seriesKeys.map(key => ({
      key,
      valores: data.map(d => ({ fecha: d.fecha, valor: Number.isFinite(+d[key]) ? +d[key] : NaN }))
    }));

    const palette = d3.schemeTableau10.concat(d3.schemeSet2 || []);
    const color = d3.scaleOrdinal().domain(seriesKeys).range(palette.slice(0, seriesKeys.length));

    // Leyenda (toggle)
    let active = new Set(seriesKeys);
    let isDrawing = false;
    const legendItems = legend.selectAll(".legend-item")
      .data(seriesKeys, d=>d)
      .join(enter => {
        const it = enter.append("div")
          .attr("class","legend-item")
          .style("display","inline-flex").style("align-items","center")
          .style("gap","8px").style("white-space","nowrap")
          .style("cursor","pointer").style("transition","opacity .3s ease")
          .on("click", (_, key) => {
            if (isDrawing) return;
            if (active.has(key)) active.delete(key); else active.add(key);
            updateLinesOpacity();
          });
        it.append("span")
          .attr("class","swatch")
          .style("width","12px").style("height","12px")
          .style("border-radius","2px")
          .style("box-shadow","0 0 0 1px rgba(0,0,0,.1) inset")
          .style("background-color", d => color(d));
        it.append("span").text(d => d);
        return it;
      });

    function setLegendLocked(lock){
      legend.style("pointer-events", lock ? "none" : "auto")
            .style("opacity", lock ? 0.6 : 1);
    }
    function updateLinesOpacity(){
      svg.selectAll(".line-group path")
        .interrupt()
        .transition().duration(200)
        .style("opacity", d => active.has(d.key) ? 1 : 0.12);
      legendItems.style("opacity", d => active.has(d) ? 1 : 0.35);
    }

    // ---- Mouse move / tooltip (igual patrón)
    function onMove(event){
      const [mx] = d3.pointer(event);
      const x0 = x.invert(mx);
      const bisect = d3.bisector(d => d).left;
      let i = Math.max(1, Math.min(bisect(dates, x0, 1), dates.length - 1));
      const d0 = dates[i-1], d1 = dates[i];
      const selDate = (x0 - d0 > d1 - x0) ? d1 : d0;

      const row = byDate.get(+selDate);
      const xCoord = x(selDate);
      focus.select("line").attr("x1", xCoord).attr("x2", xCoord);

      const fmt = d3.format(",.2f");
      const header = `<div style="margin-bottom:6px;"><strong>${d3.timeFormat("%B %Y")(selDate)}</strong></div>`;
      const rows = seriesKeys
        .filter(k => active.has(k) && Number.isFinite(+row[k]))
        .map(k => ({ key:k, valor:+row[k] }))
        .sort((a,b) => b.valor - a.valor);

      const bodyHtml = rows.map(({key,valor}) => `
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="width:10px;height:10px;background:${color(key)};display:inline-block;border-radius:2px"></span>
          <span>${key}: <strong>${fmt(valor)}</strong></span>
        </div>
      `).join("");

      const [gmx, gmy] = d3.pointer(event, host.node());
      tooltip.html(header + bodyHtml);

      const cw = host.node().clientWidth, ch = host.node().clientHeight;
      const tw = tooltip.node().offsetWidth, th = tooltip.node().offsetHeight;
      let left = gmx + shift, top = gmy - 12;
      if (left + tw + pad > cw) left = gmx - tw - shift;
      left = clamp(left, pad, cw - tw - pad);
      top  = clamp(top,  pad, ch - th - pad);
      tooltip.style("left", `${left}px`).style("top", `${top}px`);
    }

    overlay
      .on("mouseover", () => { focus.style("display", null); tooltip.interrupt().style("opacity", .98); })
      .on("mouseout",  () => { focus.style("display", "none"); tooltip.transition().duration(120).style("opacity", 0); })
      .on("mousemove", onMove);

    // ====== SECUENCIA TIPO lineChartCategoria.js ======
    async function firstRender(){
      // 1) Espera fuentes/tamaño estable
      try { await document.fonts?.ready; } catch(_){}
      await waitForStableSize(svgHost.node(), { minStabilityMs: 220, timeoutMs: 3000 });

      // 2) Rango y dominios
      width = Math.max(200, getWidth());
      svgRoot.attr("viewBox", `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`);
      x.range([0, width]); overlay.attr("width", width);

      x.domain(d3.extent(dates));
      const ymax = d3.max(series, s => d3.max(s.valores, v => v.valor)) ?? 1;
      y.domain([0, (ymax > 0 ? ymax * 1.05 : 1)]).nice();

      // 3) Ejes → SOLO cuando ambos terminan se traza la línea (withAnimation=true)
      const tDur = 500;
      let axesDone = 0;
      const afterAxes = () => { if (++axesDone === 2) drawLines(true); };

      xAxisG.transition().duration(tDur)
        .call(d3.axisBottom(x).ticks(d3.timeYear.every(1)).tickFormat(d3.timeFormat("%Y")))
        .on("end", afterAxes);

      yAxisG.transition().duration(tDur)
        .call(d3.axisLeft(y).ticks(6).tickFormat(d3.format(",.0f")))
        .on("end", afterAxes);
    }

    // Dibujo de líneas (idéntico patrón de animación)
    function drawLines(withAnimation){
      const groups = svg.selectAll(".line-group")
        .data(series, d => d.key);

      groups.exit().transition().duration(200).style("opacity",0).remove();

      const gEnter = groups.enter().append("g")
        .attr("class","line-group")
        .style("opacity",0);

      gEnter.append("path")
        .attr("class","line")
        .attr("fill","none")
        .attr("stroke-width",2)
        .attr("stroke", d => color(d.key))
        .attr("d", d => line(d.valores));

      const gAll = gEnter.merge(groups);
      gEnter.transition().duration(250).style("opacity",1);

      if (withAnimation) { isDrawing = true; setLegendLocked(true); }
      let pending = withAnimation ? series.length : 0;

      gAll.select("path")
        .interrupt()
        .attr("stroke", d => color(d.key))
        .attr("d", d => line(d.valores))
        .each(function(){
          if (!withAnimation) return;
          let L = 0;
          try { L = this.getTotalLength(); } catch(_) { L = 0; }
          d3.select(this)
            .attr("stroke-dasharray", `${L} ${L}`)
            .attr("stroke-dashoffset", L)
            .transition().duration(1200).ease(d3.easeCubic)
            .attr("stroke-dashoffset", 0)
            .on("end", () => {
              if (withAnimation && --pending === 0) {
                isDrawing = false; setLegendLocked(false); updateLinesOpacity();
              }
            });
        });

      if (!withAnimation){ isDrawing = false; setLegendLocked(false); updateLinesOpacity(); }
      focus.raise();
    }

    // Primer render EXACTO a la otra implementación
    firstRender();

    // ---- Resize (sin animación de trazo, igual que en el otro chart)
    const onResize = () => {
      width = Math.max(200, getWidth());
      svgRoot.attr("viewBox", `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`);
      x.range([0, width]); overlay.attr("width", width);

      x.domain(d3.extent(dates));
      const ymax2 = d3.max(series, s => d3.max(s.valores, v => v.valor)) ?? 1;
      y.domain([0, (ymax2 > 0 ? ymax2 * 1.05 : 1)]).nice();

      const t = 350; let done = 0; const after = () => { if (++done === 2) drawLines(false); };
      xAxisG.transition().duration(t)
        .call(d3.axisBottom(x).ticks(d3.timeYear.every(1)).tickFormat(d3.timeFormat("%Y")))
        .on("end", after);
      yAxisG.transition().duration(t)
        .call(d3.axisLeft(y).ticks(6).tickFormat(d3.format(",.0f")))
        .on("end", after);
    };

    const ro = new ResizeObserver(onResize);
    ro.observe(svgHost.node());
    window.addEventListener("resize", onResize, { passive:true });

    // Estado inicial de la leyenda
    legend.selectAll(".legend-item").style("opacity", 1);
  });
})();

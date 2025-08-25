// js/charts/lineChartCategoria.js
// Requiere D3 v7+

document.addEventListener("DOMContentLoaded", () => {
  const margin = { top: 60, right: 30, bottom: 50, left: 70 };

  const host    = d3.select("#linechart-categoria");      // card body
  const svgHost = d3.select("#linechart-categoria-svg");  // contenedor del SVG (100%)

  const getWidth = () =>
    (svgHost.node()?.clientWidth || host.node()?.clientWidth || 900) - margin.left - margin.right;

  let width  = getWidth();
  const height = 400 - margin.top - margin.bottom;

  // --- SVG responsivo ---
  const svgRoot = svgHost
    .append("svg")
    .attr("viewBox", `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
    .attr("preserveAspectRatio", "xMidYMid meet")
    .style("width", "100%")
    .style("height", "auto");

  const svg = svgRoot.append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const niveles = ["Extreme", "Very High", "High", "Medium", "Low", "Very Low", "None"];

  const color = d3.scaleOrdinal()
    .domain(niveles)
    .range(["#c6dbef", "#6baed6", "#b2e2b2", "#238b45", "#fcbba1", "#cb181d", "#fdd0a2"]);

  // Contenedor (para tooltip relativo)
  const container = host.style("position","relative");

  // Tooltip con flip + clamp
  const tooltip = container.append("div")
    .attr("class", "chart-tooltip")
    .style("position","absolute")
    .style("pointer-events","none")
    .style("opacity", 0);
  const pad = 8, shift = 14;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  // Escalas y ejes
  const x = d3.scaleTime().range([0, width]);
  const y = d3.scaleLinear().range([height, 0]);
  const xAxis = svg.append("g").attr("transform", `translate(0,${height})`);
  const yAxis = svg.append("g");

  // Generador de línea: ignora puntos inválidos (NaN/undefined)
  const line = d3.line()
    .defined(d => Number.isFinite(d.valor))
    .x(d => x(d.fecha))
    .y(d => y(d.valor));

  // Focus line
  const focus = svg.append("g").attr("class", "focus").style("display","none");
  focus.append("line")
    .attr("class","focus-line")
    .attr("stroke","#888")
    .attr("stroke-width",1)
    .attr("y1",0)
    .attr("y2",height);

  // --- Utilidad: esperar a que el contenedor esté "estable" (sin cambios de ancho)
  function waitForStableSize(el, { minStabilityMs = 200, timeoutMs = 2500 } = {}) {
    return new Promise(resolve => {
      let last = el.clientWidth;
      let lastChange = performance.now();
      const start = performance.now();

      const ro = new ResizeObserver(() => {
        const w = el.clientWidth;
        if (w !== last) {
          last = w;
          lastChange = performance.now();
        }
      });
      ro.observe(el);

      (function check() {
        const now = performance.now();
        if ((now - lastChange >= minStabilityMs && last > 0) || (now - start >= timeoutMs)) {
          ro.disconnect();
          resolve();
        } else {
          requestAnimationFrame(check);
        }
      })();
    });
  }

  d3.dsv(";", "data/heartbeat.csv", d3.autoType).then(async data => {
    let active = new Set(niveles);
    let isDrawing = false;
    let legendDiv = null;

    const categorias = Array.from(new Set(data.map(d => d.Categorías)));
    const mesesOrdenados = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

    // preparar fechas
    data.forEach(d => {
      const mesIndex = mesesOrdenados.indexOf(String(d.Mes).trim());
      d.fecha = new Date(d.Año, mesIndex, 1);
    });

    // selector
    const selCat = d3.select("#linechart-selector")
      .append("select")
      .attr("id","categoriaSelector")
      .on("change", () => updateChart(true));

    selCat.selectAll("option")
      .data(categorias)
      .enter().append("option")
      .text(d => d);

    // Leyenda (antes de primer trazo, porque puede cambiar layout)
    legendDiv = d3.select("#linechart-selector")
      .append("div")
      .attr("id","lc-legend")
      .style("display","flex")
      .style("flex-wrap","wrap")
      .style("gap","10px 18px")
      .style("justify-content","center")
      .style("align-items","center")
      .style("margin","8px 0");

    const legendItems = legendDiv.selectAll(".legend-item")
      .data(niveles, d=>d)
      .join(enter => {
        const it = enter.append("div")
          .attr("class","legend-item")
          .style("display","inline-flex")
          .style("align-items","center")
          .style("gap","8px")
          .style("cursor","pointer")
          .on("click", (ev, key) => {
            if (isDrawing) return;
            if (active.has(key)) active.delete(key); else active.add(key);
            updateLinesOpacity();
          });
        it.append("span")
          .style("width","12px").style("height","12px")
          .style("border-radius","2px")
          .style("box-shadow","0 0 0 1px rgba(0,0,0,.1) inset")
          .style("background-color", d => color(d));
        it.append("span").text(d => d);
        return it;
      });
    legendItems.style("opacity", d => active.has(d) ? 1 : 0.35);

    function updateLinesOpacity() {
      svg.selectAll(".line-group path")
        .interrupt()
        .transition().duration(200)
        .style("opacity", d => active.has(d.nivel) ? 1 : 0.12);

      legendDiv.selectAll(".legend-item")
        .style("opacity", d => active.has(d) ? 1 : 0.35);
    }

    function setLegendLocked(locked) {
      legendDiv.style("pointer-events", locked ? "none" : "auto")
               .style("opacity", locked ? 0.6 : 1);
    }

    // mousemove (tooltip + focus)
    function mousemove(event) {
      const categoria = d3.select("#categoriaSelector").property("value");
      const dataFiltrada = data
        .filter(d => d.Categorías === categoria)
        .sort((a,b) => a.fecha - b.fecha);

      const bisectDate = d3.bisector(d => d.fecha).left;
      const x0 = x.invert(d3.pointer(event)[0]);
      let i = bisectDate(dataFiltrada, x0, 1);
      i = Math.max(1, Math.min(i, dataFiltrada.length - 1));
      const d0 = dataFiltrada[i - 1];
      const d1 = dataFiltrada[i];
      const d = x0 - d0.fecha > d1.fecha - x0 ? d1 : d0;

      const xCoord = x(d.fecha);
      focus.select(".focus-line").attr("x1", xCoord).attr("x2", xCoord);

      const fmt = d3.format(",.0f");
      const header = `
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
          <strong>${d.Mes} ${d.Año}</strong>
        </div>`;

      const rowsData = niveles
        .filter(n => active.has(n) && Number.isFinite(+d[n]))
        .map(n => ({ nivel: n, valor: +d[n] }))
        .sort((a, b) => b.valor - a.valor);

      const rows = rowsData.map(({ nivel, valor }) => `
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="width:10px;height:10px;background:${color(nivel)};display:inline-block;border-radius:2px"></span>
          <span>${nivel}: <strong>${fmt(valor)}</strong></span>
        </div>
      `).join("");

      const [mx, my] = d3.pointer(event, container.node());
      tooltip.interrupt().html(header + rows);

      const cw = container.node().clientWidth;
      const ch = container.node().clientHeight;
      const tw = tooltip.node().offsetWidth;
      const th = tooltip.node().offsetHeight;

      let left = mx + shift;
      let top  = my - 10;

      if (left + tw + pad > cw) left = mx - tw - shift;
      left = clamp(left, pad, cw - tw - pad);
      top  = clamp(top,  pad, ch - th - pad);

      tooltip.style("left", `${left}px`).style("top", `${top}px`);
    }

    // Overlay de interacción (al fondo)
    const overlay = svg.append("rect")
      .attr("width", width)
      .attr("height", height)
      .style("fill","none")
      .style("pointer-events","all")
      .on("mouseover", () => { focus.style("display", null); tooltip.interrupt().style("opacity", .98); })
      .on("mouseout",  () => { focus.style("display", "none"); tooltip.transition().duration(120).style("opacity", 0); })
      .on("mousemove", mousemove);
    overlay.lower();

    // ===== Dibujar/actualizar líneas (se llama SOLO cuando los ejes terminaron) =====
    function drawLines(series, withAnimation) {
      const grupos = svg.selectAll(".line-group")
        .data(series, d => d.nivel);

      grupos.exit().transition().duration(200).style("opacity",0).remove();

      const gruposEnter = grupos.enter()
        .append("g")
        .attr("class","line-group")
        .style("opacity",0);

      gruposEnter.append("path")
        .attr("class","line")
        .attr("fill","none")
        .attr("stroke-width", 2)
        .attr("stroke", d => color(d.nivel))
        .attr("d", d => line(d.valores));

      const gruposAll = gruposEnter.merge(grupos);
      gruposEnter.transition().duration(250).style("opacity",1);

      if (withAnimation) {
        isDrawing = true;
        setLegendLocked(true);
      }

      let pending = withAnimation ? series.length : 0;

      gruposAll.select("path")
        .interrupt()
        .attr("stroke", d => color(d.nivel))
        .attr("d", d => line(d.valores))
        .each(function() {
          if (!withAnimation) return;
          const L = this.getTotalLength();
          d3.select(this)
            .attr("stroke-dasharray", `${L} ${L}`)
            .attr("stroke-dashoffset", L)
            .transition().duration(1200).ease(d3.easeCubic)
            .attr("stroke-dashoffset", 0)
            .on("end", () => {
              pending -= 1;
              if (pending === 0) {
                isDrawing = false;
                setLegendLocked(false);
                updateLinesOpacity();
              }
            });
        });

      if (!withAnimation) {
        isDrawing = false;
        setLegendLocked(false);
        updateLinesOpacity();
      }

      focus.raise();
    }

    // ===== Actualiza escalas + ejes, y SOLO luego traza líneas =====
    function updateChart(withAnimation = true) {
      // medir SIEMPRE antes de todo
      width = getWidth();
      svgRoot.attr("viewBox",
        `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`);
      x.range([0, width]);
      overlay.attr("width", width);

      const categoria = d3.select("#categoriaSelector").property("value");
      const dataFiltrada = data
        .filter(d => d.Categorías === categoria)
        .sort((a,b) => a.fecha - b.fecha);

      const series = niveles.map(nivel => ({
        nivel,
        valores: dataFiltrada.map(d => {
          const raw = d[nivel];
          const val = (raw === null || raw === undefined || raw === '') ? NaN : +raw;
          return { fecha: d.fecha, valor: val };
        })
      }));

      x.domain(d3.extent(dataFiltrada, d => d.fecha));

      const ymax = d3.max(
        series,
        s => d3.max(s.valores.filter(p => Number.isFinite(p.valor)), d => d.valor)
      ) ?? 0;
      y.domain([0, ymax > 0 ? ymax : 1]);

      // transiciones de ejes (coordinadas)
      const tDur = 500;
      let axesDone = 0;
      const afterAxes = () => {
        axesDone += 1;
        if (axesDone === 2) {
          // ejes listos => trazar líneas
          drawLines(series, withAnimation);
        }
      };

      xAxis.transition().duration(tDur)
        .call(d3.axisBottom(x).ticks(d3.timeYear.every(1)).tickFormat(d3.timeFormat("%Y")))
        .on("end", afterAxes);

      yAxis.transition().duration(tDur)
        .call(d3.axisLeft(y).ticks(6).tickFormat(d3.format(",.0f")))
        .on("end", afterAxes);
    }

    // 🔹 Esperar a que el layout esté listo antes del PRIMER trazo
    try { await document.fonts?.ready; } catch(_) {}
    await waitForStableSize(svgHost.node(), { minStabilityMs: 220, timeoutMs: 3000 });
    updateChart(true);   // primer trazo ya con medidas y ejes estables

    // Relayouts posteriores
    const ro = new ResizeObserver(() => {
      width = getWidth();
      svgRoot.attr("viewBox",
        `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`);
      x.range([0, width]);
      overlay.attr("width", width);
      // ejes → al terminar, se re-trazan líneas (sin animación)
      updateChart(false);
    });
    ro.observe(svgHost.node());

    window.addEventListener("resize", () => {
      width = getWidth();
      svgRoot.attr("viewBox",
        `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`);
      x.range([0, width]);
      overlay.attr("width", width);
      updateChart(false);
    }, { passive: true });
  });
});

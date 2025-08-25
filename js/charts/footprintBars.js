// js/charts/footprintBars.js
// Requiere D3 v7+

(function () {
  const CSV_PATH = "data/footprint.csv";
  const SEP = ";";

  const CATS = [
    { key: "CAT B1", label: "Presencia Pasiva (B1)", color: "#6a1b9a" },
    { key: "CAT B2", label: "Presencia Activa (B2)", color: "#2a9bd6" },
    { key: "CAT C",  label: "Tiendas en línea (C)",  color: "#d81b60" },
    { key: "CAT D",  label: "Servicios en línea (D)", color: "#be2da1" },
    { key: "CAT E",  label: "Servicios TIC",          color: "#244c9a" },
  ];

  // Estado
  let active = new Set(CATS.map(c => c.key)); // series visibles
  let domainMode = "full"; // "full" = todas en eje X; "active" = solo activas
  let isAnimating = false; // evita doble clic durante la reducción/crecimiento

  // Layout
  const host = d3.select("#footprint");
  if (host.empty()) return;
  host.selectAll("*").remove();

  const margin = { top: 30, right: 20, bottom: 60, left: 80 };
  let   width  = host.node().clientWidth || 720;   // ← let (se re-mide)
  const height = 420;

  const wrap = host.append("div")
    .attr("id", "footprint-bars")
    .style("position", "relative");

  // Leyenda HTML centrada
  const legendDiv = wrap.append("div")
    .attr("id","fp-legend")
    .style("display","flex")
    .style("flex-wrap","wrap")
    .style("gap","10px 18px")
    .style("justify-content","center")
    .style("align-items","center")
    .style("margin","8px 0");

  const svg = wrap.append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("preserveAspectRatio", "xMidYMid meet")
    .style("width", "100%")
    .style("height", "auto");

  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
  let   innerW = width  - margin.left - margin.right; // ← let (se re-mide)
  const innerH = height - margin.top  - margin.bottom;

  // Tooltip estándar con clamp
  const tooltip = wrap.append("div")
    .attr("class", "chart-tooltip")
    .style("position","absolute")
    .style("pointer-events","none")
    .style("opacity", 0);

  // Escalas y ejes
  const x = d3.scaleBand().range([0, innerW]).padding(0.25);
  const y = d3.scaleLinear().range([innerH, 0]).nice();

  // Comienza con todas las categorías en X
  x.domain(CATS.map(c => c.label));

  const xAxisG = g.append("g")
    .attr("transform", `translate(0,${innerH})`)
    .call(d3.axisBottom(x).tickSizeOuter(0));

  const yAxisG = g.append("g");

  const barsG   = g.append("g");
  const labelsG = g.append("g");

  const fmt = d3.format(".1f");
  const norm = s => String(s || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .trim().toLowerCase();

  // ======= Utilidades de re-layout / primer render estable =======
  function relayout(){
    width  = host.node().clientWidth || 720;
    innerW = width - margin.left - margin.right;
    svg.attr("viewBox", `0 0 ${width} ${height}`);
    x.range([0, innerW]);
  }

  function waitForStableSize(el, { minStabilityMs=220, timeoutMs=3000 } = {}){
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

  // ------- Datos -------
  d3.dsv(SEP, CSV_PATH, d3.autoType).then(async raw => {
    if (!raw || !raw.length) return;

    const sample   = raw[0];
    const yearKey  = ["Año","Ano","Year"].find(k => k in sample)  || "Año";
    const monthKey = ["Mes","Month"].find(k => k in sample)        || "Mes";

    const toNumber = x => (x == null || x === "") ? 0 : +String(x).replace(/\./g,"").replace(",",".");

    const pickVal = (row, catKey, fallbackLabel) =>
      toNumber(row[catKey] ?? row[fallbackLabel] ?? 0);

    const data = raw.map(d => ({
      year:  +d[yearKey],
      month: String(d[monthKey]).trim(),
      ...Object.fromEntries(CATS.map(c => [c.key, pickVal(d, c.key, c.label)]))
    }));

    const years = Array.from(new Set(data.map(d => d.year))).filter(Number.isFinite).sort((a,b)=>a-b);
    const monthsByYear = new Map(years.map(y => [y, Array.from(new Set(data.filter(d=>d.year===y).map(d=>d.month)))]));
    let currentYear, currentMonth;

    const rowFor = (yval, mval) =>
      data.find(d => d.year === +yval && norm(d.month) === norm(mval)) || null;

    function seriesFor(row, useActiveDomain){
      const cats = useActiveDomain ? CATS.filter(c => active.has(c.key)) : CATS;
      return cats.map(cat => {
        const rawVal = row ? (Number.isFinite(row[cat.key]) ? row[cat.key] : 0) : 0;
        const value  = active.has(cat.key) ? rawVal : 0;
        return { key: cat.key, label: cat.label, color: cat.color, value, rawVal };
      });
    }

    function update(yval, mval, opts={quick:false}){
      // 🔸 Re-medición ANTES de usar escalas
      relayout();

      const row = rowFor(yval, mval);

      // Dominio X según modo
      const useActiveDomain = (domainMode === "active");
      const ser = seriesFor(row, useActiveDomain);

      x.domain((useActiveDomain ? CATS.filter(c => active.has(c.key)) : CATS).map(c => c.label));
      xAxisG.transition().duration(opts.quick ? 250 : 500).call(d3.axisBottom(x).tickSizeOuter(0));

      const maxVal = d3.max(ser.filter(s => active.has(s.key)), d => d.value) || 0;
      y.domain([0, maxVal ? maxVal * 1.15 : 1]).nice();
      yAxisG.transition().duration(opts.quick ? 250 : 500).call(d3.axisLeft(y));

      // BARRAS (key fijo)
      const bars = barsG.selectAll("rect.fp-bar").data(ser, d => d.key);

      const enter = bars.enter().append("rect")
        .attr("class","fp-bar")
        .attr("x", d => x(d.label))
        .attr("width", () => x.bandwidth())
        .attr("y", y(0))
        .attr("height", 0)
        .attr("fill", d => d.color);

      enter.merge(bars)
        .transition().duration(opts.quick ? 350 : 650).ease(d3.easeCubic)
        .attr("x", d => x(d.label))
        .attr("width", () => x.bandwidth())
        .attr("y", d => y(d.value))
        .attr("height", d => innerH - y(d.value));

      bars.exit().remove();

      // LABELS
      const labels = labelsG.selectAll("text.fp-label").data(ser, d => d.key);

      const lEnter = labels.enter().append("text")
        .attr("class","fp-label")
        .attr("text-anchor","middle")
        .attr("font-size","12px")
        .attr("fill","#111")
        .attr("x", d => x(d.label) + x.bandwidth()/2)
        .attr("y", y(0)-6)
        .text(d => fmt(d.value));

      lEnter.merge(labels)
        .transition().duration(opts.quick ? 350 : 650).ease(d3.easeCubic)
        .attr("x", d => x(d.label) + x.bandwidth()/2)
        .attr("y", d => y(d.value)-6)
        .style("opacity", d => d.value > 0 ? 1 : 0)
        .tween("text", function(d){
          const start = parseFloat(this.textContent.replace(",", ".")) || 0;
          const i = d3.interpolateNumber(start, d.value);
          return t => (this.textContent = fmt(i(t)));
        });

      labels.exit().remove();

      // Tooltip (flip básico, como antes)
      barsG.selectAll("rect.fp-bar")
        .on("mousemove", (event, d) => {
          const [mx, my] = d3.pointer(event, wrap.node());
          tooltip
            .interrupt()
            .style("opacity", .98)
            .html(`
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                <span style="width:10px;height:10px;background:${d.color};display:inline-block;border-radius:2px"></span>
                <strong>${d.label}</strong>
              </div>
              
              <div>Footprint: <strong>${fmt(d.value)}</strong></div>
            `);

          const wrapBox = wrap.node().getBoundingClientRect();
          const tipBox  = tooltip.node().getBoundingClientRect();
          let left = mx + 14, top = my + 14;
          if (left + tipBox.width > wrapBox.width)  left = mx - tipBox.width - 14;
          if (top  + tipBox.height > wrapBox.height) top  = my - tipBox.height - 14;
          tooltip.style("left", left + "px").style("top", top + "px");
        })
        .on("mouseleave", () => tooltip.transition().duration(120).style("opacity", 0));
    }

    // Leyenda interactiva con “shrink → reflow” (igual que antes)
    function renderLegend(){
      legendDiv.selectAll(".legend-item")
        .data(CATS, d => d.key)
        .join(enter => {
          const it = enter.append("div")
            .attr("class","legend-item")
            .style("display","inline-flex")
            .style("align-items","center")
            .style("gap","8px")
            .style("cursor","pointer")
            .on("click", (ev, cat) => {
              if (isAnimating) return;

              const isOn = active.has(cat.key);
              // feedback visual inmediato
              d3.select(ev.currentTarget).style("opacity", isOn ? 0.35 : 1);

              if (isOn) {
                // 1) Reducir a cero dentro del dominio actual
                isAnimating = true;
                const rect  = barsG.selectAll("rect.fp-bar").filter(d => d.key === cat.key);
                const label = labelsG.selectAll("text.fp-label").filter(d => d.key === cat.key);

                rect.transition().duration(350).ease(d3.easeCubic)
                  .attr("y", y(0))
                  .attr("height", innerH - y(0))
                  .on("end", () => {
                    // 2) Cuando ya llegó a 0, sacar del eje y reflow
                    active.delete(cat.key);
                    domainMode = "active"; // eje X solo con activas
                    isAnimating = false;
                    update(currentYear, currentMonth, {quick:true});
                  });

                label.transition().duration(200).style("opacity", 0);
              } else {
                // Re-activar: agregar, eje X con activas y crecer desde 0
                active.add(cat.key);
                domainMode = "active";
                update(currentYear, currentMonth, {quick:true});
              }
            });

          it.append("span")
            .style("width","12px").style("height","12px")
            .style("border-radius","2px")
            .style("box-shadow","0 0 0 1px rgba(0,0,0,.1) inset")
            .style("background-color", d => d.color);

          it.append("span").text(d => d.label);
          return it;
        })
        .style("opacity", d => active.has(d.key) ? 1 : 0.35);
    }
    renderLegend();

    // Filtro global
    window.FilterBus?.subscribe(({ year, month }) => {
      if (year == null || !month) return;
      currentYear  = year;
      currentMonth = month;
      update(currentYear, currentMonth, {quick:false});
    });

    // ===== Primer render ESTABLE =====
    try { await document.fonts?.ready; } catch(_) {}
    await waitForStableSize(host.node(), { minStabilityMs: 220, timeoutMs: 3000 });

    // Primer render (si aún no llega filtro global)
    if (currentYear == null || !currentMonth) {
      const y0 = years[0];
      const m0 = (monthsByYear.get(y0) || [])[0];
      if (y0 != null && m0) {
        currentYear  = y0;
        currentMonth = m0;
      }
    }
    if (currentYear != null && currentMonth) {
      update(currentYear, currentMonth, {quick:false});
    }

    // ===== Re-layout continuo (ResizeObserver + fallback) =====
    const ro = new ResizeObserver(() => {
      if (currentYear != null && currentMonth) {
        update(currentYear, currentMonth, { quick: true });
      } else {
        relayout();
        xAxisG.call(d3.axisBottom(x).tickSizeOuter(0));
        yAxisG.call(d3.axisLeft(y));
      }
    });
    ro.observe(host.node());

    window.addEventListener("resize", () => {
      if (currentYear != null && currentMonth) {
        update(currentYear, currentMonth, { quick: true });
      } else {
        relayout();
        xAxisG.call(d3.axisBottom(x).tickSizeOuter(0));
        yAxisG.call(d3.axisLeft(y));
      }
    }, { passive: true });
  });
})();

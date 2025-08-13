// js/charts/footprintBars.js
(function(){
  const CSV_PATH = "data/footprint.csv";   // ajusta si tu ruta es otra
  const SEP = ";";

  // Orden y nombres (B1, B2, C, D, E)
  const CATS = [
    { key: "CAT B1", label: "B1", color: "#6a1b9a" }, // Passive presence
    { key: "CAT B2", label: "B2", color: "#2a9bd6" }, // Active presence
    { key: "CAT C",  label: "C",  color: "#d81b60" }, // E-commerce platform
    { key: "CAT D",  label: "D",  color: "#cfd3d8" }, // Online services
    { key: "CAT E",  label: "E",  color: "#244c9a" }, // Internet-related ICT services
  ];

  const margin = { top: 30, right: 20, bottom: 60, left: 80 };
  const width  = 720;
  const height = 420;

  // Contenedor raíz (tu HTML ya tiene <div id="footprint"><h2>...</h2></div>)
  const host = d3.select("#footprint");
  if (host.empty()) return;

  // Limpia elementos dinámicos
  host.selectAll("#footprint-controls, #footprint-bars, #footprint-legend, .tooltip").remove();

  // Controles (creados por JS)
  const controls = host.append("div")
    .attr("id", "footprint-controls")
    .style("display","flex")
    .style("gap","12px")
    .style("justify-content","center")
    .style("align-items","center")
    .style("margin-bottom","12px");

  controls.append("label").attr("for","fp-year").text("Año:");
  const yearSel = controls.append("select").attr("id","fp-year");

  controls.append("label").attr("for","fp-month").text("Mes:");
  const monthSel = controls.append("select").attr("id","fp-month");

  // Área de gráfico
  const wrap = host.append("div").attr("id","footprint-bars").style("position","relative");
  const svg = wrap.append("svg").attr("width", width).attr("height", height);
  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  const innerW = width  - margin.left - margin.right;
  const innerH = height - margin.top  - margin.bottom;

  // Tooltip
  const tooltip = host.append("div").attr("class","tooltip");

  // Escalas y ejes
  const x = d3.scaleBand().domain(CATS.map(c => c.label)).range([0, innerW]).padding(0.25);
  const yScale = d3.scaleLinear().range([innerH, 0]).nice();

  g.append("g").attr("transform", `translate(0,${innerH})`).call(d3.axisBottom(x).tickSizeOuter(0));
  const yAxisG = g.append("g");
  yAxisG.append("text")
    .attr("x", 0).attr("y", -12)
    .attr("fill", "#333").attr("font-weight", "600")
    .attr("text-anchor","start")
    .text("Footprint promedio");

  const barsG   = g.append("g");
  const labelsG = g.append("g");

  const fmt = d3.format(".1f");
  const norm = s => String(s || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .trim().toLowerCase();

  // === LEYENDA ===============================================================
  const legend = host.append("div")
    .attr("id","footprint-legend")
    .style("display","flex")
    .style("gap","14px")
    .style("justify-content","center")
    .style("align-items","center")
    .style("margin","6px 0 12px");

  legend.selectAll("div")
    .data(CATS)
    .join("div")
    .style("display","flex")
    .style("align-items","center")
    .html(d => `
      <span style="display:inline-block;width:12px;height:12px;margin-right:6px;border-radius:2px;background:${d.color}"></span>
      <span style="font:12px system-ui,sans-serif">${d.label}</span>
    `);

  // === CARGA DE DATOS ========================================================
  d3.dsv(SEP, CSV_PATH, d3.autoType).then(raw => {
    // Normaliza números con coma decimal
    const data = raw.map(d => {
      const row = { ...d };
      for (const c of CATS) {
        const v = String(d[c.key]).replace(/\./g,"").replace(",",".");
        row[c.key] = +v;
      }
      return row;
    });

    // Años y meses
    const years = Array.from(new Set(data.map(d => d["Año"]))).sort(d3.ascending);
    yearSel.selectAll("option").data(years).join("option")
      .attr("value", d => d).text(d => d);
    yearSel.property("value", years[0]);

    function monthsForYear(year){
      return Array.from(new Set(data.filter(d => d["Año"] === +year).map(d => d["Mes"])));
    }
    function setMonths(year){
      const months = monthsForYear(year);
      monthSel.selectAll("option").data(months).join("option")
        .attr("value", d => d).text(d => d);
      monthSel.property("value", months[0] || "");
    }
    setMonths(years[0]);

    function rowFor(year, month){
      return data.find(d => d["Año"] === +year && norm(d["Mes"]) === norm(month)) || null;
    }

    function update(year, month){
      const row = rowFor(year, month);
      const series = CATS.map(cat => ({
        ...cat,
        value: row && Number.isFinite(row[cat.key]) ? row[cat.key] : 0
      }));

      // Escala Y dinámica
      const maxVal = d3.max(series, d => d.value) || 0;
      yScale.domain([0, maxVal ? maxVal * 1.15 : 1]).nice();
      yAxisG.transition().duration(600).call(d3.axisLeft(yScale));

      // Barras
      const bars = barsG.selectAll("rect").data(series, d => d.key);

      bars.enter().append("rect")
          .attr("x", d => x(d.label))
          .attr("width", x.bandwidth())
          .attr("y", yScale(0))
          .attr("height", innerH - yScale(0))
          .attr("fill", d => d.color)
        .merge(bars)
          .transition().duration(700).ease(d3.easeCubic)
          .attr("x", d => x(d.label))
          .attr("width", x.bandwidth())
          .attr("y", d => yScale(d.value))
          .attr("height", d => innerH - yScale(d.value));

      bars.exit().remove();

      // Labels de valor (normales, NO rotados)
      const labels = labelsG.selectAll("text").data(series, d => d.key);

      labels.enter().append("text")
          .attr("text-anchor","middle")
          .attr("font-size","12px")
          .attr("fill","#111")
          .attr("x", d => x(d.label) + x.bandwidth()/2)
          .attr("y", yScale(0) - 6)
          .text(d => fmt(d.value))
        .merge(labels)
          .transition().duration(700).ease(d3.easeCubic)
          .attr("x", d => x(d.label) + x.bandwidth()/2)
          .attrTween("y", function(d){
            const start = +this.getAttribute("data-y") || (yScale(0) - 6);
            const it = d3.interpolateNumber(start, yScale(d.value) - 6);
            return t => {
              const ty = it(t);
              this.setAttribute("data-y", ty);
              return ty;
            };
          })
          .tween("text", function(d){
            const start = parseFloat(this.textContent.replace(",", ".")) || 0;
            const i = d3.interpolateNumber(start, d.value);
            return t => this.textContent = fmt(i(t));
          });

      labels.exit().remove();

      // Tooltip
      barsG.selectAll("rect")
        .on("mousemove", (event, d) => {
          const [px, py] = d3.pointer(event, host.node());
          tooltip
            .style("left", (px + 14) + "px")
            .style("top",  (py + 14) + "px")
            .style("opacity", 1)
            .html(`
              <div style="font-weight:600;margin-bottom:2px;">Categoría ${d.label}</div>
              <div>Año: <b>${year}</b> &nbsp; Mes: <b>${month}</b></div>
              <div>Footprint: <b>${fmt(d.value)}</b></div>
            `);
        })
        .on("mouseleave", () => tooltip.style("opacity", 0));
    }

    // Render inicial y eventos
    update(yearSel.property("value"), monthSel.property("value"));
    yearSel.on("change", function(){
      setMonths(this.value);
      update(this.value, monthSel.property("value"));
    });
    monthSel.on("change", function(){
      update(yearSel.property("value"), this.value);
    });
  });
})();

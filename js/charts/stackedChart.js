document.addEventListener("DOMContentLoaded", () => {
  const margin = { top: 40, right: 30, bottom: 60, left: 120 };
  const width = (d3.select("#stacked-chart").node().clientWidth || 900) - margin.left - margin.right;

  const height = 400 - margin.top - margin.bottom;

  const svgRoot = d3.select("#stacked-chart")
    .append("svg")
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
  const tooltip = d3.select("#stacked-chart")
    .append("div")
    .attr("class", "tooltip")
    .style("position", "absolute")
    .style("pointer-events", "none")
    .style("display", "none")
    .style("padding", "6px 8px")
    .style("background", "rgba(0,0,0,.75)")
    .style("color", "#fff")
    .style("border-radius", "4px")
    .style("font", "12px/1.2 system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif");

  // ===== Datos =====
  d3.dsv(";", "data/heartbeat.csv", d => {
    d = d3.autoType(d);
    d.Mes = String(d.Mes).trim();   // 🔴 crítico para que coincida con el filtro global
    return d;
  }).then(data => {
    const selectorWrap = d3.select("#stacked-selector");

    const ordenMeses = [
      "Enero","Febrero","Marzo","Abril","Mayo","Junio",
      "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"
    ];
    const meses = Array.from(new Set(data.map(d => d.Mes)))
      .sort((a, b) => ordenMeses.indexOf(a) - ordenMeses.indexOf(b));
    const anios = Array.from(new Set(data.map(d => d.Año))).sort();

    // ===== Filtros =====
    const selMes = selectorWrap.append("select")
      .attr("id", "selMes")
      .style("margin-right", "10px")
      .on("change", () => updateChart(true));
    selMes.selectAll("option").data(meses).enter().append("option").text(d => d);

    const selAnio = selectorWrap.append("select")
      .attr("id", "selAnio")
      .on("change", () => updateChart(true));
    selAnio.selectAll("option").data(anios).enter().append("option").text(d => d);

    // === Sincronizar con filtro global ===
    FilterBus?.subscribe(({year, month}) => {
      if (year == null || !month) return;
      selAnio.property("value", year);
      selMes.property("value", month);
      updateChart(true);
    });

    // Ocultar selectores locales
    d3.select("#selMes").style("display","none");
    d3.select("#selAnio").style("display","none");


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
        .on("click", function (event, key) {
          // alternar estado
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
      legendItems
        .style("opacity", d => active.has(d) ? 1 : 0.35); // sin tachado
    }

    // ===== Escalas y ejes =====
    const x = d3.scaleLinear().range([0, width]);
    const y = d3.scaleBand().range([0, height]).padding(0.2);

    svg.append("g").attr("class", "x-axis").attr("transform", `translate(0,${height})`);
    svg.append("g").attr("class", "y-axis");

    // Inicialización filtros
    const primerAnio = anios[0];
    const mesesDePrimerAnio = meses.filter(m => data.some(d => d.Año === primerAnio && d.Mes === m));
    const primerMes = mesesDePrimerAnio[0];
    d3.select("#selAnio").property("value", primerAnio);
    d3.select("#selMes").property("value", primerMes);

    updateLegendStyles();
    updateChart();

    function updateChart(withEase=false) {
      const mes  = d3.select("#selMes").property("value");
      const anio = +d3.select("#selAnio").property("value");
      const datosFiltrados = data.filter(d => d.Mes === mes && d.Año === anio);

      // Agrupar por categoría
      const datosPorCategoria = d3.group(datosFiltrados, d => d.Categorías);

      // 1) Calcular total SOLO de series activas (para re-normalizar)
      // 2) Para series inactivas -> valor 0
      const datosTransformados = Array.from(datosPorCategoria, ([categoria, valores]) => {
        const obj = { Categoria: categoria };
        const totalActivo = d3.sum(valores, d => d3.sum(niveles, k => active.has(k) ? d[k] : 0));

        niveles.forEach(nivel => {
          const sumaNivel = d3.sum(valores, d => d[nivel]);
          obj[nivel] = active.has(nivel)
            ? (totalActivo ? (sumaNivel * 100 / totalActivo) : 0)
            : 0; // inactivos a 0
        });
        return obj;
      });

      // Stack SIEMPRE con el ORDEN COMPLETO de 'niveles' (posición/color fijos)
      const series = d3.stack().keys(niveles)(datosTransformados);

      x.domain([0, 100]);
      y.domain(datosTransformados.map(d => d.Categoria));

      const t = svg.transition().duration(withEase ? 450 : 250);

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
        .attr("fill", d => color(d.key)); // color inmutable por clave

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
          if (!active.has(d.key)) return; // si está apagada, sin tooltip
          tooltip.style("display", "block")
            .html(`<strong>${d.key}</strong><br>${d.data.Categoria}: ${d3.format(".1f")(d.data[d.key])}%`);
        })
        .on("mousemove", (event) => {
          const container = document.querySelector("#stacked-chart").getBoundingClientRect();
          tooltip
            .style("left", (event.clientX - container.left + 10) + "px")
            .style("top", (event.clientY - container.top - 28) + "px");
        })
        .on("mouseleave", () => tooltip.style("display", "none"))
        .transition(t)
        .attr("width", d => x(d[1]) - x(d[0]));

      rects.transition(t)
        .attr("x", d => x(d[0]))
        .attr("width", d => x(d[1]) - x(d[0]))
        .attr("y", d => y(d.data.Categoria))
        .attr("height", y.bandwidth());

      rects.exit().remove();
    }
  });
});

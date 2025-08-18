document.addEventListener("DOMContentLoaded", () => {
  const margin = { top: 60, right: 30, bottom: 50, left: 70 };
  const width = (d3.select("#linechart-categoria-svg").node().clientWidth 
               || d3.select("#linechart-categoria").node().clientWidth 
               || 900) - margin.left - margin.right;

  const height = 400 - margin.top - margin.bottom;

  const svgRoot = d3.select("#linechart-categoria-svg")
    .append("svg")
    .attr("viewBox", `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
    .attr("preserveAspectRatio", "xMidYMid meet")
    .style("width", "100%")
    .style("height", "auto");

  const svg = svgRoot.append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const color = d3.scaleOrdinal()
    .domain(["Extreme", "Very High", "High", "Medium", "Low", "Very Low", "None"])
    .range(["#c6dbef", "#6baed6", "#b2e2b2", "#238b45", "#fcbba1", "#cb181d", "#fdd0a2"]);

  const container = d3.select("#linechart-categoria");

  const tooltip = container
    .append("div")
    .attr("class", "tooltip")
    .style("position", "absolute")
    .style("background", "white")
    .style("border", "1px solid #ccc")
    .style("padding", "8px")
    .style("pointer-events", "none")
    .style("font-size", "12px")
    .style("display", "none");

  d3.dsv(";", "data/heartbeat.csv", d3.autoType).then(data => {
    const niveles = ["Extreme", "Very High", "High", "Medium", "Low", "Very Low", "None"];
    const categorias = Array.from(new Set(data.map(d => d.Categorías)));
    const mesesOrdenados = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

    data.forEach(d => {
      const mesIndex = mesesOrdenados.indexOf(d.Mes);
      d.fecha = new Date(d.Año, mesIndex, 1);
    });

    const selCat = d3.select("#linechart-selector")
      .append("select")
      .attr("id", "categoriaSelector")
      .on("change", updateChart);

    selCat.selectAll("option")
      .data(categorias)
      .enter()
      .append("option")
      .text(d => d);

    const x = d3.scaleTime().range([0, width]);
    const y = d3.scaleLinear().range([height, 0]);

    const xAxis = svg.append("g").attr("transform", `translate(0,${height})`);
    const yAxis = svg.append("g");

    const line = d3.line()
      .x(d => x(d.fecha))
      .y(d => y(d.valor));

    const legend = svg.append("g").attr("class", "legend");

    const focus = svg.append("g").attr("class", "focus").style("display", "none");

    focus.append("line")
      .attr("class", "focus-line")
      .attr("stroke", "#888")
      .attr("stroke-width", 1)
      .attr("y1", 0)
      .attr("y2", height);

    svg.append("rect")
      .attr("width", width)
      .attr("height", height)
      .style("fill", "none")
      .style("pointer-events", "all")
      .on("mouseover", () => { focus.style("display", null); tooltip.style("display", null); })
      .on("mouseout", () => { focus.style("display", "none"); tooltip.style("display", "none"); })
      .on("mousemove", mousemove);

    function updateChart() {
      const categoria = d3.select("#categoriaSelector").property("value");
      const dataFiltrada = data.filter(d => d.Categorías === categoria);

      const series = niveles.map(nivel => ({
        nivel,
        valores: dataFiltrada.map(d => ({ fecha: d.fecha, valor: d[nivel] || 0 }))
      }));

      x.domain(d3.extent(dataFiltrada, d => d.fecha));
      y.domain([0, d3.max(series, s => d3.max(s.valores, d => d.valor))]);

      xAxis.transition().duration(500).call(d3.axisBottom(x).ticks(6).tickFormat(d => `${mesesOrdenados[d.getMonth()]} ${d.getFullYear()}`));
      yAxis.transition().duration(500).call(d3.axisLeft(y).ticks(6).tickFormat(d3.format(",.0f")));

      // Eliminar todas las líneas anteriores (para evitar inconsistencias)
      svg.selectAll(".line-group").remove();

      // Crear nuevos grupos para cada nivel
      const grupos = svg.selectAll(".line-group")
        .data(series)
        .enter()
        .append("g")
        .attr("class", "line-group");

      // Dibujar las líneas con la animación de trazo
      grupos.append("path")
        .attr("class", "line")
        .attr("fill", "none")
        .attr("stroke-width", 2)
        .attr("stroke", d => color(d.nivel))
        .attr("d", d => line(d.valores))
        .each(function() {
          const path = d3.select(this);
          const totalLength = this.getTotalLength();

          path
            .attr("stroke-dasharray", `${totalLength} ${totalLength}`)
            .attr("stroke-dashoffset", totalLength)
            .transition()
            .duration(1200)
            .ease(d3.easeCubic)
            .attr("stroke-dashoffset", 0);
        });

      // Actualizar todas las líneas (nuevas y antiguas)
      svg.selectAll(".line-group").select("path")
        .interrupt()
        .transition()
        .duration(200)
        .ease(d3.easeCubic)
        .attr("stroke", d => color(d.nivel))
        .attr("d", d => line(d.valores))
        .on("end", function() {
          const L = this.getTotalLength();
          d3.select(this)
            .attr("stroke-dasharray", `${L} ${L}`)
            .attr("stroke-dashoffset", L)
            .transition()
            .duration(1200)
            .ease(d3.easeCubic)
            .attr("stroke-dashoffset", 0);
        });

      legend.selectAll(".legend-item").remove();

      const legendItems = legend.selectAll(".legend-item")
        .data(series)
        .enter()
        .append("g")
        .attr("class", "legend-item")
        .attr("transform", (d, i) => `translate(${i * 120},${-30})`);

      legendItems.append("rect")
        .attr("width", 12)
        .attr("height", 12)
        .attr("fill", d => color(d.nivel));

      legendItems.append("text")
        .attr("x", 16)
        .attr("y", 10)
        .text(d => d.nivel);
    }

    function mousemove(event) {
      const bisectDate = d3.bisector(d => d.fecha).left;
      const x0 = x.invert(d3.pointer(event)[0]);
      const categoria = d3.select("#categoriaSelector").property("value");
      const dataFiltrada = data.filter(d => d.Categorías === categoria);

      const i = bisectDate(dataFiltrada, x0, 1);
      const d0 = dataFiltrada[i - 1];
      const d1 = dataFiltrada[i];
      const d = x0 - d0.fecha > d1.fecha - x0 ? d1 : d0;

      const xCoord = x(d.fecha);

      focus.select(".focus-line")
        .attr("x1", xCoord)
        .attr("x2", xCoord);

      let tooltipHtml = `<strong>${d.Mes} ${d.Año}</strong><br>`;
      niveles.forEach(n => { tooltipHtml += `${n}: ${d[n] || 0}<br>`; });

      const svgBounds = svg.node().getBoundingClientRect();
      const mouseX = svgBounds.left + xCoord + margin.left + window.scrollX;
      const mouseY = svgBounds.top + height / 5 + window.scrollY;

      tooltip
        .style("left", `${mouseX}px`)
        .style("top", `${mouseY}px`)
        .html(tooltipHtml);
    }

    updateChart();
  });
});

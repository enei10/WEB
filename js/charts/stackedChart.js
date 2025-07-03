document.addEventListener("DOMContentLoaded", () => {
  const margin = { top: 40, right: 30, bottom: 60, left: 120 };
  const width = 900 - margin.left - margin.right;
  const height = 400 - margin.top - margin.bottom;

  const svg = d3.select("#stacked-chart")
    .append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const color = d3.scaleOrdinal()
    .domain(["Extreme", "Very High", "High", "Medium", "Low", "Very Low", "None"])
    .range(["#c6dbef", "#6baed6", "#b2e2b2", "#238b45", "#fcbba1", "#cb181d", "#fdd0a2"]);

  const tooltip = d3.select("#stacked-chart")
    .append("div")
    .attr("class", "tooltip");

  d3.dsv(";", "data/heartbeat.csv", d3.autoType).then(data => {
    const niveles = ["Extreme", "Very High", "High", "Medium", "Low", "Very Low", "None"];
    const categorias = Array.from(new Set(data.map(d => d.Categorías)));

    const ordenMeses = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
    ];

    const meses = Array.from(new Set(data.map(d => d.Mes)))
        .sort((a, b) => ordenMeses.indexOf(a) - ordenMeses.indexOf(b));



    const anios = Array.from(new Set(data.map(d => d.Año))).sort();

    const selMes = d3.select("#stacked-selector")
      .append("select")
      .attr("id", "selMes")
      .on("change", updateChart);

    selMes.selectAll("option")
      .data(meses)
      .enter()
      .append("option")
      .text(d => d);

    const selAnio = d3.select("#stacked-selector")
      .append("select")
      .attr("id", "selAnio")
      .on("change", updateChart);

    selAnio.selectAll("option")
      .data(anios)
      .enter()
      .append("option")
      .text(d => d);

    const x = d3.scaleLinear().range([0, width]);
    const y = d3.scaleBand().range([0, height]).padding(0.2);

    svg.append("g").attr("class", "x-axis").attr("transform", `translate(0,${height})`);
    svg.append("g").attr("class", "y-axis");

    // // Leyenda dinámica
    // const legendContainer = d3.select("#stacked-legend");
    // niveles.forEach(nivel => {
    //   const item = legendContainer.append("div").attr("class", "legend-item");
    //   item.append("div")
    //       .attr("class", "color-box")
    //       .style("background-color", color(nivel));
    //   item.append("span").text(nivel);
    // });

    // Obtener el primer año y sus meses disponibles
    const primerAnio = anios[0];
    const mesesDePrimerAnio = meses.filter(m => 
    data.some(d => d.Año === primerAnio && d.Mes === m)
    );
    const primerMes = mesesDePrimerAnio[0];

    // Asignar valores iniciales al selector
    d3.select("#selAnio").property("value", primerAnio);
    d3.select("#selMes").property("value", primerMes);

    // Actualizar gráfico con esos valores
    updateChart();

    svg.select(".y-axis")
    .transition().duration(500)
    .call(d3.axisLeft(y))
    .selection()
    .raise(); 


    function updateChart() {
      const mes = d3.select("#selMes").property("value");
      const anio = +d3.select("#selAnio").property("value");
      const datosFiltrados = data.filter(d => d.Mes === mes && d.Año === anio);

      const datosPorCategoria = d3.group(datosFiltrados, d => d.Categorías);
      const datosTransformados = Array.from(datosPorCategoria, ([categoria, valores]) => {
        const obj = { Categoria: categoria };
        const total = d3.sum(valores, d => d3.sum(niveles, k => d[k]));
        niveles.forEach(nivel => {
          obj[nivel] = d3.sum(valores, d => d[nivel]) * 100 / total;
        });
        return obj;
      });

      const series = d3.stack().keys(niveles)(datosTransformados);

      x.domain([0, 100]);
      y.domain(datosTransformados.map(d => d.Categoria));

      svg.select(".x-axis")
        .transition().duration(500)
        .call(d3.axisBottom(x).ticks(5).tickFormat(d => `${d}%`));

      const grupos = svg.selectAll("g.layer")
        .data(series, d => d.key);

      grupos.exit().remove();

      const nuevosGrupos = grupos.enter()
        .append("g")
        .attr("class", "layer")
        .attr("fill", d => color(d.key));

      const mergedGrupos = nuevosGrupos.merge(grupos);

      const rects = mergedGrupos.selectAll("rect")
        .data(d => d.map(p => ({ ...p, key: d.key })), d => `${d.data.Categoria}-${d.key}`);

      rects.enter()
        .append("rect")
        .attr("y", d => y(d.data.Categoria))
        .attr("x", d => x(d[0]))
        .attr("height", y.bandwidth())
        .attr("width", 0)
        .on("mouseover", (event, d) => {
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
        .transition()
        .duration(500)
        .attr("width", d => x(d[1]) - x(d[0]));

      rects.transition()
        .duration(500)
        .attr("x", d => x(d[0]))
        .attr("width", d => x(d[1]) - x(d[0]))
        .attr("y", d => y(d.data.Categoria))
        .attr("height", y.bandwidth());

      rects.exit().remove();
    }
  });
});

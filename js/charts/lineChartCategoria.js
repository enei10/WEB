document.addEventListener("DOMContentLoaded", () => {
  const margin = { top: 60, right: 30, bottom: 50, left: 70 };
  const width = 900 - margin.left - margin.right;
  const height = 400 - margin.top - margin.bottom;

  const svg = d3.select("#linechart-categoria")
    .append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const color = d3.scaleOrdinal()
    .domain(["Extreme", "Very High", "High", "Medium", "Low", "Very Low", "None"])
    .range(["#c6dbef", "#6baed6", "#b2e2b2", "#238b45", "#fcbba1", "#cb181d", "#fdd0a2"]);

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

    updateChart();

    function updateChart() {
      const categoria = d3.select("#categoriaSelector").property("value");
      const dataFiltrada = data.filter(d => d.Categorías === categoria);

      const series = niveles.map(nivel => ({
        nivel,
        valores: dataFiltrada.map(d => ({ fecha: d.fecha, valor: d[nivel] || 0 }))
      }));

      x.domain(d3.extent(dataFiltrada, d => d.fecha));
      y.domain([0, d3.max(series, s => d3.max(s.valores, d => d.valor))]);

      xAxis.transition().duration(500).call(d3.axisBottom(x).ticks(6).tickFormat(d => {
        const mesesES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
                        "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
        return `${mesesES[d.getMonth()]} ${d.getFullYear()}`;
      }))
      yAxis.transition().duration(500).call(d3.axisLeft(y).ticks(6).tickFormat(d3.format(",.0f")));

      const grupos = svg.selectAll(".line-group").data(series, d => d.nivel);

      grupos.exit().remove();

      const nuevos = grupos.enter()
        .append("g")
        .attr("class", "line-group");

      nuevos.append("path")
        .attr("class", "line")
        .attr("fill", "none")
        .attr("stroke-width", 2)
        .attr("stroke", d => color(d.nivel))
        .attr("d", d => line(d.valores))
        .attr("stroke-dasharray", function(d) {
          const totalLength = this.getTotalLength();
          return `${totalLength} ${totalLength}`;
        })
        .attr("stroke-dashoffset", function(d) {
          return this.getTotalLength();
        })
        .transition()
        .duration(1200)
        .ease(d3.easeCubic)
        .attr("stroke-dashoffset", 0);

      grupos.select("path")
        .transition()
        .duration(500)
        .attr("stroke", d => color(d.nivel))
        .attr("d", d => line(d.valores));

      // Leyenda
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
  });
});

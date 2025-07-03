document.addEventListener("DOMContentLoaded", () => {
  const margin = { top: 40, right: 60, bottom: 90, left: 60 };
  const width = 960 - margin.left - margin.right;
  const height = 500 - margin.top - margin.bottom;

  const svg = d3.select("#line-chart-container")
    .append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const color = d3.scaleOrdinal()
    .domain(["SOFTWARE", "BACKUP", "DATABASE"])
    .range(["#2b8cbe", "#4eb3d3", "#9e9ac8"]);

  const tooltip = d3.select("#line-chart-container")
    .append("div")
    .attr("class", "tooltip");

  d3.dsv(";", "data/tic_peru.csv").then(data => {

    const mesesES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
                     "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

    // Crear fechas reales
    data.forEach(d => {
      const mesIndex = mesesES.indexOf(d.Mes);
      d.fecha = new Date(d.Año, mesIndex, 1);
    });

    const series = ["SOFTWARE", "BACKUP", "DATABASE"];

    const x = d3.scaleTime()
      .domain(d3.extent(data, d => d.fecha))
      .range([0, width]);

    const yLeft = d3.scaleLinear()
      .domain([0, d3.max(data, d => Math.max(+d["BACKUP"], +d["DATABASE"]))])
      .nice()
      .range([height, 0]);

    const yRight = d3.scaleLinear()
      .domain([0, d3.max(data, d => +d["SOFTWARE"])])
      .nice()
      .range([height, 0]);

    // Formato: "Julio 2021"
    const formatTime = d => `${mesesES[d.getMonth()]} ${d.getFullYear()}`;

    // Crear 6 fechas espaciadas automáticamente
    const fechas = d3.scaleTime()
      .domain(d3.extent(data, d => d.fecha))
      .ticks(6);

    // Eje X
    svg.append("g")
      .attr("transform", `translate(0, ${height})`)
      .call(d3.axisBottom(x)
        .tickValues(fechas)
        .tickFormat(formatTime)
      )
      .selectAll("text")
      .style("text-anchor", "middle")
      .style("font-size", "12px")
      .attr("dy", "1.5em");

    // Eje Y
    svg.append("g")
      .call(d3.axisLeft(yLeft).ticks(6).tickFormat(d3.format(",.0f")));

    svg.append("g")
      .attr("transform", `translate(${width}, 0)`)
      .call(d3.axisRight(yRight).ticks(6).tickFormat(d3.format(",.0f")));

    const focusDots = {};

    series.forEach(key => {
      const y = (key === "SOFTWARE") ? yRight : yLeft;

      const line = d3.line()
        .x(d => x(d.fecha))
        .y(d => y(+d[key]));

      const path = svg.append("path")
        .datum(data)
        .attr("fill", "none")
        .attr("stroke", color(key))
        .attr("stroke-width", 2)
        .attr("d", line);

      const totalLength = path.node().getTotalLength();

      path
        .attr("stroke-dasharray", `${totalLength} ${totalLength}`)
        .attr("stroke-dashoffset", totalLength)
        .transition()
        .duration(1200)
        .ease(d3.easeCubic)
        .attr("stroke-dashoffset", 0);

      focusDots[key] = svg.append("circle")
        .attr("r", 4)
        .attr("fill", color(key))
        .style("display", "none");
    });

    const focusLine = svg.append("line")
      .attr("class", "focus-line")
      .attr("stroke", "#888")
      .attr("stroke-width", 1)
      .attr("y1", 0)
      .attr("y2", height)
      .style("display", "none");

    svg.append("rect")
      .attr("class", "overlay")
      .attr("width", width)
      .attr("height", height)
      .style("fill", "none")
      .style("pointer-events", "all")
      .on("mousemove", mousemove)
      .on("mouseleave", () => {
        focusLine.style("display", "none");
        tooltip.style("display", "none");
        series.forEach(k => focusDots[k].style("display", "none"));
      });

    // Buscar fecha más cercana en el eje X
    function getClosestDate(mx) {
      const bisectDate = d3.bisector(d => d.fecha).left;
      const x0 = x.invert(mx);
      const i = bisectDate(data, x0, 1);
      return data[Math.min(i, data.length - 1)];
    }

    // Tooltip + línea flotante
    function mousemove(event) {
      const [mx] = d3.pointer(event);
      const d = getClosestDate(mx);
      if (!d) return;

      const xCoord = x(d.fecha);
      focusLine
        .style("display", "block")
        .attr("x1", xCoord)
        .attr("x2", xCoord);

      series.forEach(key => {
        const y = (key === "SOFTWARE") ? yRight : yLeft;
        focusDots[key]
          .style("display", "block")
          .attr("cx", xCoord)
          .attr("cy", y(+d[key]));
      });

      tooltip
        .style("display", "block")
        .style("left", (xCoord + margin.left + 20) + "px")
        .style("top", (margin.top + 10) + "px")
        .html(
          `<strong>${formatTime(d.fecha)}</strong><br>
           SOFTWARE: ${d.SOFTWARE}<br>
           BACKUP: ${d.BACKUP}<br>
           DATABASE: ${d.DATABASE}`
        );
    }

    // Leyenda
    const legend = svg.append("g")
      .attr("transform", `translate(0, -20)`)
      .selectAll("g")
      .data(series)
      .enter()
      .append("g")
      .attr("transform", (d, i) => `translate(${i * 120}, 0)`);

    legend.append("rect")
      .attr("width", 12)
      .attr("height", 12)
      .attr("fill", d => color(d));

    legend.append("text")
      .attr("x", 18)
      .attr("y", 10)
      .text(d => d)
      .style("font-size", "13px");
  });
});

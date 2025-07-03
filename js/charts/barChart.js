document.addEventListener("DOMContentLoaded", () => {
  const margin = { top: 40, right: 30, bottom: 80, left: 70 };
  const width = 900 - margin.left - margin.right;
  const height = 500 - margin.top - margin.bottom;

  const svg = d3.select("#bar-chart-container")
    .append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const tooltip = d3.select("#bar-chart-container")
    .append("div")
    .attr("class", "tooltip");

  const color = d3.scaleOrdinal()
    .domain(["Disponible", "No disponible"])
    .range(["#2b8cbe", "#de77ae"]);

  d3.dsv(";", "data/paginas_disponibles.csv").then((rawData) => {
    const seriesKeys = ["Disponible", "No disponible"];

    const data = rawData.map(d => ({
      Meses: d.Meses,
      Disponible: +d["Disponible"],
      "No disponible": +d["No disponible"]
    }));

    const stack = d3.stack().keys(seriesKeys);
    const stackedData = stack(data);

    const x = d3.scaleBand()
      .domain(data.map(d => d.Meses))
      .range([0, width])
      .padding(0.2);

    const y = d3.scaleLinear()
      .domain([0, d3.max(data, d => d.Disponible + d["No disponible"])])
      .range([height, 0]);

    // Eje X
    svg.append("g")
    .attr("transform", `translate(0,${height})`)
    .call(d3.axisBottom(x).tickSizeOuter(0))
    .selectAll("text")
    .attr("transform", "rotate(-90)")
    .style("text-anchor", "end")
    .attr("dx", "-0.6em")
    .attr("dy", "-0.4em");

    // Eje Y con clase .y-axis
    svg.append("g")
      .attr("class", "y-axis")
      .call(d3.axisLeft(y).ticks(6).tickFormat(d3.format(",.0f")));

    // Leyenda interactiva
    const legend = d3.select("#bar-chart-container")
      .append("div")
      .attr("class", "legend");

    const activeKeys = new Set(seriesKeys);

    seriesKeys.forEach((key) => {
    const item = legend.append("div")
        .attr("class", "legend-item")
        .attr("data-key", key)
        .on("click", () => {
        if (activeKeys.has(key)) {
            activeKeys.delete(key);
        } else {
            activeKeys.add(key);
        }

        // Si ninguna categoría queda activa, restaurar ambas automáticamente
        if (activeKeys.size === 0) {
            seriesKeys.forEach(k => activeKeys.add(k));
        }


        updateBars();
        updateLegend();
        });

    item.append("span")
        .style("background-color", color(key));

    item.append("label")
        .text(key);
    });

    updateBars();

    function updateLegend() {
    d3.selectAll(".legend-item").each(function () {
        const key = d3.select(this).attr("data-key");
        const isActive = activeKeys.has(key);

        d3.select(this)
        .style("opacity", isActive ? 1 : 0.4)
        .style("cursor", "pointer");
    });
    }


    function updateBars() {
      const filteredKeys = ["Disponible", "No disponible"].filter(k => activeKeys.has(k));
      const newStack = d3.stack().keys(filteredKeys);
      const newStackedData = newStack(data);

      const maxY = d3.max(data, d =>
        filteredKeys.reduce((sum, key) => sum + d[key], 0)
      );
      y.domain([0, maxY]);

      // Actualizar eje Y
      svg.select(".y-axis")
        .transition()
        .duration(500)
        .call(d3.axisLeft(y).ticks(6).tickFormat(d3.format(",.0f")));

      const layers = svg.selectAll("g.layer")
        .data(newStackedData, d => d.key);

      // EXIT
      layers.exit()
        .selectAll("rect")
        .transition()
        .duration(500)
        .attr("y", d =>
          d.key === "No disponible"
            ? y(d[1]) - (y(d[0]) - y(d[1]))
            : y(0)
        )
        .attr("height", 0)
        .remove();

      layers.exit().transition().delay(500).remove();

      // UPDATE
      layers.selectAll("rect")
        .data(d => d.map(p => ({ ...p, key: d.key })))
        .transition()
        .duration(500)
        .attr("y", d => y(d[1]))
        .attr("height", d => y(d[0]) - y(d[1]));

      // ENTER
      const newGroups = layers.enter()
        .append("g")
        .attr("class", d => `layer layer-${d.key.replace(/\s+/g, '')}`)
        .attr("fill", d => color(d.key));

      newGroups.selectAll("rect")
        .data(d => d.map(p => ({ ...p, key: d.key })))
        .enter()
        .append("rect")
        .attr("x", d => x(d.data.Meses))
        .attr("width", x.bandwidth())
        .attr("y", d =>
          d.key === "No disponible"
            ? y(d[1]) - (y(d[0]) - y(d[1]))
            : y(0)
        )
        .attr("height", 0)
        .on("mouseover", function (event, d) {
          tooltip.style("display", "block")
            .html(`<strong>${d.key}</strong><br>Meses: ${d.data.Meses}<br>Valor: ${d3.format(",")(d.data[d.key])}`);
        })
        .on("mousemove", function (event) {
          tooltip
            .style("left", (event.offsetX + 10) + "px")
            .style("top", (event.offsetY - 20) + "px");
        })
        .on("mouseleave", function () {
          tooltip.style("display", "none");
        })
        .transition()
        .duration(500)
        .attr("y", d => y(d[1]))
        .attr("height", d => y(d[0]) - y(d[1]));
    }
  });
});
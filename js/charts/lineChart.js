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

  const series = ["SOFTWARE", "BACKUP", "DATABASE"];

  const color = d3.scaleOrdinal()
    .domain(series)
    .range(["#2b8cbe", "#4eb3d3", "#9e9ac8"]);

  const tooltip = d3.select("#line-chart-container")
    .append("div")
    .attr("class", "tooltip");

  const fmt = d3.format(",.0f"); // formato para valores en tooltip

  d3.dsv(";", "data/tic_peru.csv").then(data => {

    const mesesCortos = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
    const mesesLargos = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

    data.forEach(d => {
      const mesIndex = mesesLargos.indexOf(d.Mes);
      d.fecha = new Date(d.Año, mesIndex, 1);
    });

    // Fechas únicas ordenadas
    const fechasUnicas = Array.from(new Set(data.map(d => d.fecha.getTime())))
      .map(t => new Date(t))
      .sort((a, b) => a - b);

    // Escala X con spacing uniforme por fecha
    const x = d3.scalePoint()
      .domain(fechasUnicas.map(d => d.getTime()))
      .range([0, width])
      .padding(0.5);

    // Escalas Y
    const yLeft = d3.scaleLinear()
      .domain([0, d3.max(data, d => Math.max(+d["BACKUP"], +d["DATABASE"]))])
      .nice()
      .range([height, 0]);

    const yRight = d3.scaleLinear()
      .domain([0, d3.max(data, d => +d["SOFTWARE"])])
      .nice()
      .range([height, 0]);

    const formatTime = d => `${mesesCortos[d.getMonth()]} ${d.getFullYear()}`;

    // Calcular 6 fechas del dominio real
    const fechasFinales = [];
    const step = Math.floor((fechasUnicas.length - 1) / 5);
    for (let i = 0; i <= 5; i++) {
      fechasFinales.push(fechasUnicas[i * step].getTime());
    }

    // Eje X
    const ejeX = svg.append("g")
      .attr("transform", `translate(0, ${height})`)
      .style("opacity", 0);

    ejeX.transition().duration(700).style("opacity", 1)
      .call(d3.axisBottom(x)
        .tickValues(fechasFinales)
        .tickFormat(t => formatTime(new Date(t)))
      );

    ejeX.selectAll("text")
      .style("text-anchor", "middle")
      .style("font-size", "12px");

    // Ejes Y
    svg.append("g")
      .style("opacity", 0)
      .transition().duration(700).style("opacity", 1)
      .call(d3.axisLeft(yLeft).ticks(6).tickFormat(d3.format(",.0f")));

    svg.append("g")
      .attr("transform", `translate(${width}, 0)`)
      .style("opacity", 0)
      .transition().duration(700).style("opacity", 1)
      .call(d3.axisRight(yRight).ticks(6).tickFormat(d3.format(",.0f")));

    const focusDots = {};

    series.forEach(key => {
      const y = (key === "SOFTWARE") ? yRight : yLeft;

      const line = d3.line()
        .x(d => x(d.fecha.getTime()))
        .y(d => y(+d[key]));

      svg.append("path")
        .datum(data)
        .attr("fill", "none")
        .attr("stroke", color(key))
        .attr("stroke-width", 2)
        .attr("d", line);

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

    function getClosestDate(mx) {
      const x0 = mx;
      const distances = fechasUnicas.map(d => Math.abs(x(d.getTime()) - x0));
      const closestIndex = distances.indexOf(Math.min(...distances));
      return data.find(d => d.fecha.getTime() === fechasUnicas[closestIndex].getTime());
    }

    function mousemove(event) {
      const [mx] = d3.pointer(event);
      const d = getClosestDate(mx);
      if (!d) return;

      const xCoord = x(d.fecha.getTime());

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

      // === Tooltip con cuadrito del color de cada línea ===
      const filas = series.map(k => `
        <div style="display:flex;align-items:center;gap:6px;">
          <span style="
            width:10px;height:10px;border-radius:2px;
            background:${color(k)};
            box-shadow:0 0 0 1px rgba(0,0,0,.2) inset;">
          </span>
          <span>${k}: <strong>${fmt(+d[k])}</strong></span>
        </div>
      `).join("");

      tooltip
        .style("display", "block")
        .style("left", (xCoord + margin.left + 20) + "px")
        .style("top", (margin.top + 10) + "px")
        .html(`
          <div style="margin-bottom:4px;"><strong>${formatTime(d.fecha)}</strong></div>
          <div style="display:flex;flex-direction:column;gap:3px;">
            ${filas}
          </div>
        `);
    }

    // (tu bloque de "mini leyenda" en el SVG, lo dejo igual por si lo usas)
    svg.append("g")
      .attr("transform", `translate(0, -20)`)
      .selectAll("g")
      .data(series)
      .enter()
      .append("g")
      .attr("transform", (d, i) => `translate(${i * 120}, 0)`)
      .call(g => {
        g.append("rect").attr("width", 12).attr("height", 12).attr("fill", d => color(d));
        g.append("text").attr("x", 18).attr("y", 10).text(d => d).style("font-size", "13px");
      });
  });
});

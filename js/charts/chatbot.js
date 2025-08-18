// js/charts/chatbot.js
document.addEventListener("DOMContentLoaded", async () => {
  const container = d3.select("#chatbot-chart");

  const margin = { top: 48, right: 28, bottom: 48, left: 56 };
  const width = (d3.select("#chatbot-chart").node().clientWidth || 920) - margin.left - margin.right;


  const height = 420 - margin.top - margin.bottom;

  const svg = container.append("svg")
    .attr("viewBox", `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
    .attr("preserveAspectRatio", "xMidYMid meet")
    .style("width", "100%")
    .style("height", "auto");

  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  // Tooltip
  const tooltip = container.append("div")
    .attr("class", "tooltip")
    .style("position", "absolute")
    .style("pointer-events", "none")
    .style("opacity", 0);

  // Meses ES y parseo "Dic-2023"
  const mesesES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  const parseMesYYYY = (str) => {
    if (!str) return null;
    const [mesStr, yyyyStr] = String(str).split("-");
    const m = mesesES.indexOf(mesStr);
    const y = parseInt(yyyyStr, 10);
    if (m < 0 || isNaN(y)) return null;
    return new Date(Date.UTC(y, m, 1));
  };
  const formatMes = (d) => `${mesesES[d.getUTCMonth()]}-${d.getUTCFullYear()}`;

  // CSV con ';'
  let dataRaw = await d3.dsv(";", "data/chatbot.csv", d3.autoType);

  // Normalizar encabezado Mes (BOM)
  const mesKey = Object.keys(dataRaw[0]).find(k => k.replace(/\uFEFF/g, "").trim() === "Mes") || "Mes";

  // Fecha y orden
  dataRaw.forEach(d => { d.Mes = d[mesKey]; d.fecha = parseMesYYYY(d.Mes); });
  dataRaw = dataRaw
    .filter(d => d.fecha instanceof Date && !isNaN(d.fecha))
    .sort((a,b) => d3.ascending(a.fecha, b.fecha));

  // Series (sin Mes/fecha/Total)
  const allCols = Object.keys(dataRaw[0]);
  const seriesKeys = allCols.filter(k => !["Mes","fecha","Total", mesKey].includes(k));

  // Escalas
  const x = d3.scaleBand().domain(dataRaw.map(d => d.fecha)).range([0, width]).padding(0.2);
  const yMax = d3.max(dataRaw, d => {
    const sMax = d3.max(seriesKeys, k => +d[k] || 0) || 0;
    return Math.max(d.Total ?? 0, sMax);
  });
  const y = d3.scaleLinear().domain([0, yMax]).nice().range([height, 0]);

  // Colores vivos para líneas
  const color = d3.scaleOrdinal().domain(seriesKeys).range(d3.schemeSet1.slice(0, seriesKeys.length));

  // Ejes (solo Y izquierda y X abajo)
  g.append("g")
    .attr("class", "axis-x-bottom")
    .attr("transform", `translate(0,${height})`)
    .call(d3.axisBottom(x).tickFormat(formatMes));

  g.append("g")
    .attr("class", "axis-y-left")
    .call(d3.axisLeft(y).ticks(6));

  // Barras (Total) + etiquetas arriba
  const barFill = "#e4c3dfff";
  const bars = g.append("g")
    .attr("class", "bars")
    .selectAll("rect")
    .data(dataRaw, d => d.Mes)
    .join("rect")
    .attr("x", d => x(d.fecha))
    .attr("y", y(0))
    .attr("width", x.bandwidth())
    .attr("height", 0)
    .attr("fill", barFill);

  bars.transition()
    .duration(900)
    .attr("y", d => y(d.Total))
    .attr("height", d => y(0) - y(d.Total))
    .ease(d3.easeCubicOut);

  const valueFmt = d3.format(",.0f");
  const labels = g.append("g").attr("class", "bar-labels")
    .selectAll("text")
    .data(dataRaw, d => d.Mes)
    .join("text")
    .attr("x", d => x(d.fecha) + x.bandwidth() / 2)
    .attr("y", y(0) - 6)
    .attr("text-anchor", "middle")
    .attr("fill", "#222")
    .attr("font-size", 11)
    .attr("opacity", 0)
    .text(d => valueFmt(d.Total));

  labels.transition()
    .delay(150)
    .duration(900)
    .attr("y", d => y(d.Total) - 6)
    .attr("opacity", 1)
    .ease(d3.easeCubicOut);

  bars
    .on("mousemove", (event, d) => {
      tooltip.style("opacity", 1)
        .html(`<strong>${d.Mes}</strong><br/>Total: ${d.Total}`)
        .style("left", (event.pageX + 14) + "px")
        .style("top", (event.pageY - 24) + "px");
    })
    .on("mouseleave", () => tooltip.style("opacity", 0));

  // Datos de líneas
  const seriesData = seriesKeys.map(k => ({
    key: k,
    values: dataRaw.map(d => ({ fecha: d.fecha, Mes: d.Mes, value: +d[k] || 0 }))
  }));

  // Generador de línea
  const lineGen = d3.line()
    .defined(d => d.value != null && !isNaN(d.value))
    .x(d => x(d.fecha) + x.bandwidth() / 2)
    .y(d => y(d.value));

  const linesG = g.append("g").attr("class", "lines");

  // Paths de líneas (colores vivos + trazo más grueso)
  const paths = linesG.selectAll(".line-series")
    .data(seriesData, d => d.key)
    .join("path")
    .attr("class", "line-series")
    .attr("fill", "none")
    .attr("stroke-width", 3)
    .attr("stroke", d => color(d.key))
    .attr("d", d => lineGen(d.values));

  // Animación de dibujo
  paths.each(function() {
    const totalLength = this.getTotalLength();
    d3.select(this)
      .attr("stroke-dasharray", `${totalLength} ${totalLength}`)
      .attr("stroke-dashoffset", totalLength)
      .transition().duration(900).ease(d3.easeCubicOut)
      .attr("stroke-dashoffset", 0);
  });

  // Puntos (mismo color que su línea)
  linesG.selectAll(".points-series")
    .data(seriesData, d => d.key)
    .join(enter => {
      const gS = enter.append("g").attr("class", "points-series");
      gS.selectAll("circle")
        .data(d => d.values.map(v => ({...v, key: d.key})))
        .join("circle")
        .attr("cx", d => x(d.fecha) + x.bandwidth() / 2)
        .attr("cy", d => y(d.value))
        .attr("r", 3.5)
        .attr("fill", d => color(d.key))
        .attr("stroke", d => color(d.key))
        .attr("stroke-width", 1.25)
        .on("mousemove", (event, d) => {
          tooltip.style("opacity", 1)
            .html(`<strong>${d.Mes}</strong><br/>${d.key}: ${d.value}`)
            .style("left", (event.pageX + 14) + "px")
            .style("top", (event.pageY - 24) + "px");
        })
        .on("mouseleave", () => tooltip.style("opacity", 0));
      return gS;
    });

  // ===== Etiquetas SOLO para Jun-2025 en las LÍNEAS (a la derecha de cada punto) =====
  const targetDate = parseMesYYYY("Jun-2025");
  const labelOffset = 6;
  const lineValueFmt = d3.format(",.0f");

  const junLabelsG = linesG.append("g")
    .attr("class", "line-point-labels-jun2025");

  // Construir datos de etiquetas (una por serie, en Jun-2025)
  const junLabelsData = seriesData.flatMap(s =>
    s.values
      .filter(v => v.fecha && targetDate && v.fecha.getTime() === targetDate.getTime())
      .map(v => ({ ...v, key: s.key }))
  );

  junLabelsG.selectAll("text")
    .data(junLabelsData)
    .join("text")
    .attr("x", d => x(d.fecha) + x.bandwidth() / 2 + labelOffset)
    .attr("y", d => y(d.value))
    .attr("dominant-baseline", "middle")
    .attr("text-anchor", "start")
    .attr("fill", "black")
    .attr("font-weight", 500)
    .attr("stroke-width", 1)
    .attr("paint-order", "stroke")
    .attr("font-size", 9) 
    .text(d => lineValueFmt(d.value));

  // Leyenda clickeable alineada a la izquierda
  const legend = svg.append("g")
    .attr("transform", `translate(${margin.left}, ${12})`)
    .attr("font-size", 12)
    .attr("text-anchor", "start");

  let xOffset = 0;
  const legendItem = legend.selectAll(".legend-item")
    .data(seriesKeys)
    .join("g")
    .attr("class", "legend-item")
    .attr("transform", d => {
      const pos = `translate(${xOffset}, 0)`;
      xOffset += (d.length * 7) + 28; // ancho dinámico según texto + rect
      return pos;
    })
    .style("cursor", "pointer");

  legendItem.append("rect")
    .attr("x", 0).attr("y", -10)
    .attr("width", 14).attr("height", 14).attr("rx", 3)
    .attr("fill", d => color(d));

  legendItem.append("text")
    .attr("x", 20)
    .attr("y", 2)
    .text(d => d);

  const active = new Map(seriesKeys.map(k => [k, true]));

  legendItem.on("click", (event, key) => {
    const newState = !active.get(key);
    active.set(key, newState);

    d3.select(event.currentTarget).select("rect")
      .attr("fill", newState ? color(key) : "#ddd");

    linesG.selectAll(".line-series")
      .filter(d => d.key === key)
      .attr("opacity", newState ? 1 : 0);

    linesG.selectAll(".points-series")
      .filter(d => d.key === key)
      .attr("opacity", newState ? 1 : 0);

    // Sincronizar etiquetas de Jun-2025 con la visibilidad de cada serie
    junLabelsG.selectAll("text")
      .filter(d => d.key === key)
      .attr("opacity", newState ? 1 : 0);
  });

  // Labels ejes
  svg.append("text")
    .attr("x", margin.left + width / 2)
    .attr("y", margin.top + height + 36)
    .attr("text-anchor", "middle")
    .attr("fill", "#555")
    .text("Mes");

  svg.append("text")
    .attr("x", -(margin.top + height / 2))
    .attr("y", 16)
    .attr("transform", "rotate(-90)")
    .attr("text-anchor", "middle")
    .attr("fill", "#555")
    .text("Frecuencia");
});

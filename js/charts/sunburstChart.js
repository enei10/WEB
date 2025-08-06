async function drawSunburst() {
  const rawData = await d3.dsv(";", "data/sunburst.csv", d3.autoType);
  const container = d3.select("#sunburst-chart");

  // Crear filtros únicos
  const anos = [...new Set(rawData.map(d => d.Ano))];
  const meses = [...new Set(rawData.map(d => d.Mes))];

  // Crear selects
  const controlDiv = container.insert("div", ":first-child").attr("class", "sunburst-controls").style("margin-bottom", "1rem");

  controlDiv.append("label").text("Año: ");
  const anoSelect = controlDiv.append("select").attr("id", "ano-select");
  anoSelect.selectAll("option")
    .data(anos)
    .join("option")
    .attr("value", d => d)
    .text(d => d);

  controlDiv.append("label").text(" Mes: ").style("margin-left", "1rem");
  const mesSelect = controlDiv.append("select").attr("id", "mes-select");
  mesSelect.selectAll("option")
    .data(meses)
    .join("option")
    .attr("value", d => d)
    .text(d => d);

  // Redibujar al cambiar filtros
  anoSelect.on("change", updateChart);
  mesSelect.on("change", updateChart);

  // Dibujar por primera vez
  updateChart();

  function updateChart() {
    const selectedAno = anoSelect.property("value");
    const selectedMes = mesSelect.property("value");

    // Filtrar datos
    const data = rawData.filter(d => d.Ano == selectedAno && d.Mes == selectedMes);
    const rootData = buildHierarchy(data);

    // Borrar gráfico anterior
    container.select("svg").remove();

    // Recalcular jerarquía
    const hierarchy = d3.hierarchy(rootData)
      .sum(d => d.value)
      .sort((a, b) => b.value - a.value);

    const width = 928;
    const radius = width / 6;
    const color = d3.scaleOrdinal(d3.quantize(d3.interpolateRainbow, rootData.children.length + 1));

    const root = d3.partition()
      .size([2 * Math.PI, hierarchy.height + 1])(hierarchy);

    root.each(d => d.current = d);

    const arc = d3.arc()
      .startAngle(d => d.x0)
      .endAngle(d => d.x1)
      .padAngle(d => Math.min((d.x1 - d.x0) / 2, 0.005))
      .padRadius(radius * 1.5)
      .innerRadius(d => d.y0 * radius)
      .outerRadius(d => Math.max(d.y0 * radius, d.y1 * radius - 1));

    const svg = container.append("svg")
      .attr("viewBox", [-width / 2, -width / 2, width, width])
      .style("font", "10px sans-serif");

    const g = svg.append("g");

    const path = g.selectAll("path")
      .data(root.descendants().slice(1))
      .join("path")
      .attr("fill", d => { while (d.depth > 1) d = d.parent; return color(d.data.name); })
      .attr("fill-opacity", d => arcVisible(d.current) ? (d.children ? 0.6 : 0.4) : 0)
      .attr("pointer-events", d => arcVisible(d.current) ? "auto" : "none")
      .attr("d", d => arc(d.current));

    path.filter(d => d.children)
      .style("cursor", "pointer")
      .on("click", clicked);

    path.append("title")
      .text(d => `${d.ancestors().map(d => d.data.name).reverse().join("/")}\n${d3.format(",d")(d.value)}`);

    const label = g.append("g")
      .attr("pointer-events", "none")
      .attr("text-anchor", "middle")
      .style("user-select", "none")
      .selectAll("text")
      .data(root.descendants().slice(1))
      .join("text")
      .attr("dy", "0.35em")
      .attr("fill-opacity", d => +labelVisible(d.current))
      .attr("transform", d => labelTransform(d.current))
      .text(d => d.data.name);

    const parent = g.append("circle")
      .datum(root)
      .attr("r", radius)
      .attr("fill", "none")
      .attr("pointer-events", "all")
      .on("click", clicked);

    function clicked(event, p) {
      parent.datum(p.parent || root);

      root.each(d => d.target = {
        x0: Math.max(0, Math.min(1, (d.x0 - p.x0) / (p.x1 - p.x0))) * 2 * Math.PI,
        x1: Math.max(0, Math.min(1, (d.x1 - p.x0) / (p.x1 - p.x0))) * 2 * Math.PI,
        y0: Math.max(0, d.y0 - p.depth),
        y1: Math.max(0, d.y1 - p.depth)
      });

      const t = svg.transition().duration(event.altKey ? 7500 : 750);

      path.transition(t)
        .tween("data", d => {
          const i = d3.interpolate(d.current, d.target);
          return t => d.current = i(t);
        })
        .filter(function(d) {
          return +this.getAttribute("fill-opacity") || arcVisible(d.target);
        })
        .attr("fill-opacity", d => arcVisible(d.target) ? (d.children ? 0.6 : 0.4) : 0)
        .attr("pointer-events", d => arcVisible(d.target) ? "auto" : "none")
        .attrTween("d", d => () => arc(d.current));

      label.filter(function(d) {
        return +this.getAttribute("fill-opacity") || labelVisible(d.target);
      }).transition(t)
        .attr("fill-opacity", d => +labelVisible(d.target))
        .attrTween("transform", d => () => labelTransform(d.current));
    }

    function arcVisible(d) {
      return d.y1 <= 3 && d.y0 >= 1 && d.x1 > d.x0;
    }

    function labelVisible(d) {
      return d.y1 <= 3 && d.y0 >= 1 && (d.y1 - d.y0) * (d.x1 - d.x0) > 0.03;
    }

    function labelTransform(d) {
      const x = ((d.x0 + d.x1) / 2) * 180 / Math.PI;
      const y = ((d.y0 + d.y1) / 2) * radius;
      if (isNaN(x) || isNaN(y)) return "translate(0,0)";
      return `rotate(${x - 90}) translate(${y},0) rotate(${x < 180 ? 0 : 180})`;
    }
  }

  function buildHierarchy(rows) {
    const root = { name: "root", children: [] };
    const mapL1 = {};

    rows.forEach(row => {
      const l1 = row.Clasificacion;
      const l2 = row.Categoria || "";
      const l3 = row.Subcategoria || "";
      const val = +row.Valor;

      if (!mapL1[l1]) {
        mapL1[l1] = { name: l1, children: [] };
        root.children.push(mapL1[l1]);
      }

      const nodeL1 = mapL1[l1];

      if (l2 && l3) {
        let nodeL2 = nodeL1.children.find(d => d.name === l2);
        if (!nodeL2) {
          nodeL2 = { name: l2, children: [] };
          nodeL1.children.push(nodeL2);
        }
        nodeL2.children.push({ name: l3, value: val });
      } else if (l2) {
        nodeL1.children.push({ name: l2, value: val });
      } else {
        nodeL1.children.push({ name: l1, value: val });
      }
    });

    return root;
  }
}

drawSunburst();

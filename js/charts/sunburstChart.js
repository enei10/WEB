async function drawSunburst() {
  const rawData = await d3.dsv(";", "data/sunburst.csv", d3.autoType);
  const container = d3.select("#sunburst-chart");

  // Crear filtros únicos
  const anos  = Array.from(new Set(rawData.map(d => d.Ano)));
  const meses = Array.from(new Set(rawData.map(d => d.Mes)));

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

  // Sincronizar con filtro global y ocultar selects locales
  FilterBus.subscribe(({year, month}) => {
    if (year == null || !month) return;
    anoSelect.property("value", year);
    mesSelect.property("value", month);
    updateChart();
  });
  controlDiv.style("display", "none");

  function updateChart() {
    const selectedAno = anoSelect.property("value");
    const selectedMes = mesSelect.property("value");

    // Filtrar datos
    const data = rawData.filter(d => d.Ano == selectedAno && d.Mes == selectedMes);
    const rootData = buildHierarchy(data);

    // Borrar gráfico anterior
    container.select("svg").remove();
    container.select(".sunburst-legend").remove();

    // Recalcular jerarquía
    const hierarchy = d3.hierarchy(rootData)
      .sum(d => d.value)
      .sort((a, b) => b.value - a.value);

    const cardW = container.node().closest('.card')?.clientWidth || container.node().clientWidth || 928;
    const width = cardW;

    // === Radio dinámico (Opción A)
    const PAD = 8;
    function computeRadius(visibleDepth) {
      // visibleDepth = 2 (1 anillo) ó 3 (2 anillos)
      return (width / 2 - PAD) / visibleDepth;
    }
    let maxVisible = 2;                   // inicio: solo L1 (y1<=2)
    let radius = computeRadius(maxVisible);

    // Colores
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

    // --- LEYENDA SUNBURST ---
    const legendLabels = {
      "Presencia en línea": "Presencia en línea (B)",
      "Tiendas en línea": "Tiendas en línea (C)",
      "Servicios en línea": "Servicios en línea (D)",
      "Servicios TIC": "Servicios TIC (E)"
    };

    container.select(".sunburst-legend").remove();

    const l1Names = (root.children || []).map(d => d.data.name);

    const legend = container.append("div")
      .attr("class", "legend sunburst-legend")
      .style("margin-top", "10px");

    const items = legend.selectAll(".legend-item")
      .data(l1Names)
      .join("div")
      .attr("class", "legend-item")
      .each(function(name){
        d3.select(this).html(`
          <span class="swatch" style="background:${color(name)}"></span>
          <span>${legendLabels[name] || name}</span>
        `);
      });

    items.on("click", (event, name) => {
      const node = root.children.find(d => d.data.name === name);
      if (node) clicked({altKey:false}, node);
    });

    items.on("mouseenter", (event, name) => {
      const topName = name;
      g.selectAll("path").attr("opacity", d => {
        let p = d; while (p.depth > 1) p = p.parent;
        return p.data.name === topName ? 1 : 0.25;
      });
    }).on("mouseleave", () => {
      g.selectAll("path").attr("opacity", 1);
    });

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

    // ===== Click con suavizado del radio (tween)
    function clicked(event, p) {
      const nextFocus = p.parent || root;
      parent.datum(nextFocus);

      // Regla con p: raíz => 1 anillo; rama => 2 anillos
      const nextMaxVisible = (p === root) ? 2 : 3;

      // Targets para zoom angular/radial estándar
      root.each(d => d.target = {
        x0: Math.max(0, Math.min(1, (d.x0 - p.x0) / (p.x1 - p.x0))) * 2 * Math.PI,
        x1: Math.max(0, Math.min(1, (d.x1 - p.x0) / (p.x1 - p.x0))) * 2 * Math.PI,
        y0: Math.max(0, d.y0 - p.depth),
        y1: Math.max(0, d.y1 - p.depth)
      });

      const t = svg.transition().duration(event.altKey ? 7500 : 750);

      // Tween SUAVE del radio (de r0 a r1)
      const r0 = radius;
      const r1 = computeRadius(nextMaxVisible);

      t.tween("radius", () => {
        const ri = d3.interpolateNumber(r0, r1);
        return tt => {
          radius = ri(tt);
          arc.padRadius(radius * 1.5); // padding acompasa el radio
        };
      });

      // Círculo central: interpolar su 'r'
      parent.transition(t).attrTween("r", () => d3.interpolateNumber(r0, r1));

      // Cambiamos el tope de visibilidad (para filtros de opacidad/eventos)
      maxVisible = nextMaxVisible;

      // Transición de arcos
      path.transition(t)
        .tween("data", d => {
          const i = d3.interpolate(d.current, d.target);
          return tt => d.current = i(tt);
        })
        .filter(function(d) {
          return +this.getAttribute("fill-opacity") || arcVisible(d.target);
        })
        .attr("fill-opacity", d => arcVisible(d.target) ? (d.children ? 0.6 : 0.4) : 0)
        .attr("pointer-events", d => arcVisible(d.target) ? "auto" : "none")
        .attrTween("d", d => () => arc(d.current)); // usa el radio que va cambiando

      // Transición de etiquetas
      label
        .filter(function(d) {
          return +this.getAttribute("fill-opacity") || labelVisible(d.target);
        })
        .transition(t)
        .attr("fill-opacity", d => +labelVisible(d.target))
        .attrTween("transform", d => () => labelTransform(d.current));
    }

    function arcVisible(d) {
      return d.y1 <= maxVisible && d.y0 >= 1 && d.x1 > d.x0;
    }

    function labelVisible(d) {
      return d.y1 <= maxVisible && d.y0 >= 1 &&
         (d.y1 - d.y0) * (d.x1 - d.x0) > 0.03;
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

// Alluvial multi–periodos usando tabla larga:
//
// periodo_origen,periodo_destino,seccion_origen,seccion_destino,n_ruc,Tipo
// 202501,202502,A,O,1,Persona natural
// ...

async function drawAlluvial() {
  const container = d3.select("#alluvial-chart")
    .style("position", "relative");

  if (container.empty()) return;

  // --- Helper: esperar tamaño estable del card (igual idea que en sunburst) ---
  async function waitForStableSize(el, { minStabilityMs = 220, timeoutMs = 3000 } = {}) {
    return new Promise(resolve => {
      let last = el.clientWidth, lastChange = performance.now(), start = performance.now();
      const ro = new ResizeObserver(() => {
        const w = el.clientWidth;
        if (w !== last) { last = w; lastChange = performance.now(); }
      });
      ro.observe(el);
      (function check() {
        const now = performance.now();
        if ((now - lastChange >= minStabilityMs && last > 0) || (now - start >= timeoutMs)) {
          ro.disconnect();
          resolve();
        } else {
          requestAnimationFrame(check);
        }
      })();
    });
  }

  // Tooltip común
  const tip = container.selectAll(".alluvial-tooltip")
    .data([null])
    .join("div")
    .attr("class", "tooltip chart-tooltip alluvial-tooltip")
    .style("position", "absolute")
    .style("pointer-events", "none")
    .style("opacity", 0);

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  function showTip(event, html) {
    tip.interrupt().style("opacity", 0.98).html(html);

    const [mx, my] = d3.pointer(event, container.node());
    const pad = 8, shift = 14;

    const cw = container.node().clientWidth;
    const ch = container.node().clientHeight;
    const tw = tip.node().offsetWidth || 0;
    const th = tip.node().offsetHeight || 0;

    let left = mx + shift;
    let top  = my + shift;

    if (left + tw + pad > cw) left = mx - tw - shift;
    left = clamp(left, pad, cw - tw - pad);
    top  = clamp(top, pad, ch - th - pad);

    tip.style("left", `${left}px`).style("top", `${top}px`);
  }
  function hideTip() { tip.transition().duration(120).style("opacity", 0); }

  // --- Carga de datos ---
  const raw = await d3.dsv(";", "data/alluvial.csv", d3.autoType);

  // Lista de periodos ordenados
  const periodos = Array.from(new Set([
    ...raw.map(d => d.periodo_origen),
    ...raw.map(d => d.periodo_destino)
  ])).sort((a, b) => d3.ascending(+a, +b));

  const periodoIndex = new Map(periodos.map((p, i) => [p, i]));

  // Construir nodos y links base
  const nodeByKey = new Map();
  const baseNodes = [];
  const baseLinks = [];

  function getNode(periodo, seccion) {
    const key = `${periodo}-${seccion}`;
    if (!nodeByKey.has(key)) {
      nodeByKey.set(key, {
        id: key,
        period: periodo,
        seccion: seccion,
        name: seccion
      });
      baseNodes.push(nodeByKey.get(key));
    }
    return nodeByKey.get(key);
  }

  raw.forEach(row => {
    const src = getNode(row.periodo_origen, row.seccion_origen);
    const tgt = getNode(row.periodo_destino, row.seccion_destino);

    baseLinks.push({
      source: src.id,
      target: tgt.id,
      value: +row.n_ruc || 0,
      tipo: row.Tipo
    });
  });

  // Escala de color por sección
  const color = d3.scaleOrdinal()
    .domain(Array.from(new Set(baseNodes.map(d => d.seccion))))
    .range(d3.schemeCategory10);

  // Esperar fuentes + tamaño estable, luego renderizar
  try { await document.fonts?.ready; } catch (_) {}
  await waitForStableSize(container.node());
  render();

  const ro = new ResizeObserver(() => render());
  ro.observe(container.node());
  window.addEventListener("resize", () => render(), { passive: true });

  function render() {
    container.select("svg").remove();

    const cardEl = container.node().closest(".card");
    const width  = (cardEl ? cardEl.clientWidth : container.node().clientWidth) || 900;
    const height = 420;

    const margin = { top: 20, right: 20, bottom: 20, left: 20 };
    const innerWidth  = width  - margin.left - margin.right;
    const innerHeight = height - margin.top  - margin.bottom;

    const svg = container.append("svg")
      .attr("width", width)
      .attr("height", height);

    const g = svg.append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // Sankey configurado para respetar la columna por periodo
    const sankey = d3.sankey()
      .nodeId(d => d.id)
      .nodeWidth(14)
      .nodePadding(10)
      .nodeAlign((node, n) => periodoIndex.get(node.period)) // columna = periodo
      .extent([[0, 0], [innerWidth, innerHeight]]);

    // Copias para que sankey pueda mutar
    const graph = sankey({
      nodes: baseNodes.map(d => ({ ...d })),
      links: baseLinks.map(d => ({ ...d }))
    });

    // --- LINKS ---
    const link = g.append("g")
      .attr("fill", "none")
      .attr("stroke-opacity", 0.35)
      .selectAll("path")
      .data(graph.links)
      .join("path")
      .attr("d", d3.sankeyLinkHorizontal())
      .attr("stroke", d => color(d.source.seccion))
      .attr("stroke-width", d => Math.max(1, d.width));

    // --- NODOS ---
    const node = g.append("g")
      .selectAll("rect")
      .data(graph.nodes)
      .join("rect")
      .attr("x", d => d.x0)
      .attr("y", d => d.y0)
      .attr("height", d => Math.max(1, d.y1 - d.y0))
      .attr("width", d => d.x1 - d.x0)
      .attr("fill", d => color(d.seccion))
      .attr("stroke", "#333")
      .attr("stroke-width", 0.4);

    // --- Etiquetas de nodos ---
    const label = g.append("g")
      .attr("font-family", "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif")
      .attr("font-size", 11)
      .selectAll("text")
      .data(graph.nodes)
      .join("text")
      .attr("x", d => d.x0 < innerWidth / 2 ? d.x1 + 6 : d.x0 - 6)
      .attr("y", d => (d.y0 + d.y1) / 2)
      .attr("dy", "0.35em")
      .attr("text-anchor", d => d.x0 < innerWidth / 2 ? "start" : "end")
      .text(d => `${d.seccion} (${d.period})`);

    const fmtInt = d3.format(",d");

    // --- Interacción: tooltip en links ---
    link
      .on("mouseenter", () => tip.style("opacity", 0.98))
      .on("mousemove", (event, d) => {
        const html = `
          <div style="margin-bottom:4px;"><strong>${d.source.seccion} (${d.source.period}) → ${d.target.seccion} (${d.target.period})</strong></div>
          <div>n_ruc: <strong>${fmtInt(d.value || 0)}</strong></div>
          <div>Tipo: <strong>${d.tipo || "—"}</strong></div>
        `;
        showTip(event, html);

        // resaltar flujo
        link.attr("stroke-opacity", l => l === d ? 0.8 : 0.08);
        node.attr("opacity", n => (n === d.source || n === d.target) ? 1 : 0.3);
        label.attr("opacity", n => (n === d.source || n === d.target) ? 1 : 0.3);
      })
      .on("mouseleave", () => {
        hideTip();
        link.attr("stroke-opacity", 0.35);
        node.attr("opacity", 1);
        label.attr("opacity", 1);
      });

    // --- Interacción: tooltip en nodos ---
    node
      .on("mouseenter", () => tip.style("opacity", 0.98))
      .on("mousemove", (event, d) => {
        const inLinks  = graph.links.filter(l => l.target === d);
        const outLinks = graph.links.filter(l => l.source === d);

        const totalIn  = d3.sum(inLinks,  l => l.value);
        const totalOut = d3.sum(outLinks, l => l.value);

        const html = `
          <div style="margin-bottom:4px;"><strong>Sección ${d.seccion} (${d.period})</strong></div>
          <div>Total entradas: <strong>${fmtInt(totalIn)}</strong></div>
          <div>Total salidas: <strong>${fmtInt(totalOut)}</strong></div>
        `;
        showTip(event, html);

        link.attr("stroke-opacity", l =>
          (l.source === d || l.target === d) ? 0.8 : 0.05
        );
        node.attr("opacity", n => n === d ? 1 : 0.3);
        label.attr("opacity", n => n === d ? 1 : 0.3);
      })
      .on("mouseleave", () => {
        hideTip();
        link.attr("stroke-opacity", 0.35);
        node.attr("opacity", 1);
        label.attr("opacity", 1);
      });
  }
}

drawAlluvial();

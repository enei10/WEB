// js/charts/semiDonut.js — Semidonut en forma de "D" (panza → derecha), pegado a la izquierda
document.addEventListener("DOMContentLoaded", async () => {
  const host = d3.select("#semi-donut");
  if (host.empty()) return;

  // === 1) Datos desde paginas.csv (Año;Mes;Paginas) ===
  const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
  const raw = await d3.dsv(";", "data/paginas.csv", d3.autoType);

  // Suma de páginas por mes
  const sumByMes = d3.rollup(
    raw.filter(d => d.Mes && d.Paginas != null),
    v => d3.sum(v, d => +d.Paginas || 0),
    d => String(d.Mes).trim()
  );
  const data = MESES.map(m => ({ mes: m, value: sumByMes.get(m) || 0 }));

  // Cambia a true si quieres que el tamaño angular dependa del valor
  const USE_VALUES_FOR_ANGLE = false;

  // === 2) Render responsive ===
  function render() {
    host.selectAll("*").remove();

    const box = host.node().getBoundingClientRect();
    const W = Math.max(360, Math.min(1200, Math.floor(box.width || 720)));
    const H = Math.max(260, Math.round(W * 0.62));

    // Geometría del anillo delgado
    const outerR = Math.min(W, H * 1.9) * 0.48; // radio exterior
    const innerR = outerR * 0.82;              // radio interior (más grande = más delgado)
    const thickness = outerR - innerR;

    // Pegado a la izquierda: movemos el centro a outerR + margen
    const cx = outerR + 8;
    const cy = H / 2;

    const svg = host.append("svg").attr("width", W).attr("height", H);
    const g   = svg.append("g").attr("transform", `translate(${cx},${cy})`);

    // — Semicírculo DERECHO: de -90° (arriba) a +90° (abajo). Sin rotaciones extra —
    const pie = d3.pie()
      .sort(null)
      .value(d => USE_VALUES_FOR_ANGLE ? Math.max(1, d.value) : 1)
      .startAngle(-Math.PI / 2)
      .endAngle(Math.PI / 2);

    const arc = d3.arc()
      .innerRadius(innerR)
      .outerRadius(outerR)
      .cornerRadius(Math.min(5, thickness * 0.5));

    // Aro guía (gris claro) para toda la media dona
    const guide = d3.arc()
      .innerRadius(innerR)
      .outerRadius(outerR)
      .startAngle(-Math.PI/2 + 1e-4)
      .endAngle( Math.PI/2 - 1e-4);

    g.append("path")
      .attr("d", guide())
      .attr("fill", "#ECEFF1");

    // Colores por mes
    const color = d3.scaleOrdinal()
      .domain(MESES)
      .range(d3.schemeTableau10.concat(d3.schemeSet3).slice(0, MESES.length));

    // Tooltip
    const tip = host.append("div")
      .attr("class","tooltip")
      .style("position","absolute")
      .style("pointer-events","none")
      .style("opacity",0);

    // Pequeña separación entre porciones
    const gap = (Math.PI / data.length) * 0.18;

    // Gajos (forma de "D" garantizada)
    const arcs = g.append("g").selectAll("path.month")
      .data(pie(data))
      .join("path")
        .attr("class","month")
        .attr("fill", d => color(d.data.mes))
        .attr("d", d => {
          // aplicamos gap
          const a0 = d.startAngle + gap/2;
          const a1 = d.endAngle   - gap/2;
          return d3.arc()
            .innerRadius(innerR).outerRadius(outerR)
            .cornerRadius(Math.min(5, thickness*0.5))
            .startAngle(a0).endAngle(a1)();
        })
        .on("mousemove", (ev, d) => {
          tip.style("opacity",1)
             .html(`<strong>${d.data.mes}</strong><br/>Páginas: ${d3.format(",")(d.data.value)}`)
             .style("left", (ev.pageX + 14) + "px")
             .style("top",  (ev.pageY - 22) + "px");
        })
        .on("mouseleave", () => tip.style("opacity",0));

    // Etiquetas (opcionales). Si estorban, comenta este bloque.
    const labelR = (innerR + outerR) / 2;
    g.append("g").selectAll("text")
      .data(pie(data))
      .join("text")
        .attr("transform", d => {
          const a = (d.startAngle + d.endAngle)/2;
          return `translate(${Math.cos(a)*labelR},${Math.sin(a)*labelR})`;
        })
        .attr("text-anchor","middle")
        .attr("dominant-baseline","middle")
        .attr("font-size", 11)
        .attr("fill", "#111")
        .text(d => d.data.mes);
  }

  render();

  // — Se adapta a la caja/zoom —
  if ("ResizeObserver" in window) {
    new ResizeObserver(() => render()).observe(host.node());
  } else {
    window.addEventListener("resize", () => {
      clearTimeout(window.__semiDonutTO);
      window.__semiDonutTO = setTimeout(render, 120);
    }, { passive:true });
  }
});

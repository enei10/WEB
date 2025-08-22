// js/charts/semiDonut.js — Semicírculo 180° con nombres de meses visibles y texto interior (dos líneas)
// - Solo meses disponibles (sin rellenar faltantes)
// - Rotación instantánea (drag/rueda), sin tween de desplazamiento
// - Tooltip estable
// - Etiquetas (solo mes) rotadas tangencialmente, con tamaño auto y centradas radialmente
// - Texto DENTRO del semicírculo (en el hueco), pegado al borde derecho del radio interno

document.addEventListener("DOMContentLoaded", async () => {
  const host = d3.select("#semi-donut");
  if (host.empty()) return;

  const MESES = [
    "Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio",
    "Agosto","Septiembre","Octubre","Noviembre","Diciembre"
  ];

  const margin = { top: 16, right: 40, bottom: 28, left: 16 };

  // Tooltip
  const tooltip = host.append("div")
    .attr("class", "chart-tooltip")
    .style("position", "absolute")
    .style("pointer-events", "none")
    .style("opacity", 0);

  // Carga
  let recs;
  try { recs = await d3.dsv(";", "data/paginas.csv", d3.autoType); } catch (e) { recs = []; }
  recs = (recs || [])
    .filter(d => d.Año != null && d.Mes != null && MESES.includes(String(d.Mes).trim()))
    .map(d => ({ anio:+d.Año, mes:String(d.Mes).trim(), value:+d.Paginas||0 }));
  if (!recs.length) return;

  // Orden cronológico
  const mi = m => MESES.indexOf(m);
  recs.sort((a,b) => a.anio!==b.anio ? a.anio-b.anio : mi(a.mes)-mi(b.mes));

  const series = recs.slice(); // solo meses existentes

  // Colores por año
  const YEARS = Array.from(new Set(series.map(d => d.anio)));
  const baseRange = d3.schemeTableau10.concat(d3.schemeTableau10);
  const yearColor = d3.scaleOrdinal().domain(YEARS).range(baseRange);

  function render() {
    host.select("svg").remove();
    host.select(".year-legend").remove();

    const fullW = (host.node().clientWidth || 900);
    const width  = Math.max(320, fullW - margin.left - margin.right);
    const height = Math.max(420, Math.round(fullW * 0.5));

    const svgRoot = host.append("svg")
      .attr("viewBox", `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
      .attr("preserveAspectRatio", "xMidYMid meet")
      .style("width", "100%")
      .style("height", "auto");

    const svg = svgRoot.append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // Centro a la izquierda
    const cx = 0, cy = height / 2;
    const g = svg.append("g").attr("transform", `translate(${cx},${cy})`);

    const outerR = Math.min(height / 2, width - margin.right);
    const innerR = outerR * 0.60;

    // === Texto dinámico (dos líneas) DENTRO del semicírculo ===
    // Lo anclamos al borde derecho del radio interno (pegado hacia dentro)
    const vx = innerR /2;     // “pegado” a la derecha del hueco
    const vy = height / 2;      // centro vertical
    const valueG = svg.append("text")
      .attr("class", "semi-value")
      .attr("x", vx)
      .attr("y", vy)
      .attr("text-anchor", "middle")        // alinea el texto al borde interior derecho
      .attr("alignment-baseline", "middle");

    // Línea 1: "Mes Año"
    valueG.append("tspan")
      .attr("class", "sv-line1")
      .attr("x", vx)
      .attr("dy", "-0.25em");

    // Línea 2: "N,NNN páginas"
    valueG.append("tspan")
      .attr("class", "sv-line2")
      .attr("x", vx)
      .attr("dy", "1.2em");

    // Cabeza de flecha (apunta hacia abajo), centrada bajo el bloque de texto
    const arrow = svg.append("path")
      .attr("class", "semi-arrow")
      // triángulo con vértice abajo en (0,0) y base en y=-8
      .attr("d", "M0,0 L6,-8 L0,-8")
      .attr("opacity", 0.85);

    // === Flecha en modo POLAR ===
    const ARROW_POLAR = {
      rFactor: 0.95, // 0.0=centro, 1.0=radio interno, >1 hacia el arco
      angleDeg: 90,  // 0=derecha, 90=abajo, 180=izquierda, 270=arriba
      size: 1.0
    };

    function placeArrow(){
      const r = innerR * ARROW_POLAR.rFactor;
      const theta = ARROW_POLAR.angleDeg * Math.PI / 180;
      const ax = cx + r * Math.cos(theta);
      const ay = cy + r * Math.sin(theta);

      // El path por defecto apunta hacia abajo; rotamos (ángulo - 90) para alinear la punta
      arrow
        .attr("transform",
          `translate(${ax},${ay}) rotate(${ARROW_POLAR.angleDeg - 90}) scale(${ARROW_POLAR.size})`
        )
        .raise(); // asegura que quede encima de los segmentos
    }




    // Pie 180°
    const pie = d3.pie()
      .startAngle(Math.PI)
      .endAngle(0)
      .padAngle(0.002)
      .sort(null)
      .value(d => d.value);

    const arc       = d3.arc().innerRadius(innerR).outerRadius(outerR);
    const arcLabelR = (innerR + outerR) / 2;
    const arcLabel  = d3.arc().innerRadius(arcLabelR).outerRadius(arcLabelR);

    // Utilidades etiquetas
    function labelTransform(d){
      const [x,y] = arcLabel.centroid(d);
      const mid = (d.startAngle + d.endAngle) / 2;
      let rot = (mid * 180 / Math.PI) - 90;    // tangente
      if (rot > 90 || rot < -90) rot += 180;   // legible
      return `translate(${x},${y}) rotate(${rot})`;
    }
    function chordLength(d){
      const a = Math.max(0, d.endAngle - d.startAngle);
      return 2 * arcLabelR * Math.sin(a / 2);
    }
    function computeFontPx(text, d, minPx = 10, maxPx = 18){
      const chord  = Math.max(0, chordLength(d) - 8);      // ancho tangencial
      const radial = Math.max(0, (outerR - innerR) - 6);   // grosor de barra
      if (chord <= 0 || radial <= 0) return minPx;
      const maxByRadial = Math.max(minPx, Math.min(maxPx, radial * 0.7));
      const perChar = 0.6; // ~0.6 * fontPx
      const neededPx = chord / (perChar * Math.max(1, text.length));
      return Math.max(minPx, Math.min(maxByRadial, Math.floor(neededPx)));
    }
    const keyOf = d => `${d.anio}-${d.mes}`;


    // Estado
    let currentSeries = series.slice();
    let currentArcs   = pie(currentSeries);


    function draw(arcs){
      const slices = g.selectAll("g.slice").data(arcs, d => keyOf(d.data));

      // ENTER
      const enter = slices.enter().append("g").attr("class","slice");

      enter.append("path")
        .attr("class","segment")
        .attr("d", d => arc(d))
        .attr("fill", d => yearColor(d.data.anio))
        .on("mouseenter", function(evt,d){
          tooltip.interrupt().style("opacity",1).html(
            `<div style="display:flex;align-items:center;gap:8px;">
               <span style="width:10px;height:10px;background:${yearColor(d.data.anio)};display:inline-block;border-radius:2px"></span>
               <strong>${d.data.mes} ${d.data.anio}</strong>
             </div>
             ${d3.format(",")(d.data.value)} páginas`
          );
        })
        .on("mousemove", evt => {
          const [x,y] = d3.pointer(evt, host.node());
          tooltip.style("left", `${x+12}px`).style("top", `${y-10}px`);
        })
        .on("mouseleave", () => {
          tooltip.interrupt().transition().duration(120).style("opacity",0);
        });

      // Etiqueta (solo mes)
      enter.append("text")
        .attr("class","sd-label")
        .attr("text-anchor","middle")
        .attr("alignment-baseline","middle")
        .attr("dominant-baseline","middle")
        .attr("dy","0")
        .style("fill","#fff")
        .style("stroke","#000")
        .style("stroke-width","0.75")
        .style("paint-order","stroke")
        .style("font-family","system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif")
        .style("pointer-events","none")
        .attr("transform", d => labelTransform(d))
        .each(function(d){
          const txt = d.data.mes;
          const fs = computeFontPx(txt, d, 10, 18);
          d3.select(this)
            .style("font-size", fs + "px")
            .attr("opacity", 1)
            .text(txt);
        });

      // UPDATE
      const all = enter.merge(slices);

      all.select("path.segment")
        .attr("fill", d => yearColor(d.data.anio))
        .attr("d", d => arc(d));

      all.select("text.sd-label")
        .attr("alignment-baseline","middle")
        .attr("dominant-baseline","middle")
        .attr("dy","0")
        .attr("transform", d => labelTransform(d))
        .each(function(d){
          const txt = d.data.mes;
          const fs = computeFontPx(txt, d, 10, 18);
          d3.select(this)
            .style("font-size", fs + "px")
            .attr("opacity", 1)
            .text(txt);
        });

      // EXIT
      slices.exit().remove();

      // === Actualiza el texto interior (dos líneas) con el segmento "activo" (arcs[0]) ===
      if (arcs.length > 0) {
        const f = arcs[0].data;
        const fmt = d3.format(",");
        svg.select(".semi-value .sv-line1").text(`${f.mes} ${f.anio}`);
        svg.select(".semi-value .sv-line2").text(`${fmt(f.value)} páginas`);
      }
    }

    placeArrow();


    function update(nextSeries){
      const nextArcs = pie(nextSeries.slice());
      draw(nextArcs);
      currentArcs = nextArcs;
    }

    function shiftBy(dir = +1){
      const next = currentSeries.slice();
      if (dir > 0) next.unshift(next.pop());
      else next.push(next.shift());
      currentSeries = next;
      update(next);
    }

    // Drag por pasos
    const STEP_PX = 60;
    let accum = 0;
    g.call(
      d3.drag()
        .on("start", () => { accum = 0; })
        .on("drag", (ev) => {
          accum += ev.dx;
          while (accum >= STEP_PX) { shiftBy(+1); accum -= STEP_PX; }
          while (accum <= -STEP_PX){ shiftBy(-1); accum += STEP_PX; }
        })
    );

    // Rueda del mouse
    svgRoot.on("wheel", (ev) => {
      ev.preventDefault();
      shiftBy(ev.deltaY > 0 ? +1 : -1);
    });

    // Leyenda
    const legend = host.append("div")
      .attr("class", "year-legend")
      .style("display", "flex")
      .style("flex-wrap", "wrap")
      .style("gap", "8px 14px")
      .style("align-items", "center")
      .style("margin", "8px 6px 0 6px")
      .style("font", "12px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif");

    YEARS.forEach(y => {
      const item = legend.append("div")
        .style("display","inline-flex")
        .style("alignItems","center")
        .style("gap","6px");
      item.append("span")
        .style("width","10px").style("height","10px").style("borderRadius","2px")
        .style("display","inline-block").style("background", yearColor(y));
      item.append("span").text(y);
    });

    draw(currentArcs);
  }

  render();
  window.addEventListener("resize", render);
});
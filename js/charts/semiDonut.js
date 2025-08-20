// js/charts/semiDonut.js — Semicírculo 180° a la izquierda, ángulo ∝ páginas, color por AÑO + ruleta por arrastre
document.addEventListener("DOMContentLoaded", async () => {
  const host = d3.select("#semi-donut");
  if (host.empty()) return;

  const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio",
                 "Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

  const margin = { top: 16, right: 40, bottom: 28, left: 16 };

  // Tooltip (namespaciado al contenedor)
  const tooltip = host.append("div")
    .attr("class", "chart-tooltip")
    .style("position", "absolute")
    .style("pointer-events", "none")
    .style("opacity", 0);

  // 1) Cargar datos
  let recs;
  try {
    recs = await d3.dsv(";", "data/paginas.csv", d3.autoType);
  } catch (e) { recs = []; }

  recs = recs
    .filter(d => d.Año != null && d.Mes != null)
    .map(d => ({ anio:+d.Año, mes:String(d.Mes).trim(), value:+d.Paginas||0 }));

  if (!recs.length) return;

  // Orden cronológico
  const mi = m => MESES.indexOf(m);
  recs.sort((a,b) => a.anio!==b.anio ? a.anio-b.anio : mi(a.mes)-mi(b.mes));

  // Rango y serie completa (rellena meses faltantes con 0)
  const minY = recs[0].anio, minM = recs[0].mes;
  const maxY = recs[recs.length-1].anio, maxM = recs[recs.length-1].mes;

  const byYM = new Map(recs.map(r => [`${r.anio}-${r.mes}`, r.value]));
  const all = [];
  for (let y=minY; y<=maxY; y++) for (let m=0; m<12; m++) all.push({ anio:y, mes:MESES[m] });

  const startIdx = all.findIndex(d => d.anio===minY && d.mes===minM);
  const endIdx   = all.findIndex(d => d.anio===maxY && d.mes===maxM);
  const series   = all.slice(startIdx, endIdx+1).map(d => ({
    ...d, value: byYM.get(`${d.anio}-${d.mes}`) || 0
  }));

  // Dominios de años (para color)
  const YEARS = Array.from(new Set(series.map(d => d.anio)));
  const yearColor = d3.scaleOrdinal()
    .domain(YEARS)
    .range(d3.schemeTableau10.concat(d3.schemeTableau10)); // duplica por seguridad

  function render() {
    host.select("svg").remove();
    host.select(".year-legend").remove();

    const fullW = (host.node().clientWidth || 900);
    const width  = Math.max(320, fullW - margin.left - margin.right);
    const height = Math.max(580, Math.round(fullW * 0.5));

    const svgRoot = host.append("svg")
      .attr("viewBox", `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
      .attr("preserveAspectRatio", "xMidYMid meet")
      .style("width", "100%")
      .style("height", "auto");

    const svg = svgRoot.append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // Centro pegado a la izquierda
    const cx = 0, cy = height / 2;
    const g = svg.append("g").attr("transform", `translate(${cx},${cy})`);

    const outerR = Math.min(height / 2, width - margin.right);
    const innerR = outerR * 0.60;

    // Semicírculo 180°
    const startAngle = Math.PI; // 180°
    const endAngle   = 0;       // 0°

    const pie = d3.pie()
      .startAngle(startAngle)
      .endAngle(endAngle)
      .padAngle(0)
      .sort(null)
      .value(d => d.value); // ángulo proporcional

    const arc  = d3.arc().innerRadius(innerR).outerRadius(outerR);

    // --- Ruleta por arrastre: desplaza el orden de los meses con wrap-around ---

    const keyOf = d => `${d.anio}-${d.mes}`;

    // Estado
    let currentSeries = series.slice();
    let currentArcs   = pie(currentSeries);

    // Dibujo inicial (paths + eventos)
    const paths = g.selectAll("path.segment")
      .data(currentArcs, d => keyOf(d.data))
      .join("path")
      .attr("class", "segment")
      .attr("d", arc)
      .attr("fill", d => yearColor(d.data.anio))
      .attr("stroke", "none")
      .on("mouseenter", function(evt,d){
        d3.select(this).transition().duration(160)
          .attr("d", d3.arc().innerRadius(innerR-2).outerRadius(outerR+6));
        tooltip.style("opacity",1).html(
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
      .on("mouseleave", function(){
        d3.select(this).transition().duration(160).attr("d", arc);
        tooltip.transition().duration(100).style("opacity",0);
      });

    // Etiquetas rotadas (ligadas a currentArcs)
    const arcLabel = d3.arc()
      .innerRadius((innerR + outerR) / 2)
      .outerRadius((innerR + outerR) / 2);

    function labelTransform(d){
      const [x,y] = arcLabel.centroid(d);
      const ang = (d.startAngle + d.endAngle) / 2;
      let rot = ang * 180 / Math.PI - 90;   // tangente
      if (rot > 90 || rot < -90) rot += 180; // de pie
      return `translate(${x},${y}) rotate(${rot})`;
    }

    const labelsSel = g.selectAll("text.label")
      .data(currentArcs, d => keyOf(d.data))
      .join("text")
      .attr("class", "label")
      .attr("dy", "0.32em")
      .attr("text-anchor","middle")
      .attr("alignment-baseline","middle")
      .style("font-size","10px")
      .style("fill","#222")
      .style("pointer-events","none")
      .text(d => `${d.data.mes.slice(0,3)}-${d.data.anio}`)
      .attr("transform", d => labelTransform(d));

    // Redibuja con tween
    function update(nextSeries, duration = 320){
      const prevByKey = new Map(currentArcs.map(a => [keyOf(a.data), a]));
      currentSeries = nextSeries.slice();
      const nextArcs = pie(currentSeries);

      // paths
      g.selectAll("path.segment")
        .data(nextArcs, d => keyOf(d.data))
        .join(
          enter => enter,
          update => update
            .transition().duration(duration)
            .attrTween("d", function(d){
              const i = d3.interpolate(prevByKey.get(keyOf(d.data)) || d, d);
              return t => arc(i(t));
            }),
          exit => exit.remove()
        )
        .attr("fill", d => yearColor(d.data.anio));

      // labels
      g.selectAll("text.label")
        .data(nextArcs, d => keyOf(d.data))
        .join(
          enter => enter,
          update => update
            .text(d => `${d.data.mes.slice(0,3)}-${d.data.anio}`)
            .transition().duration(duration)
            .attrTween("transform", function(d){
              const i = d3.interpolate(prevByKey.get(keyOf(d.data)) || d, d);
              return t => labelTransform(i(t));
            }),
          exit => exit.remove()
        );

      currentArcs = nextArcs;
    }

    // Desplazar +1 / -1 (wrap)
    function shiftBy(dir = +1){
      const next = currentSeries.slice();
      if (dir > 0) next.unshift(next.pop());
      else next.push(next.shift());
      update(next);
    }

    // Drag por pasos
    const STEP_PX = 60;
    let accum = 0;

    const drag = d3.drag()
      .on("start", () => { accum = 0; })
      .on("drag", (ev) => {
        accum += ev.dx; // + derecha, - izquierda
        while (accum >= STEP_PX) { shiftBy(+1); accum -= STEP_PX; }
        while (accum <= -STEP_PX){ shiftBy(-1); accum += STEP_PX; }
      });

    g.call(drag);

    // Rueda del mouse (opcional)
    svgRoot.on("wheel", (ev) => {
      ev.preventDefault();
      shiftBy(ev.deltaY > 0 ? +1 : -1);
    });

    // Leyenda de AÑOS (simple y responsive)
    const legend = host.append("div")
      .attr("class", "year-legend")
      .style("display", "flex")
      .style("flex-wrap", "wrap")
      .style("gap", "8px 14px")
      .style("align-items", "center")
      .style("margin", "8px 6px 0 6px")
      .style("font", "12px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif");

    YEARS.forEach(y => {
      const item = legend.append("div").style("display","inline-flex").style("alignItems","center").style("gap","6px");
      item.append("span")
        .style("width","10px").style("height","10px").style("borderRadius","2px")
        .style("display","inline-block").style("background", yearColor(y));
      item.append("span").text(y);
    });

    // Posicionar estado inicial sin animación
    update(currentSeries, 0);
  }

  render();
  window.addEventListener("resize", render);
});

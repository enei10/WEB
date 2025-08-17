// js/charts/barTreemap100.js
// Requiere D3 v7+ cargado como lib/d3.min.js

const DATA_URL = "data/trustgrade.csv";
const SERIES   = ["A","B","C","D","E","F"];
const MONTHS   = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

// 100% normalizado (todas las barras misma altura)
const NORMALIZE_TO_PERCENT = true;

const color = d3.scaleOrdinal()
  .domain(SERIES)
  .range(d3.schemeTableau10.slice(0, SERIES.length));

// ------ layout creado desde JS ------
const host = d3.select("#bar-treemap");
host.selectAll("*").remove();

const wrap = host.append("div")
  .attr("class","bar-treemap-wrap")
  .style("max-width","1100px")
  .style("margin","24px auto");

wrap.append("h2")
  .attr("style","text-align:center;margin:0 0 12px;")
  .text("Trust Grade por categoría");

const controls = wrap.append("div")
  .style("display","flex")
  .style("gap","12px")
  .style("justify-content","center")
  .style("align-items","center")
  .style("margin-bottom","10px");

const yearSel  = controls.append("label").text("Año ").append("select").attr("id","bt-year");
const monthSel = controls.append("label").text("Mes ").append("select").attr("id","bt-month");

const stage = wrap.append("div").attr("class","bt-stage");

// Tooltip fijo
const tooltip = wrap.append("div")
  .style("position","fixed")
  .style("pointer-events","none")
  .style("padding","6px 8px")
  .style("border","1px solid #ddd")
  .style("border-radius","6px")
  .style("background","#fff")
  .style("box-shadow","0 2px 6px rgba(0,0,0,0.08)")
  .style("opacity",0);

// ========== CARGA ==========
async function loadData() {
  const raw = await d3.text(DATA_URL);
  const delim = raw.includes(";") ? ";" : ",";
  const parse = d3.dsvFormat(delim).parse;

  return parse(raw, d3.autoType).map(d => ({
    Año: +d["Año"],
    Mes: String(d["Mes"]),
    Categorías: String(d["Categorías"]),
    ...Object.fromEntries(SERIES.map(s => [s, d[s] != null ? +d[s] : 0]))
  }));
}

// ========== UI ==========
function initSelectors(data) {
  const years = Array.from(new Set(data.map(d => d.Año))).sort((a,b)=>a-b);
  const months = Array.from(new Set(data.map(d => d.Mes)))
    .sort((a,b)=>MONTHS.indexOf(a) - MONTHS.indexOf(b));

  yearSel.selectAll("option").data(years).join("option")
    .attr("value", d => d).text(d => d);
  monthSel.selectAll("option").data(months).join("option")
    .attr("value", d => d).text(d => d);

  yearSel.property("value", years[years.length - 1]);
  monthSel.property("value", months[months.length - 1]);
}

// Orden fijo de categorías
const orderMap = {
  "Presencia Pasiva (B1)": 1,
  "Presencia Activa (B2)": 2,
  "Tiendas en línea (C)": 3,
  "Servicios en línea (D)": 4,
  "Servicios TIC (E)": 5
};

function buildRows(data, year, month) {
  const filtered = data.filter(d => d.Año === +year && d.Mes === month);
  const byCat = d3.group(filtered, d => d.Categorías);

  const rows = Array.from(byCat, ([cat, rowsCat]) => {
    const sums = Object.fromEntries(SERIES.map(s => [s, d3.sum(rowsCat, r => r[s] || 0)]));
    const total = d3.sum(SERIES, s => sums[s]);
    return { category: cat, total, ...sums };
  }).filter(r => r.total > 0);

  rows.sort((a, b) => (orderMap[a.category] ?? 999) - (orderMap[b.category] ?? 999));
  return rows;
}

// ========== DIBUJO ==========
function drawBarTreemap(rows) {
  stage.selectAll("*").remove();

  const width  = Math.min(1100, stage.node().clientWidth || 960);
  const height = 520;

  // Más espacio arriba para la leyenda
  const margin = { top: 100, right: 20, bottom: 90, left: 70 };

  const svg = stage.append("svg").attr("width", width).attr("height", height);

  // ---- LEYENDA ARRIBA (fuera del grupo principal) ----
  const legend = svg.append("g")
    .attr("transform", `translate(${margin.left}, 30)`);
  const LSPACE = 110;
  legend.selectAll("g.item")
    .data(SERIES)
    .join("g")
    .attr("class","item")
    .attr("transform",(d,i)=>`translate(${i*LSPACE},0)`)
    .call(s => {
      s.append("rect").attr("width",14).attr("height",14).attr("rx",3).attr("fill", d => color(d));
      s.append("text").attr("x",20).attr("y",12).attr("font-size",12).text(d => d);
    });

  // ---- GRUPO PRINCIPAL ----
  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
  const innerW = width  - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  const categories = rows.map(d => d.category);

  // X: ancho fijo por categoría
  const x = d3.scaleBand()
    .domain(categories)
    .range([0, innerW])
    .paddingInner(0.12)
    .paddingOuter(0.04);

  // Y en porcentaje (0..1) para altura constante (100%)
  const y = d3.scaleLinear()
    .domain([0, 1])
    .range([innerH, 0]);

  // Eje Y en %
  const yAxis = d3.axisLeft(y).ticks(6).tickFormat(d3.format(".0%"));
  g.append("g").call(yAxis);
  g.append("text")
    .attr("x",0).attr("y",-10)
    .attr("fill","#555").attr("font-weight",600)
    .text("%");

  // Eje X con etiquetas PLANAS (0°)
  const xAxis = d3.axisBottom(x);
  g.append("g")
    .attr("transform", `translate(0,${innerH})`)
    .call(xAxis)
    .selectAll("text")
    .attr("transform", "rotate(0)")
    .style("text-anchor", "middle")
    .attr("dy", "0.9em");

  // Treemap dentro de cada barra (altura 100%)
  const barGroups = g.selectAll("g.bar")
    .data(rows)
    .join("g")
    .attr("class","bar")
    .attr("transform", d => `translate(${x(d.category)}, ${y(1)})`);

  barGroups.each(function(row) {
    const barW = x.bandwidth();
    const barH = innerH - y(1); // altura total (100%)

    const root = d3.hierarchy({
      name: row.category,
      children: SERIES.map(s => ({ name: s, value: row[s] || 0 }))
    }).sum(d => d.value);

    d3.treemap()
      .size([barW, barH])
      .paddingInner(2)
      .round(true)(root);

    const gBar = d3.select(this);
    const nodes = root.leaves().filter(n => n.value > 0);
    const total = row.total || 1;

    const cells = gBar.selectAll("g.cell")
      .data(nodes, d => d.data.name)
      .join("g")
      .attr("class","cell");

    cells.append("rect")
      .attr("x", d => d.x0)
      .attr("y", d => d.y0)
      .attr("width",  d => Math.max(0, d.x1 - d.x0))
      .attr("height", d => Math.max(0, d.y1 - d.y0))
      .attr("fill", d => color(d.data.name))
      .on("mousemove", (event, d) => {
        const {clientX, clientY} = event;
        const pct = d.value / total;
        tooltip.style("left", `${clientX + 12}px`)
          .style("top", `${clientY + 12}px`)
          .style("opacity", 1)
          .html(
            `<div><strong>${row.category}</strong></div>
             <div>Serie: <b>${d.data.name}</b></div>
             <div>Valor: <b>${d.value.toLocaleString()}</b></div>
             <div>Participación: <b>${d3.format(".1%")(pct)}</b></div>`
          );
      })
      .on("mouseleave", () => tooltip.style("opacity",0));

    // Etiquetas internas (si hay espacio)
    cells.append("text")
      .attr("x", d => d.x0 + 4)
      .attr("y", d => d.y0 + 14)
      .attr("fill", "white")
      .attr("font-size", 11)
      .attr("pointer-events", "none")
      .text(d => {
        const pct = d.value / total;
        return (d.x1 - d.x0) > 34 && (d.y1 - d.y0) > 16 ? `${d.data.name} ${d3.format(".0%")(pct)}` : "";
      });
  });
}

// ========== CONTROLADOR ==========
(async function main(){
  const data = await loadData();
  initSelectors(data);

  function update() {
    const year  = +yearSel.property("value");
    const month = monthSel.property("value");
    const rows  = buildRows(data, year, month);
    drawBarTreemap(rows);
  }

  yearSel.on("change", update);
  monthSel.on("change", update);
  window.addEventListener("resize", update, { passive: true });

  update();
})();

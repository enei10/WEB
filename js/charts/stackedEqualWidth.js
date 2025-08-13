// js/charts/stackedEqualWidth.js
// Requiere D3 v7+ ya cargado en lib/d3.min.js

const DATA_URL = "data/trustgrade.csv";
const SERIES = ["A","B","C","D","E","F"];
const MONTH_ORDER = [
  "Enero","Febrero","Marzo","Abril","Mayo","Junio",
  "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"
];

const color = d3.scaleOrdinal().domain(SERIES).range(d3.schemeTableau10.slice(0, SERIES.length));

// ----- crea layout (controles + área svg) dentro de #mekko-chart -----
const hostId = "mekko-chart"; // usa el mismo contenedor que ya agregaste
const host = d3.select(`#${hostId}`);
host.selectAll("*").remove();

const wrap = host.append("div").attr("class","stacked-wrap").style("max-width","1100px").style("margin","24px auto");
wrap.append("h2").attr("style","text-align:center;margin:0 0 12px;").text("Composición por categoría (Ancho fijo)");

const controls = wrap.append("div")
  .attr("class","stacked-controls")
  .style("display","flex")
  .style("gap","12px")
  .style("justify-content","center")
  .style("align-items","center")
  .style("margin-bottom","10px");

const yearSel  = controls.append("label").text("Año ").append("select").attr("id","stacked-year");
const monthSel = controls.append("label").text("Mes ").append("select").attr("id","stacked-month");

const chartDiv = wrap.append("div").attr("class","stacked-stage");

const tooltip = wrap.append("div")
  .style("position","fixed")
  .style("pointer-events","none")
  .style("padding","6px 8px")
  .style("border","1px solid #ddd")
  .style("border-radius","6px")
  .style("background","#fff")
  .style("box-shadow","0 2px 6px rgba(0,0,0,0.08)")
  .style("opacity",0);

// ---------- carga y parsing ----------
async function loadTrustgrade() {
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

// ---------- UI ----------
function initSelectors(data) {
  const years = Array.from(new Set(data.map(d => d.Año))).sort((a,b)=>a-b);
  const months = Array.from(new Set(data.map(d => d.Mes)))
    .sort((a,b)=>MONTH_ORDER.indexOf(a) - MONTH_ORDER.indexOf(b));

  yearSel.selectAll("option")
    .data(years).join("option")
    .attr("value", d => d).text(d => d);

  monthSel.selectAll("option")
    .data(months).join("option")
    .attr("value", d => d).text(d => d);

  yearSel.property("value", years[years.length - 1]);
  monthSel.property("value", months[months.length - 1]);
}

function dataFor(data, year, month) {
  const filtered = data.filter(d => d.Año === +year && d.Mes === month);
  const byCat = d3.group(filtered, d => d.Categorías);
  const categories = Array.from(byCat.keys());

  return categories.map(cat => {
    const rows = byCat.get(cat);
    const sums = Object.fromEntries(SERIES.map(s => [s, d3.sum(rows, r => r[s] || 0)]));
    const total = d3.sum(SERIES, s => sums[s]);
    return { category: cat, total, ...sums };
  }).filter(r => r.total > 0);
}

// ---------- dibujo (ancho fijo, altura en valores absolutos) ----------
function drawStacked(rows) {
  chartDiv.selectAll("*").remove();

  const width  = Math.min(1000, chartDiv.node().clientWidth || 900);
  const height = 480;
  const margin = { top: 30, right: 20, bottom: 90, left: 70 };

  const svg = chartDiv.append("svg").attr("width", width).attr("height", height);
  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  // Orden de categorías (opcional: por total desc). Quita la línea si deseas orden original del CSV.
  rows.sort((a,b)=>d3.descending(a.total, b.total));

  const categories = rows.map(d => d.category);
  const maxTotal   = d3.max(rows, d => d.total) || 1;

  // X: bandas de igual ancho
  const x = d3.scaleBand()
    .domain(categories)
    .range([0, innerW])
    .paddingInner(0.12)
    .paddingOuter(0.04);

  // Y: escala de valores absolutos (altura ∝ total)
  const y = d3.scaleLinear()
    .domain([0, maxTotal])
    .nice()
    .range([innerH, 0]);

  // Ejes
  const yAxis = d3.axisLeft(y).ticks(6).tickFormat(d => d.toLocaleString());
  g.append("g").call(yAxis);
  g.append("text")
    .attr("x", 0).attr("y", -10)
    .attr("fill","#555").attr("font-weight",600)
    .text("Total por categoría");

  const xAxis = d3.axisBottom(x);
  g.append("g")
    .attr("transform", `translate(0,${innerH})`)
    .call(xAxis)
    .selectAll("text")
    .style("text-anchor","end")
    .attr("transform","rotate(-35)")
    .attr("dx","-0.6em").attr("dy","0.4em");

  // Apilar datos por serie (d3.stack produce y0,y1 en valores absolutos)
  const stackGen = d3.stack().keys(SERIES);
  const stacked = stackGen(rows.map(r => Object.fromEntries([["category", r.category], ...SERIES.map(s => [s, r[s]])])));

  // Grupos por serie
  const serieG = g.selectAll("g.serie")
    .data(stacked, d => d.key)
    .join("g")
    .attr("class","serie")
    .attr("fill", d => color(d.key));

  // Rectángulos apilados
  serieG.selectAll("rect")
    .data(d => d.map(e => ({key: d.key, category: categories[e.data.category ? categories.indexOf(e.data.category) : e.index] || e.data.category, y0: e[0], y1: e[1], value: (e[1] - e[0])})))
    .join("rect")
    .attr("x", (d,i) => x(d.category))
    .attr("width", x.bandwidth())
    .attr("y", d => y(d.y1))
    .attr("height", d => Math.max(0, y(d.y0) - y(d.y1)))
    .on("mousemove", (event, d) => {
      const {clientX, clientY} = event;
      tooltip.style("left", `${clientX + 12}px`).style("top", `${clientY + 12}px`)
        .style("opacity", 1)
        .html(
          `<div><strong>${d.category}</strong></div>
           <div>Serie: <b>${d.key}</b></div>
           <div>Valor: <b>${d.value.toLocaleString()}</b></div>`
        );
    })
    .on("mouseleave", () => tooltip.style("opacity", 0));

  // Total encima de cada barra
  g.selectAll("text.total")
    .data(rows)
    .join("text")
    .attr("class","total")
    .attr("x", d => x(d.category) + x.bandwidth()/2)
    .attr("y", d => y(d.total) - 6)
    .attr("text-anchor","middle")
    .attr("font-size", 11)
    .attr("fill", "#555")
    .text(d => d.total.toLocaleString());

  // Leyenda
  const legend = svg.append("g").attr("transform", `translate(${margin.left}, ${height - margin.bottom + 18})`);
  const LSPACE = 110;
  legend.selectAll("g.item")
    .data(SERIES)
    .join("g").attr("class","item")
    .attr("transform",(d,i)=>`translate(${i*LSPACE},0)`)
    .call(s => {
      s.append("rect").attr("width",14).attr("height",14).attr("rx",3).attr("fill", d => color(d));
      s.append("text").attr("x",20).attr("y",12).attr("font-size",12).text(d => d);
    });
}

// ---------- controlador ----------
(async function main() {
  const data = await loadTrustgrade();
  initSelectors(data);

  function update() {
    const year = +yearSel.property("value");
    const month = monthSel.property("value");
    const rows = dataFor(data, year, month);
    drawStacked(rows);
  }

  yearSel.on("change", update);
  monthSel.on("change", update);
  window.addEventListener("resize", update, { passive: true });

  update(); // primer render
})();

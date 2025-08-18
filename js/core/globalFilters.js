// js/core/globalFilters.js
(function () {
  async function computeAndRender() {
    const sources = [
      { path: "data/heartbeat.csv",  y: ["Año","Ano","Year"], m: ["Mes","Month"] },
      { path: "data/sunburst.csv",   y: ["Año","Ano","Year"], m: ["Mes","Month"] },
      { path: "data/trustgrade.csv", y: ["Año","Ano","Year"], m: ["Mes","Month"] },
      { path: "data/footprint.csv",  y: ["Año","Ano","Year"], m: ["Mes","Month"] },
    ];

    const { years, byYear } = await Availability.computeIntersection(sources);

    // Ordenar meses por índice canónico
    for (const y in byYear) {
      byYear[y] = DateUtils.sortMonths(byYear[y]);
    }

    const initial = years.length ? { year: years[0], month: byYear[years[0]][0] } : { year: null, month: null };

    const panel = d3.select("#global-filter-panel").classed("global-filters", true);
    panel.html("");
    panel.append("label").attr("for", "gf-year").text("Año:");
    const yearSel = panel.append("select").attr("id","gf-year");
    panel.append("label").attr("for", "gf-month").text("Mes:");
    const monthSel = panel.append("select").attr("id","gf-month");

    yearSel.selectAll("option").data(years).join("option")
      .attr("value", d=>d).text(d=>d);
    yearSel.property("value", initial.year);

    function fillMonths(y){
      const months = byYear[y] || [];
      monthSel.selectAll("option").data(months).join("option")
        .attr("value", d=>d).text(d=>d);
      if (!months.includes(monthSel.property("value"))) {
        monthSel.property("value", months[0] || "");
      }
    }
    fillMonths(initial.year);

    yearSel.on("change", () => {
      const y = +yearSel.property("value");
      fillMonths(y);
      const m = monthSel.property("value");
      window.FilterBus.set({ year: y, month: m });
    });
    monthSel.on("change", () => {
      window.FilterBus.set({
        year: +yearSel.property("value"),
        month: monthSel.property("value")
      });
    });

    window.FilterBus.set(initial);
  }

  document.addEventListener("DOMContentLoaded", computeAndRender);
})();
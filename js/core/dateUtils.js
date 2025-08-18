// js/core/dateUtils.js
(function () {
  const MONTHS = [
    "Enero","Febrero","Marzo","Abril","Mayo","Junio",
    "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"
  ];
  function monthIdx(m){ return MONTHS.indexOf(String(m)); }
  function sortMonths(arr){ return [...arr].sort((a,b)=>monthIdx(a)-monthIdx(b)); }

  window.DateUtils = { MONTHS, monthIdx, sortMonths };
})();

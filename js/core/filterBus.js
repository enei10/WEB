// js/core/filterBus.js
(function () {
  const subs = new Set();
  let state = { year: null, month: null };

  window.FilterBus = {
    get() { return { ...state }; },
    set(next) {
      state = { ...state, ...next };
      subs.forEach(fn => fn({ ...state }));
    },
    subscribe(fn) { subs.add(fn); fn({ ...state }); return () => subs.delete(fn); }
  };
})();

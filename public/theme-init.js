// Mantém a mesma chave e os mesmos valores de src/lib/theme/theme.ts.
(function () {
  try {
    var stored = localStorage.getItem('lifeos:theme');
    var pref = stored === 'light' || stored === 'dark' ? stored : 'system';
    var dark =
      pref === 'dark' ||
      (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  } catch (e) {
    document.documentElement.dataset.theme = 'light';
  }
})();

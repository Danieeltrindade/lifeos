// Mantém as mesmas chaves e valores de src/lib/theme/theme.ts e src/lib/theme/palettes.ts.
// Roda antes da primeira pintura: modo (claro/escuro) e paleta já chegam aplicados.
(function () {
  var root = document.documentElement;
  try {
    var stored = localStorage.getItem('lifeos:theme');
    var pref = stored === 'light' || stored === 'dark' ? stored : 'system';
    var dark =
      pref === 'dark' ||
      (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    root.dataset.theme = dark ? 'dark' : 'light';
    root.style.colorScheme = dark ? 'dark' : 'light';
  } catch (e) {
    root.dataset.theme = 'light';
  }
  try {
    var palettes = [
      'ocean',
      'nebula',
      'forest',
      'ember',
      'midnight',
      'rose',
      'crimson',
      'amethyst',
      'gold',
      'arctic',
      'mono',
    ];
    var accent = localStorage.getItem('lifeos:accent');
    root.dataset.accent = palettes.indexOf(accent) >= 0 ? accent : 'ocean';
  } catch (e) {
    root.dataset.accent = 'ocean';
  }
})();

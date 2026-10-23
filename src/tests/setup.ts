import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';
import { installMatchMedia } from './match-media';

// Páginas são carregadas sob demanda (lazy). Com a suíte inteira rodando em paralelo numa máquina
// carregada (observado no Windows), o primeiro import de um módulo pode passar de 1 s — o limite
// padrão de findBy/waitFor. 5 s dá margem sem mascarar falhas reais: um elemento que nunca aparece
// continua falhando.
configure({ asyncUtilTimeout: 5000 });

beforeEach(() => {
  installMatchMedia(false);
  window.scrollTo = () => undefined;
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  delete document.documentElement.dataset.theme;
  document.documentElement.style.colorScheme = '';
});

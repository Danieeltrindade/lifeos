import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { installMatchMedia } from '@/tests/match-media';
import { THEME_STORAGE_KEY } from './theme';
import { ThemeProvider } from './ThemeProvider';

function renderToggle() {
  return render(
    <ThemeProvider>
      <ThemeToggle />
    </ThemeProvider>,
  );
}

const root = () => document.documentElement;

describe('ThemeProvider + ThemeToggle', () => {
  it('aplica o tema do sistema por padrão', () => {
    installMatchMedia(true);
    renderToggle();
    expect(root().dataset.theme).toBe('dark');
    expect(screen.getByRole('radio', { name: /sistema/i })).toHaveAttribute('aria-checked', 'true');
  });

  it('aplica e persiste a escolha do usuário', async () => {
    const user = userEvent.setup();
    renderToggle();
    await user.click(screen.getByRole('radio', { name: /escuro/i }));
    expect(root().dataset.theme).toBe('dark');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');

    await user.click(screen.getByRole('radio', { name: /claro/i }));
    expect(root().dataset.theme).toBe('light');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
  });

  it('restaura a preferência salva ao iniciar', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    renderToggle();
    expect(root().dataset.theme).toBe('dark');
    expect(screen.getByRole('radio', { name: /escuro/i })).toHaveAttribute('aria-checked', 'true');
  });

  it('acompanha mudanças do sistema enquanto a preferência é "system"', () => {
    const setSystemDark = installMatchMedia(false);
    renderToggle();
    expect(root().dataset.theme).toBe('light');
    act(() => {
      setSystemDark(true);
    });
    expect(root().dataset.theme).toBe('dark');
  });

  it('ignora mudanças do sistema quando há escolha explícita', async () => {
    const setSystemDark = installMatchMedia(false);
    const user = userEvent.setup();
    renderToggle();
    await user.click(screen.getByRole('radio', { name: /claro/i }));
    act(() => {
      setSystemDark(true);
    });
    expect(root().dataset.theme).toBe('light');
  });

  it('é operável por teclado (setas)', async () => {
    const user = userEvent.setup();
    renderToggle();
    screen.getByRole('radio', { name: /sistema/i }).focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: /claro/i })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: /claro/i })).toHaveFocus();
    expect(root().dataset.theme).toBe('light');
  });
});

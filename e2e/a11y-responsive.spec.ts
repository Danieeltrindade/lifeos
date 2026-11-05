/**
 * Acessibilidade e responsividade (Fase 5, §7), com dados reais numa conta de teste:
 *  - axe-core (WCAG 2.1 A/AA) em cada tela, nos temas claro e escuro;
 *  - nenhuma rolagem horizontal da página em 360, 390, 768, 1024, 1280 e 1440 px;
 *  - navegação por teclado: "Pular para o conteúdo", diálogo abre/fecha e o foco volta.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser } from '@playwright/test';
import { seedViaApi, signUpAndConfirm } from './support';

type AxePage = ConstructorParameters<typeof AxeBuilder>[0]['page'];

const ROUTES = [
  '/',
  '/estudos',
  '/estudos/cronometro',
  '/estudos/revisoes',
  '/tarefas',
  '/projetos',
  '/calendario',
  '/calendario/planejar',
  '/metas',
  '/habitos',
  '/atividades',
  '/notas',
  '/notas/nova',
  '/analises',
  '/analises/tarefas',
  '/analises/metas',
  '/analises/atividades',
  '/analises/semana',
  '/recomendacoes',
  '/configuracoes',
  '/rota-que-nao-existe',
];
/** Telas sem login. */
const PUBLIC_ROUTES = ['/entrar', '/cadastro', '/recuperar-senha'];
const WIDTHS = [360, 390, 768, 1024, 1280, 1440];
const STATE = 'test-results/e2e/a11y-state.json';

async function contextFor(browser: Browser, width: number, theme: 'light' | 'dark') {
  const context = await browser.newContext({
    storageState: STATE,
    viewport: { width, height: 900 },
    colorScheme: theme,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
  });
  await context.addInitScript((t) => {
    localStorage.setItem('lifeos:theme', t);
  }, theme);
  return context;
}

test.describe.serial('acessibilidade e responsividade', () => {
  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext({ locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
    const page = await context.newPage();
    await signUpAndConfirm(page, 'Acessibilidade');
    const { subjectId, projectId } = await seedViaApi(page);
    ROUTES.push(`/estudos/materias/${subjectId}`, `/projetos/${projectId}`);
    await context.storageState({ path: STATE });
    await context.close();
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`axe sem violações (tema ${theme})`, async ({ browser }) => {
      const context = await contextFor(browser, 1280, theme);
      const page = await context.newPage();
      const report: string[] = [];
      for (const route of ROUTES) {
        await page.goto(route);
        await expect(page.locator('main h1, main h2').first()).toBeVisible();
        await page.waitForLoadState('networkidle');
        // O @axe-core/playwright tipa a página com a versão do playwright-core que ele resolve; em
        // tempo de execução só usa a API estável (evaluate/frames).
        const results = await new AxeBuilder({ page: page as unknown as AxePage })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
          .analyze();
        for (const v of results.violations) {
          report.push(
            `${route} · ${v.id} (${v.impact ?? '?'}) · ${String(v.nodes.length)}× · ${v.nodes
              .slice(0, 3)
              .map((n) => n.target.join(' '))
              .join(' | ')}`,
          );
        }
      }
      await context.close();
      const anon = await browser.newContext({ colorScheme: theme, locale: 'pt-BR' });
      await anon.addInitScript((t) => {
        localStorage.setItem('lifeos:theme', t);
      }, theme);
      const publicPage = await anon.newPage();
      for (const route of PUBLIC_ROUTES) {
        await publicPage.goto(route);
        await expect(publicPage.locator('h1').first()).toBeVisible();
        const results = await new AxeBuilder({ page: publicPage as unknown as AxePage })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
          .analyze();
        for (const v of results.violations) {
          report.push(`${route} · ${v.id} (${v.impact ?? '?'}) · ${String(v.nodes.length)}×`);
        }
      }
      await anon.close();
      expect(report, report.join('\n')).toEqual([]);
    });
  }

  for (const width of WIDTHS) {
    test(`sem rolagem horizontal em ${String(width)} px (claro e escuro)`, async ({ browser }) => {
      const problems: string[] = [];
      for (const theme of ['light', 'dark'] as const) {
        const context = await contextFor(browser, width, theme);
        const page = await context.newPage();
        const errors: string[] = [];
        page.on('pageerror', (e) => errors.push(e.message));
        // Inclui violações da Content-Security-Policy de produção (o preview usa os mesmos cabeçalhos).
        page.on('console', (m) => {
          if (m.type() === 'error') errors.push(m.text().slice(0, 200));
        });
        for (const route of ROUTES) {
          await page.goto(route);
          await expect(page.locator('main h1, main h2').first()).toBeVisible();
          await page.waitForLoadState('networkidle');
          const overflow = await page.evaluate(
            () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
          );
          if (overflow > 0) problems.push(`${theme} ${route}: ${String(overflow)} px além da tela`);
        }
        problems.push(...errors.map((e) => `${theme}: erro de JS ${e}`));
        await context.close();
        const anon = await browser.newContext({
          viewport: { width, height: 900 },
          colorScheme: theme,
        });
        const publicPage = await anon.newPage();
        for (const route of PUBLIC_ROUTES) {
          await publicPage.goto(route);
          await expect(publicPage.locator('h1').first()).toBeVisible();
          const overflow = await publicPage.evaluate(
            () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
          );
          if (overflow > 0) problems.push(`${theme} ${route}: ${String(overflow)} px além da tela`);
        }
        await anon.close();
      }
      expect(problems, problems.join('\n')).toEqual([]);
    });
  }

  test('teclado: pular para o conteúdo, abrir e fechar diálogo, foco volta', async ({
    browser,
  }) => {
    const context = await contextFor(browser, 1280, 'light');
    const page = await context.newPage();
    await page.goto('/tarefas');
    await expect(page.getByRole('heading', { name: 'Tarefas', level: 1 })).toBeVisible();
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Pular para o conteúdo' });
    await expect(skip).toBeFocused();
    await page.keyboard.press('Enter');
    // Primeiro controle do conteúdo recebe o foco a seguir, não a barra lateral.
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Nova tarefa' }).first()).toBeFocused();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Nova tarefa' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel('Título')).toBeFocused();
    // Foco preso no diálogo: Tab e Shift+Tab nunca saem dele.
    for (const key of ['Shift+Tab', 'Shift+Tab', 'Tab', 'Tab', 'Tab']) {
      await page.keyboard.press(key);
      expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('button', { name: 'Nova tarefa' }).first()).toBeFocused();
    // Foco visível (anel) no botão focado.
    const outline = await page
      .getByRole('button', { name: 'Nova tarefa' })
      .first()
      .evaluate((el) => {
        const s = getComputedStyle(el);
        return `${s.outlineStyle} ${s.outlineWidth} ${s.boxShadow}`;
      });
    expect(outline).not.toBe('none 0px none');
    await context.close();
  });
});

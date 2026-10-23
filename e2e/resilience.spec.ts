/**
 * Falhas de rede (Fase 5, §6): o pior caso é o servidor GRAVAR e a resposta se perder no caminho.
 * O app mostra erro, o usuário tenta de novo — e não pode surgir um registro duplicado.
 */
import { expect, test, type Page } from '@playwright/test';
import { signUpAndConfirm } from './support';

/** Deixa a primeira escrita (POST) em `path` chegar ao servidor e corta a resposta. */
async function loseFirstResponse(page: Page, path: string) {
  let lost = false;
  await page.route(`**/rest/v1/${path}*`, async (route) => {
    if (lost || route.request().method() !== 'POST') return route.fallback();
    lost = true;
    await route.fetch(); // o servidor grava…
    await route.abort('connectionreset'); // …e o navegador nunca recebe a resposta
  });
  return () => lost;
}

test.describe.serial('resposta perdida não duplica registros', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await (
      await browser.newContext({ locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' })
    ).newPage();
    await signUpAndConfirm(page, 'Rede Instável');
  });

  test.afterAll(async () => {
    await page.context().close();
  });

  test('tarefa', async () => {
    const lost = await loseFirstResponse(page, 'tasks');
    await page.goto('/tarefas');
    await page.getByRole('button', { name: 'Nova tarefa' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Nova tarefa' });
    await dialog.getByLabel('Título').fill('Tarefa sob rede ruim');
    await dialog.getByRole('button', { name: 'Criar tarefa' }).click();
    // Erro visível; o formulário continua aberto com o que foi digitado.
    await expect(page.getByText(/Sem conexão com o servidor/).first()).toBeVisible();
    await expect(dialog.getByLabel('Título')).toHaveValue('Tarefa sob rede ruim');
    expect(lost()).toBe(true);
    await dialog.getByRole('button', { name: 'Criar tarefa' }).click();
    await expect(dialog).toBeHidden();
    await page.keyboard.press('Escape');
    await page.reload();
    await expect(
      page.getByRole('button', { name: 'Tarefa sob rede ruim', exact: true }),
    ).toHaveCount(1);
  });

  test('matéria', async () => {
    await loseFirstResponse(page, 'subjects');
    await page.goto('/estudos');
    await page.getByRole('button', { name: 'Nova matéria' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Nova matéria' });
    await dialog.getByLabel('Nome').fill('Física');
    await dialog.getByRole('button', { name: 'Criar matéria' }).click();
    await expect(page.getByText(/Sem conexão com o servidor/).first()).toBeVisible();
    await dialog.getByRole('button', { name: 'Criar matéria' }).click();
    await expect(dialog).toBeHidden();
    await page.goto('/estudos');
    await expect(page.getByRole('link', { name: /Física/ })).toHaveCount(1);
  });

  test('marcação de hábito', async () => {
    await page.goto('/habitos');
    await page
      .getByRole('button', { name: /Novo hábito/ })
      .first()
      .click();
    const dialog = page.getByRole('dialog', { name: 'Novo hábito' });
    await dialog.getByLabel('Nome').fill('Meditar');
    await dialog.getByRole('button', { name: 'Criar hábito' }).click();
    await expect(dialog).toBeHidden();
    await loseFirstResponse(page, 'habit_checkins');
    await page.getByRole('button', { name: 'Marcar Meditar como feito hoje' }).click();
    await expect(page.getByText(/Sem conexão com o servidor/).first()).toBeVisible();
    // O botão volta a refletir o banco depois de recarregar; não há marcação dupla.
    await page.reload();
    const marcar = page.getByRole('button', { name: 'Marcar Meditar como feito hoje' });
    if (await marcar.count()) await marcar.click();
    await page.reload();
    await expect(
      page.getByRole('region', { name: 'Todos os hábitos' }).getByText('1 dia', { exact: true }),
    ).toBeVisible();
  });
});

/**
 * Isolamento entre contas pela interface (Fase 5, §5): a conta B não vê nem abre registros da
 * conta A, nem pelo endereço direto. Sair da conta encerra a sessão de verdade.
 * (A varredura completa por tabela fica em src/tests/integration/isolation-sweep.)
 */
import { expect, test } from '@playwright/test';
import { signIn, signUpAndConfirm } from './support';

test('conta B não enxerga a matéria da conta A, nem pelo link direto', async ({ page }) => {
  const a = await signUpAndConfirm(page, 'Conta A');
  await page.goto('/estudos');
  await page.getByRole('button', { name: 'Nova matéria' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Nova matéria' });
  await dialog.getByLabel('Nome').fill('Segredo de A');
  await dialog.getByRole('button', { name: 'Criar matéria' }).click();
  await expect(page.getByRole('heading', { name: 'Segredo de A' })).toBeVisible();
  await expect(page).toHaveURL(/\/estudos\/materias\/[0-9a-f-]{36}$/);
  const subjectUrl = page.url();

  // Sair: a sessão termina; rotas protegidas voltam para o login.
  await page.getByRole('button', { name: 'Sair da conta' }).click();
  await expect(page).toHaveURL(/\/entrar/);
  await page.goto(subjectUrl);
  await expect(page).toHaveURL(/\/entrar/);

  await signUpAndConfirm(page, 'Conta B');
  await page.goto('/estudos');
  await expect(page.getByText('Nenhuma matéria ainda')).toBeVisible();
  await page.goto(subjectUrl);
  await expect(
    page.getByText(/não encontrada|não existe|não foi encontrada/i).first(),
  ).toBeVisible();
  await expect(page.getByText('Segredo de A')).toHaveCount(0);

  // A continua vendo a própria matéria.
  await page.getByRole('button', { name: 'Sair da conta' }).click();
  await signIn(page, a.email, a.password);
  await page.goto(subjectUrl);
  await expect(page.getByRole('heading', { name: 'Segredo de A' })).toBeVisible();
});

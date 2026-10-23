/**
 * Jornada real de uso (Fase 5, §4): conta nova → estudos → tarefas/projetos → calendário →
 * metas → hábitos → análises → recomendações → edição/exclusão → recarga, sempre conferindo
 * que o que aparece veio do banco (recarregar a página não muda nada).
 *
 * Roda contra o Supabase de TESTE (npm run stack:start). Conta criada pelo próprio cadastro,
 * com confirmação pelo link do e-mail. Datas relativas ao fuso America/Sao_Paulo.
 */
import { expect, test, type Page } from '@playwright/test';
import { collectErrors, signUpAndConfirm } from './support';

const TZ = 'America/Sao_Paulo';
/** Data local (YYYY-MM-DD) em São Paulo, deslocada em dias. */
function localDate(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}
const yesterday = localDate(-1);
const tomorrow = localDate(1);
const twoDaysAgo = localDate(-2);

test.describe.serial('jornada completa de uma conta nova', () => {
  let page: Page;
  let errors: string[];

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext({ locale: 'pt-BR', timezoneId: TZ });
    page = await context.newPage();
    errors = collectErrors(page);
  });

  test.afterAll(async () => {
    await page.context().close();
  });

  test.afterEach(() => {
    // Nenhum erro de JavaScript ou requisição com falha não tratada ao longo da jornada.
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('1. cadastro com confirmação por e-mail; conta nova começa vazia', async () => {
    await signUpAndConfirm(page, 'Ana Teste');
    await expect(page.getByRole('heading', { name: /Seu LifeOS ainda está vazio/ })).toBeVisible();
    // Sem dados de demonstração misturados.
    await expect(page.getByText(/Os dados exibidos são fictícios/)).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'dados de demonstração' })).toHaveCount(0);
  });

  test('2. cria matéria e tópico', async () => {
    await page.goto('/estudos');
    await page.getByRole('button', { name: 'Nova matéria' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Nova matéria' });
    // Validação: nome obrigatório.
    await dialog.getByRole('button', { name: 'Criar matéria' }).click();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel('Nome')).toHaveAttribute('aria-invalid', 'true');
    await dialog.getByLabel('Nome').fill('Cálculo I');
    await dialog.getByLabel('Carga pretendida (h/semana)').fill('4');
    await dialog.getByRole('button', { name: 'Criar matéria' }).click();
    await expect(page.getByRole('heading', { name: 'Cálculo I', level: 2 })).toBeVisible();

    await page.getByRole('button', { name: 'Novo tópico' }).click();
    const topic = page.getByRole('dialog', { name: 'Novo tópico' });
    await topic.getByLabel('Nome').fill('Limites');
    await topic.getByRole('button', { name: 'Criar tópico' }).click();
    await page.keyboard.press('Escape');
    await expect(
      page
        .getByRole('region', { name: 'Tópicos' })
        .getByRole('button', { name: 'Limites', exact: true }),
    ).toBeVisible();
  });

  test('3. cronômetro: inicia, pausa, sobrevive à recarga e encerra; sessão manual', async () => {
    await page.goto('/estudos/cronometro');
    await page.getByLabel('Matéria').selectOption({ label: 'Cálculo I' });
    await page.getByLabel('Tópico').selectOption({ label: 'Limites' });
    await page.getByRole('button', { name: 'Iniciar sessão' }).click();
    const running = page.getByRole('region', { name: /^Sessão (em andamento|pausada)$/ });
    await expect(running).toBeVisible();
    await running.getByRole('button', { name: 'Pausar' }).click();
    await expect(running.getByRole('button', { name: 'Retomar' })).toBeVisible();

    // Recuperação: a sessão vem do banco, não da memória da aba.
    await page.reload();
    await expect(running).toBeVisible();
    await expect(running.getByRole('button', { name: 'Retomar' })).toBeVisible();
    await running.getByRole('button', { name: 'Retomar' }).click();
    await expect(running.getByRole('button', { name: 'Pausar' })).toBeVisible();
    // Alguns segundos de tempo líquido: sessões com 0 s não contam para metas (regra do banco).
    await page.waitForTimeout(2500);
    await running.getByRole('button', { name: 'Encerrar', exact: true }).click();
    const reflection = page.getByRole('dialog', { name: 'Reflexão da sessão' });
    await expect(reflection).toBeVisible();
    await reflection.getByLabel('Questões feitas').fill('10');
    await reflection.getByLabel('Questões certas').fill('8');
    await reflection.getByRole('button', { name: 'Salvar reflexão' }).click();
    await expect(reflection).toBeHidden();
    await expect(page.getByRole('region', { name: 'Nova sessão de foco' })).toBeVisible();

    // Sessão manual ontem, 14:00–14:45 (45 min) — base conhecida para as análises.
    await page.getByRole('button', { name: 'Registrar sessão manualmente' }).click();
    const manual = page.getByRole('dialog', { name: 'Registrar sessão manualmente' });
    await manual.getByLabel('Início').fill(`${yesterday}T14:00`);
    await manual.getByLabel('Fim').fill(`${yesterday}T14:45`);
    await manual.getByLabel('Matéria').selectOption({ label: 'Cálculo I' });
    await manual.getByRole('button', { name: 'Registrar sessão' }).click();
    await expect(manual).toBeHidden();
    const recent = page.getByRole('region', { name: 'Sessões recentes' });
    await expect(recent.getByRole('listitem')).toHaveCount(2);
    await expect(recent.getByText('45 min')).toBeVisible();
  });

  test('4. projeto com tarefa; concluir atualiza o progresso', async () => {
    await page.goto('/projetos');
    await page.getByRole('button', { name: 'Novo projeto' }).first().click();
    const pd = page.getByRole('dialog', { name: 'Novo projeto' });
    await pd.getByLabel('Nome').fill('TCC');
    await pd.getByRole('button', { name: 'Criar projeto' }).click();
    await expect(pd).toBeHidden();

    await page.goto('/tarefas');
    for (const [title, due] of [
      ['Escrever introdução', tomorrow],
      ['Revisar bibliografia', twoDaysAgo],
    ] as const) {
      await page.getByRole('button', { name: 'Nova tarefa' }).first().click();
      const td = page.getByRole('dialog', { name: 'Nova tarefa' });
      await td.getByLabel('Título').fill(title);
      await td.getByLabel('Prioridade').selectOption({ label: 'Alta' });
      await td.getByLabel('Estimativa (min)').fill('60');
      await td.getByLabel('Prazo').fill(due);
      await td.getByLabel('Projeto').selectOption({ label: 'TCC' });
      await td.getByRole('button', { name: 'Criar tarefa' }).click();
      await expect(td).toBeHidden();
      // Criar abre o detalhe da tarefa nova.
      const detail = page.getByRole('dialog', { name: title });
      await expect(detail).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(detail).toBeHidden();
    }
    await expect(page.getByText('2 tarefas')).toBeVisible();

    await page.goto('/projetos');
    await page.getByRole('link', { name: /TCC/ }).first().click();
    await expect(page.getByText(/0 de 2/)).toBeVisible();
  });

  test('5. evento no calendário (persistente após recarga)', async () => {
    await page.goto('/calendario');
    await page.getByRole('button', { name: 'Novo evento' }).click();
    const ed = page.getByRole('dialog', { name: 'Novo evento' });
    await ed.getByLabel('Título').fill('Orientação do TCC');
    await ed.getByLabel('Início').fill(`${tomorrow}T10:00`);
    await ed.getByLabel('Fim').fill(`${tomorrow}T11:00`);
    await ed.getByRole('button', { name: 'Criar evento' }).click();
    await expect(ed).toBeHidden();
    await page.getByRole('button', { name: 'Mês' }).click();
    await expect(page.getByText('Orientação do TCC')).toBeVisible();
    await page.reload();
    await page.getByRole('button', { name: 'Mês' }).click();
    await expect(page.getByText('Orientação do TCC')).toBeVisible();
  });

  test('6. meta de sessões de estudo calcula o progresso dos registros', async () => {
    await page.goto('/metas');
    await page
      .getByRole('button', { name: /Nova meta/ })
      .first()
      .click();
    const gd = page.getByRole('dialog', { name: 'Nova meta' });
    await gd.getByLabel('Título').fill('Estudar com constância');
    await gd.getByLabel('Tipo').selectOption({ label: 'Sessões de estudo' });
    await gd.getByLabel('Ciclo').selectOption({ label: 'Até o prazo' });
    await gd.getByLabel('Início').fill(twoDaysAgo);
    await gd.getByLabel(/Prazo/).fill(localDate(30));
    await gd.getByLabel(/Alvo/).fill('10');
    await gd.getByRole('button', { name: 'Criar meta' }).click();
    await expect(gd).toBeHidden();
    // As duas sessões encerradas (a do cronômetro e a manual) contam.
    await expect(page.getByText(/2 sessões de 10 sessões/).first()).toBeVisible();
  });

  test('7. hábito marcado hoje', async () => {
    await page.goto('/habitos');
    await page
      .getByRole('button', { name: /Novo hábito/ })
      .first()
      .click();
    const hd = page.getByRole('dialog', { name: 'Novo hábito' });
    await hd.getByLabel('Nome').fill('Ler 20 páginas');
    await hd.getByRole('button', { name: 'Criar hábito' }).click();
    await expect(hd).toBeHidden();
    await page.getByRole('button', { name: 'Marcar Ler 20 páginas como feito hoje' }).click();
    await page.reload();
    const today = page.getByRole('region', { name: 'Hoje' });
    await expect(
      today.getByRole('button', { name: 'Marcar Ler 20 páginas como feito hoje' }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('region', { name: 'Todos os hábitos' }).getByText('1 dia', { exact: true }),
    ).toBeVisible();
  });

  test('8. análises refletem os registros (ontem: 45 min)', async () => {
    await page.goto(`/analises?periodo=custom&de=${yesterday}&ate=${yesterday}`);
    const tile = (label: string) =>
      page.getByText(label, { exact: true }).first().locator('xpath=..');
    await expect(tile('Tempo de estudo')).toContainText('45 min');
    await expect(tile('Sessões de foco')).toContainText('1');
    // Hoje: a sessão do cronômetro, com a reflexão de 10 questões (8 certas).
    await page.goto(`/analises?periodo=custom&de=${localDate(0)}&ate=${localDate(0)}`);
    await expect(tile('Questões')).toContainText('10');
    await expect(tile('Questões')).toContainText('80%');
  });

  test('9. recomendações: tarefa vencida gera sugestão; rejeitar não a recria', async () => {
    await page.goto('/recomendacoes');
    const card = page.getByRole('article').filter({ hasText: 'Revisar bibliografia' }).first();
    await expect(card).toBeVisible();
    await card.getByRole('button', { name: 'Rejeitar' }).click();
    const confirm = page.getByRole('dialog', { name: 'Rejeitar recomendação?' });
    await confirm.getByLabel('Motivo (opcional)').fill('Já replanejei');
    await confirm.getByRole('button', { name: 'Rejeitar' }).click();
    await expect(card).toBeHidden();
    await page.reload();
    await expect(page.getByRole('article').filter({ hasText: 'Revisar bibliografia' })).toHaveCount(
      0,
    );
    await page.getByRole('radio', { name: 'Histórico' }).click();
    await expect(
      page.getByRole('article').filter({ hasText: 'Revisar bibliografia' }).first(),
    ).toBeVisible();
  });

  test('10. editar e concluir tarefa atualiza o projeto', async () => {
    await page.goto('/tarefas');
    await page.getByRole('button', { name: 'Escrever introdução', exact: true }).click();
    const detail = page.getByRole('dialog', { name: 'Escrever introdução' });
    await detail.getByRole('button', { name: 'Editar' }).click();
    const edit = page
      .getByRole('dialog')
      .filter({ has: page.getByRole('button', { name: 'Salvar alterações' }) });
    await edit.getByLabel('Título').fill('Escrever introdução e objetivos');
    await edit.getByRole('button', { name: 'Salvar alterações' }).click();
    const renamed = page.getByRole('dialog', { name: 'Escrever introdução e objetivos' });
    await expect(renamed).toBeVisible();
    await renamed.getByRole('button', { name: 'Concluir' }).click();
    await expect(renamed.getByText('Concluída', { exact: true }).first()).toBeVisible();
    await page.keyboard.press('Escape');

    await page.goto('/projetos');
    await page.getByRole('link', { name: /TCC/ }).first().click();
    const progress = page.getByRole('region', { name: 'Progresso' });
    await expect(progress).toContainText('50%');
  });

  test('11. excluir: tarefa, evento e matéria (com redirecionamento e sem órfãos)', async () => {
    // Tarefa vencida: some da lista e do projeto (progresso passa a 1 de 1).
    await page.goto('/tarefas');
    await page.getByRole('button', { name: 'Revisar bibliografia', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'Revisar bibliografia' })
      .getByRole('button', { name: 'Excluir' })
      .click();
    await page
      .getByRole('dialog', { name: 'Excluir tarefa?' })
      .getByRole('button', { name: 'Excluir tarefa' })
      .click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Revisar bibliografia', exact: true }),
    ).toHaveCount(0);
    await page.goto('/projetos');
    await page.getByRole('link', { name: /TCC/ }).first().click();
    await expect(page.getByRole('region', { name: 'Progresso' })).toContainText('100%');

    // Evento.
    await page.goto('/calendario');
    await page.getByRole('button', { name: 'Mês' }).click();
    await page.getByText('Orientação do TCC').first().click();
    const ev = page.getByRole('dialog').filter({ hasText: 'Orientação do TCC' });
    await ev.getByRole('button', { name: 'Excluir' }).click();
    await page
      .getByRole('dialog')
      .filter({ has: page.getByRole('button', { name: /^Excluir/ }) })
      .last()
      .getByRole('button', { name: /^Excluir/ })
      .last()
      .click();
    await expect(page.getByText('Orientação do TCC')).toHaveCount(0);

    // Matéria com sessões: exclusão redireciona para a lista; as sessões continuam no histórico.
    await page.goto('/estudos');
    await page
      .getByRole('link', { name: /Cálculo I/ })
      .first()
      .click();
    await page.getByRole('button', { name: 'Excluir' }).first().click();
    const confirm = page.getByRole('dialog').last();
    await confirm
      .getByRole('button', { name: /^Excluir/ })
      .last()
      .click();
    await expect(page).toHaveURL(/\/estudos$/);
    await expect(page.getByText('Nenhuma matéria ainda')).toBeVisible();
  });

  test('12. após recarregar, tudo continua coerente com o banco', async () => {
    await page.goto(`/analises?periodo=custom&de=${yesterday}&ate=${yesterday}`);
    const tile = (label: string) =>
      page.getByText(label, { exact: true }).first().locator('xpath=..');
    // A sessão de ontem perdeu a matéria, mas continua contando como estudo.
    await expect(tile('Tempo de estudo')).toContainText('45 min');
    await page.goto('/estudos/cronometro');
    await expect(
      page.getByRole('region', { name: 'Sessões recentes' }).getByRole('listitem'),
    ).toHaveCount(2);
    await page.goto('/recomendacoes');
    await expect(page.getByRole('article').filter({ hasText: 'Revisar bibliografia' })).toHaveCount(
      0,
    );
    await page.goto('/metas');
    await expect(page.getByText(/2 sessões de 10 sessões/).first()).toBeVisible();
    await page.goto('/habitos');
    await expect(
      page.getByRole('region', { name: 'Todos os hábitos' }).getByText('1 dia', { exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole('region', { name: 'Todos os hábitos' }).getByText('1 dia', { exact: true }),
    ).toBeVisible();
  });
});

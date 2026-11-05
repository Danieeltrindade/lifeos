import { expect, type Page } from '@playwright/test';

/** Caixa de e-mail da pilha de teste (API compatível com o Mailpit do `supabase start`). */
const MAIL_API = process.env.E2E_MAIL_API ?? 'http://localhost:54324';

interface MailSummary {
  ID: string;
  To: { Address: string }[];
}

/** Espera o e-mail mais recente para `to` e devolve o primeiro link dele. */
export async function linkFromLatestMail(to: string, timeoutMs = 15_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${MAIL_API}/api/v1/messages`);
    const list = (await res.json()) as { messages: MailSummary[] };
    const msg = list.messages.find((m) =>
      m.To.some((t) => t.Address.toLowerCase() === to.toLowerCase()),
    );
    if (msg) {
      const full = (await (await fetch(`${MAIL_API}/api/v1/message/${msg.ID}`)).json()) as {
        HTML: string;
        Text: string;
      };
      const href = /href="([^"]+)"/.exec(full.HTML)?.[1] ?? /(https?:\/\/\S+)/.exec(full.Text)?.[1];
      if (href) return href.replaceAll('&amp;', '&');
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Nenhum e-mail para ${to} em ${String(timeoutMs)} ms`);
}

export function uniqueEmail(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@example.test`;
}

/** Cadastro real pela interface + confirmação pelo link do e-mail (PKCE, mesmo navegador). */
export async function signUpAndConfirm(page: Page, name = 'Pessoa de Teste') {
  const email = uniqueEmail('e2e');
  const password = `Senha-${Math.random().toString(36).slice(2, 10)}`;
  await page.goto('/cadastro');
  await page.getByLabel('Como quer ser chamado').fill(name);
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(password);
  await page.getByLabel('Confirme a senha').fill(password);
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.getByRole('heading', { name: 'Confirme seu e-mail' })).toBeVisible();
  await page.goto(await linkFromLatestMail(email));
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    /Bom dia|Boa tarde|Boa noite/,
  );
  return { email, password };
}

export async function signIn(page: Page, email: string, password: string) {
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    /Bom dia|Boa tarde|Boa noite/,
  );
}

/** Erros de JavaScript e de rede inesperados durante o teste (falham no fim). */
export function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 300)}`);
  });
  return errors;
}

/**
 * Popula a conta LOGADA na página com um conjunto variado de registros, pela API REST pública
 * (mesmo caminho do app: JWT do usuário + RLS). Para testes de layout/acessibilidade com dados.
 */
export async function seedViaApi(page: Page) {
  const url = process.env.VITE_SUPABASE_URL ?? '';
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '';
  const token = await page.evaluate(() => {
    const raw = localStorage.getItem('lifeos-auth');
    return raw ? (JSON.parse(raw) as { access_token: string }).access_token : '';
  });
  const post = async (table: string, rows: object | object[]): Promise<{ id: string }[]> => {
    // PostgREST exige as mesmas chaves em todas as linhas de um lote: uma requisição por linha.
    if (Array.isArray(rows)) {
      const out: { id: string }[] = [];
      for (const row of rows) out.push(...(await post(table, row as object)));
      return out;
    }
    const res = await fetch(`${url}/rest/v1/${table}`, {
      method: 'POST',
      headers: {
        apikey: key,
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        prefer: 'return=representation',
      },
      body: JSON.stringify(rows),
    });
    if (!res.ok) throw new Error(`${table}: ${String(res.status)} ${await res.text()}`);
    return (await res.json()) as { id: string }[];
  };
  const day = (offset: number) =>
    new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
  const at = (offset: number, hour: number) => {
    const d = new Date(Date.now() + offset * 86_400_000);
    d.setUTCHours(hour + 3, 0, 0, 0); // hora de São Paulo
    return d.toISOString();
  };

  const [math, physics] = await post('subjects', [
    { name: 'Cálculo Diferencial e Integral II', color: '#2f63a8', target_minutes_per_week: 240 },
    { name: 'Física', color: '#c0492f' },
  ]);
  const [limits] = await post('topics', [
    { subject_id: math?.id, name: 'Limites e continuidade' },
    { subject_id: math?.id, name: 'Derivadas' },
  ]);
  await post('review_cards', [{ topic_id: limits?.id, due_on: day(-1) }]);
  for (let i = 1; i <= 12; i++) {
    await post('focus_sessions', {
      subject_id: i % 3 === 0 ? physics?.id : math?.id,
      topic_id: i % 3 === 0 ? null : limits?.id,
      status: 'completed',
      started_at: at(-i, 14),
      ended_at: at(-i, 15),
    });
  }
  const [project] = await post('projects', [
    { name: 'TCC — Sistema de organização pessoal', due_on: day(40) },
  ]);
  await post('project_milestones', [
    { project_id: project?.id, title: 'Qualificação', due_on: day(10) },
  ]);
  await post('tasks', [
    {
      title: 'Escrever a introdução do TCC com um título bem longo para testar quebras',
      project_id: project?.id,
      priority: 'high',
      due_on: day(1),
      estimate_minutes: 120,
    },
    { title: 'Revisar bibliografia', project_id: project?.id, priority: 'high', due_on: day(-3) },
    { title: 'Lista de exercícios', priority: 'medium', due_on: day(0) },
    { title: 'Comprar livros', priority: 'low' },
  ]);
  const [habit] = await post('habits', [{ name: 'Ler 20 páginas', start_on: day(-20) }]);
  await post(
    'habit_checkins',
    [1, 2, 3, 5, 6, 8, 9, 10].map((i) => ({ habit_id: habit?.id, local_date: day(-i) })),
  );
  await post('goals', [
    {
      title: 'Estudar 6 h por semana',
      progress_mode: 'activity_time',
      period: 'weekly',
      target_value: 6,
      unit: 'h',
      start_on: day(-30),
    },
  ]);
  await post('calendar_events', [
    { title: 'Orientação', starts_at: at(1, 10), ends_at: at(1, 11) },
    {
      title: 'Bloco de estudo',
      kind: 'study',
      subject_id: math?.id,
      starts_at: at(0, 18),
      ends_at: at(0, 20),
      recurrence_rule: 'FREQ=WEEKLY;COUNT=6',
    },
    { title: 'Conflito', starts_at: at(0, 19), ends_at: at(0, 20) },
  ]);
  await post('activities', [
    {
      title: 'Corrida',
      kind: 'exercise',
      distance_km: 5,
      started_at: at(-2, 7),
      ended_at: at(-2, 8),
    },
  ]);
  const [noteCategory] = await post('note_categories', [{ name: 'Ideias', color: '#3b7ce5' }]);
  await post('notes', [
    {
      category_id: noteCategory?.id,
      title: 'Ideia de projeto',
      content: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'Juntar agenda e foco.' }] },
        ],
      },
      content_text: 'Juntar agenda e foco.',
    },
  ]);
  return { subjectId: math?.id ?? '', projectId: project?.id ?? '' };
}

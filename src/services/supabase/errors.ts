/**
 * Tradução de erros do Supabase (PostgREST, Postgres, rede) para mensagens seguras.
 *
 * Mensagens do banco NÃO são exibidas cruas: podem conter nomes internos ou dados.
 * A interface recebe um tipo estável (kind) e um texto em pt-BR. Nada aqui registra
 * dados pessoais em log.
 */

export type AppErrorKind =
  | 'network'
  | 'session_expired'
  | 'permission'
  | 'conflict'
  | 'validation'
  | 'not_found'
  | 'unknown';

export class AppError extends Error {
  readonly kind: AppErrorKind;
  /** Código técnico (SQLSTATE/PostgREST) para diagnóstico; nunca contém dados do usuário. */
  readonly code: string | null;

  constructor(kind: AppErrorKind, message: string, code: string | null = null) {
    super(message);
    this.name = 'AppError';
    this.kind = kind;
    this.code = code;
  }
}

export const APP_ERROR_MESSAGES: Record<AppErrorKind, string> = {
  network: 'Sem conexão com o servidor. Verifique sua internet e tente novamente.',
  session_expired: 'Sua sessão expirou. Entre novamente para continuar.',
  permission: 'Você não tem permissão para esta ação.',
  conflict: 'Já existe um registro com esses dados.',
  validation: 'Alguns dados são inválidos. Revise e tente novamente.',
  not_found: 'Registro não encontrado.',
  unknown: 'Algo deu errado. Tente novamente em instantes.',
};

interface ErrorLike {
  code?: unknown;
  status?: unknown;
  message?: unknown;
  name?: unknown;
}

function asErrorLike(error: unknown): ErrorLike {
  return typeof error === 'object' && error !== null ? error : {};
}

function isNetworkFailure(e: ErrorLike, error: unknown): boolean {
  const message = typeof e.message === 'string' ? e.message : '';
  return (
    (error instanceof TypeError && /fetch|network|load failed/i.test(message)) ||
    e.name === 'AuthRetryableFetchError' ||
    /Failed to fetch|NetworkError|Load failed|ERR_NETWORK|ECONNREFUSED/i.test(message)
  );
}

function kindFromCode(code: string, status: number | null): AppErrorKind {
  // PostgREST: JWT ausente/inválido/expirado.
  if (code === 'PGRST301' || code === 'PGRST302' || code === 'PGRST303' || status === 401) {
    return 'session_expired';
  }
  if (code === '42501' || status === 403) return 'permission';
  if (code === '23505' || code === '23P01') return 'conflict';
  if (code === 'PGRST116' || code === 'P0002' || status === 404) return 'not_found';
  if (/^(22|23)/.test(code) || code === 'PGRST204' || status === 400) return 'validation';
  return 'unknown';
}

/**
 * Mensagens que o PRÓPRIO LifeOS levanta no banco (RAISE nas migrations). São textos em
 * pt-BR escritos para o usuário — podem ser exibidos. Qualquer outra mensagem do servidor
 * é substituída por uma genérica.
 */
const SAFE_SERVER_MESSAGES = [
  'A pausa começa antes da sessão',
  'A pausa precisa terminar até o fim da sessão',
  'A sessão já está pausada',
  'A sessão já foi encerrada',
  'A sessão não está pausada',
  'A sessão não pode terminar no futuro',
  'Adie de 1 a 60 dias',
  'Conclua antes as tarefas de que esta depende:',
  'Dependência circular entre tarefas',
  'Escolha hoje ou uma data futura',
  'Há pausas fora do intervalo da sessão',
  'Há subtarefas abertas',
  'Já existe uma sessão de foco ativa',
  'Nota de revisão inválida',
  'O fim precisa estar entre o início da sessão e agora',
  'O fim precisa ser depois do início',
  'Somente sessões encerradas recebem reflexão',
  'Só sessões encerradas podem ser corrigidas',
  'Subtarefas não podem ter subtarefas',
  'Subtópicos não podem ter subtópicos',
  'Um tópico com subtópicos não pode virar subtópico',
  'Uma tarefa com subtarefas não pode virar subtarefa',
  'Subcategorias não podem ter subcategorias',
  'Uma categoria com subcategorias não pode virar subcategoria',
];

/** Restrições do banco com mensagem própria (o nome aparece no texto do erro do Postgres). */
const CONSTRAINT_MESSAGES: Record<string, string> = {
  tasks_dates_ordered: 'O prazo não pode ser antes da data de início.',
  projects_dates_ordered: 'O prazo do projeto não pode ser antes do início.',
  task_dependencies_acyclic: 'Essa dependência criaria um ciclo entre tarefas.',
  task_dependencies_pkey: 'Essa dependência já existe.',
  focus_sessions_max_duration: 'Uma sessão pode ter no máximo 24 horas.',
  focus_sessions_end_after_start: 'O fim precisa ser depois do início.',
  focus_sessions_one_active_per_user: 'Já existe uma sessão de foco ativa.',
  activities_end_after_start: 'O fim precisa ser depois do início.',
  session_reflections_correct_le_questions: 'Os acertos não podem passar do número de questões.',
  habit_checkins_one_per_day: 'Já existe uma marcação deste hábito nesse dia.',
  note_categories_unique_root_name: 'Já existe uma categoria com esse nome.',
  note_categories_unique_child_name: 'Já existe uma subcategoria com esse nome nesta categoria.',
  note_categories_name_length: 'Dê um nome de 1 a 60 caracteres.',
  note_categories_two_levels: 'Subcategorias não podem ter subcategorias.',
  notes_category_fk:
    'Esta categoria ainda tem notas. Mova as notas para outra categoria antes de excluir.',
  notes_content_size: 'A nota ficou grande demais. Divida o conteúdo em mais de uma nota.',
  notes_title_length: 'O título pode ter até 200 caracteres.',
  subjects_user_name_active_key: 'Já existe uma matéria com esse nome.',
  topics_subject_name_active_key: 'Já existe um tópico com esse nome nesta matéria.',
  activity_categories_user_name_active_key: 'Já existe uma categoria com esse nome.',
  goals_sources_match_mode: 'A fonte escolhida não combina com o tipo da meta.',
  calendar_events_time_shape: 'Revise o início e o fim do evento.',
  calendar_event_exceptions_unique_instant: 'Essa ocorrência já foi alterada.',
  // Metas guardam a fonte do progresso: a fonte não pode sumir sem decidir o que fazer com a meta.
  goals_project_fk:
    'Há metas ligadas a este projeto. Altere ou exclua essas metas antes (ou arquive o projeto).',
  goals_subject_fk:
    'Há metas ligadas a esta matéria. Altere ou exclua essas metas antes (ou arquive a matéria).',
  goals_habit_fk:
    'Há metas ligadas a este hábito. Altere ou exclua essas metas antes (ou arquive o hábito).',
  goals_category_fk: 'Há metas ligadas a esta categoria. Altere ou exclua essas metas antes.',
};

function specificMessage(message: string): string | null {
  for (const [name, text] of Object.entries(CONSTRAINT_MESSAGES)) {
    if (message.includes(`"${name}"`)) return text;
  }
  if (SAFE_SERVER_MESSAGES.some((prefix) => message.startsWith(prefix))) return message;
  return null;
}

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof DOMException && error.name === 'AbortError') {
    return new AppError('unknown', 'Operação cancelada.', 'ABORTED');
  }
  const e = asErrorLike(error);
  if (isNetworkFailure(e, error)) {
    return new AppError('network', APP_ERROR_MESSAGES.network, 'NETWORK');
  }
  const code = typeof e.code === 'string' ? e.code : '';
  const status = typeof e.status === 'number' ? e.status : null;
  const kind = kindFromCode(code, status);
  const rawMessage = typeof e.message === 'string' ? e.message : '';
  const specific =
    kind === 'validation' || kind === 'conflict' ? specificMessage(rawMessage) : null;
  return new AppError(
    kind,
    specific ?? APP_ERROR_MESSAGES[kind],
    code || (status ? String(status) : null),
  );
}

export function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof AppError && error.code === 'ABORTED')
  );
}

# LifeOS — Design system

Fonte: `src/styles/index.css` (tokens) e `src/components/ui/` (primitivos).

## 1. Direção visual

**"Papel e pinho."** Uma ferramenta calma, de uso diário, que precisa ser lida rápido e por muito tempo.

- Base neutra **quente** no claro (tons de papel) e **grafite** no escuro — evita o branco-azulado genérico de painéis administrativos.
- Cor primária **pinho** (verde-azulado profundo): foco, constância, crescimento. Usada com parcimônia em ações, estado ativo e progresso.
- Destaque **âmbar**: tempo, atenção e metas. Aparece no relógio da marca e em itens "para hoje".
- Profundidade discreta: bordas finas + sombras suaves no claro; superfícies em camadas no escuro (sombras quase não aparecem em fundos escuros).
- Um único gradiente sutil ("hero glow") no topo do dashboard. Nenhum outro elemento decorativo.

**Redesign de novembro/2026 (identidade azul-petróleo).** Substitui os valores do redesign de
outubro descrito abaixo. O escuro passa a ser azul-petróleo: barra lateral `#071013` < fundo
`#0a1418` < cartão `#0f1c21` < superfície interna `#13252b` < elevada `#182d34`, com bordas
`#1f363d`/`#2c4951`. A primária é turquesa (`#2dd4bf` no escuro, `#0b7469` no claro) e os
botões primários têm um brilho sutil (`shadow-glow`). Novos tokens: destaques secundários
`violet`, `orange` e `yellow` (só em ícones de indicadores, via `IconChip`), `--lo-app-bg`
(gradiente de fundo da página), `--lo-card-sheen` (utilitário `surface-card`: brilho no topo
dos cartões) e `--lo-hero` (utilitário `surface-hero`, abertura do dashboard). Componentes
novos: `IconChip`, `DashboardHero`, `KpiStrip`, `WeeklyProgress` e `FocusRing` (cronômetro).
O `PageHeader` recebe `module` e mostra o mesmo ícone da navegação. A prioridade das tarefas
voltou a ser um selo discreto (Alta/Média/Baixa, sempre com bandeira e texto). Contrastes
(WCAG AA) recalculados: texto fraco ≥ 5,2:1 no escuro e ≥ 4,75:1 no claro.

**Redesign de outubro/2026.** O escuro deixou de ser "quase preto em tudo": agora são cinco camadas
de grafite frio, levemente puxadas para o verde-azulado da marca — barra lateral (`#0d1013`) <
fundo (`#12161a`) < cartão (`#1b2025`) < superfície interna (`#22282e`) < elevada (`#283037`) —, com
bordas visíveis (1,3:1 e 1,7:1 sobre o cartão). A primária ficou mais luminosa (`#4fbfab`) e é
reservada à ação principal de cada tela, ao item ativo, ao progresso e à seleção. Selos (badges)
ficam para estados que pedem atenção; o resto dos metadados vira texto discreto com ícone
(prioridade com bandeira, prazo, projeto, subtarefas).

## 2. Tokens

Três camadas:

1. **Primitivas** (`--sand-*`, `--ink-*`, `--pine-*`, `--amber-*`): paleta crua, nunca usada em componentes.
2. **Semânticas** (`--lo-*`): redefinidas por tema em `[data-theme]`.
3. **Utilitários Tailwind** (`@theme inline`): `bg-surface`, `text-fg-muted`, `border-border`, `shadow-elev-2`…

### Cores semânticas

| Token (utilitário)                                 | Uso                                                                 |
| -------------------------------------------------- | ------------------------------------------------------------------- |
| `bg`                                               | Fundo da página                                                     |
| `sidebar`                                          | Barra lateral, barras móveis e gaveta (um degrau abaixo do fundo)   |
| `surface`                                          | Cards, listas                                                       |
| `surface-muted`                                    | Campos, áreas secundárias, item ativo da navegação, hover           |
| `surface-raised`                                   | Elementos acima da superfície (segmento ativo, menus, campo focado) |
| `progress-track`                                   | Trilha das barras de progresso                                      |
| `border` / `border-strong`                         | Divisórias / contornos de controles e estados vazios                |
| `fg` / `fg-muted` / `fg-subtle` / `fg-disabled`    | Texto primário / secundário / terciário e metadados / desabilitado  |
| `primary`, `primary-hover`, `primary-fg`           | Ação principal                                                      |
| `primary-soft`, `primary-soft-fg`                  | Item ativo na navegação, destaques suaves                           |
| `accent`, `accent-soft`, `accent-soft-fg`          | Tempo, metas, avisos de demonstração                                |
| `success`, `warning`, `danger`, `info` (+ `-soft`) | Estados                                                             |
| `focus`                                            | Anel de foco                                                        |
| `overlay`                                          | Fundo de diálogos                                                   |

### Contraste (WCAG 2.2)

Pares verificados para texto de corpo (≥ 4,5:1):

| Par                                           | Claro     | Escuro    |
| --------------------------------------------- | --------- | --------- |
| `fg` sobre `surface`                          | 16,8:1    | 13,9:1    |
| `fg-muted` sobre `surface`                    | 7,6:1     | 8,8:1     |
| `fg-subtle` sobre `surface`                   | 5,4:1     | 5,7:1     |
| `fg-subtle` sobre `surface-muted` (pior caso) | 4,8:1     | 5,1:1     |
| `primary-fg` sobre `primary`                  | 6,3:1     | 7,6:1     |
| `primary-soft-fg` sobre `primary-soft`        | 7,4:1     | 7,9:1     |
| Badges de estado (texto sobre fundo `-soft`)  | 4,6–6,4:1 | 5,5–6,8:1 |

Valores calculados com a fórmula de luminância relativa da WCAG a partir dos hexadecimais dos tokens.

`fg-disabled` é intencionalmente abaixo de 4,5:1 e só deve ser usado em controles desabilitados (isentos pela WCAG). Revalidar sempre que um token mudar.

### Tipografia

- Família: **Geist** (variável, empacotada localmente via `@fontsource-variable/geist` — sem requisições a terceiros). Fallback: fontes do sistema.
- Números: `.tabular` (algarismos tabulares) em horários e durações, para que não "pulem".

| Utilitário      | Tamanho / linha | Uso                                                                 |
| --------------- | --------------- | ------------------------------------------------------------------- |
| `text-overline` | 11 / 16         | Rótulos de grupo e "sobrancelha" das páginas (caixa alta, espaçada) |
| `text-caption`  | 12 / 16         | Metadados, badges                                                   |
| `text-body-sm`  | 13 / 20         | Listas, navegação, campos (≥ 640 px)                                |
| `text-body`     | 15 / 24         | Texto corrido (padrão)                                              |
| `text-title-sm` | 16 / 24         | Títulos de card e de diálogo                                        |
| `text-title`    | 22 / 30         | Título de página (celular)                                          |
| `text-display`  | 28 / 36         | Título de página (≥ 640 px)                                         |
| `text-metric`   | 28 / 32         | Indicadores numéricos (tempo, contagens)                            |

Títulos de página usam `tracking-[-0.02em]`; o relógio do cronômetro usa a Geist com algarismos
tabulares (não monoespaçada).

### Espaçamento

Escala do Tailwind (base 4 px). Convenções:

- Padding de card: 20 px (`px-5`). Gap entre cards: 16 px (`gap-4`).
- Gutter da página: 16 px (celular), 24 px (≥ 640), 40 px (≥ 1024). Largura máxima do conteúdo: 1200 px.
- Dashboard: cabeçalho (data, saudação, resumo do dia com contagens completas e ações rápidas
  compactas) + duas colunas a partir de 768 px — **hoje** (agenda, tarefas prioritárias, hábitos;
  7/12 da largura em ≥ 1024) e **acompanhamento** (estudos, revisões, metas, projetos; 5/12) — e um
  rodapé com histórico (atividades e recomendações). Cada coluna empilha os próprios cartões, então
  alturas diferentes não deixam buracos na grade.
- Barra lateral: 240 px. Grupos com um único item (Dashboard, Configurações) não têm título.

### Raios

`rounded-sm` 6 · `rounded-md` 8 (campos, botões, selos) · `rounded-lg` 12 (cards, listas) · `rounded-xl` 16 (diálogos).

### Elevação

`shadow-elev-1` (cards e controles), `shadow-elev-2` (hover, popovers), `shadow-elev-3` (gaveta, diálogos).
No escuro, cada nível tem um filete de luz de 1 px no topo (`inset`), que separa a superfície do
fundo sem sombras pesadas.

### Movimento

- Durações de 150–240 ms com `ease-out-soft`. `animate-fade-up` na entrada de páginas.
- `prefers-reduced-motion: reduce` desativa animações e transições globalmente.

### Foco e interação

- `:focus-visible` com contorno de 2 px na cor `focus` e deslocamento de 2 px — nunca removido sem substituto.
- Campos: borda forte em repouso, borda primária + anel de 3 px (`primary/20`) no foco; o contorno
  padrão é substituído, nunca removido sem substituto.
- Selects nativos com a mesma seta (SVG por tema) em todos os navegadores; o menu continua nativo.
- Alvos de toque ≥ 40 px (botões `sm`) e ≥ 44 px (`md`, itens de navegação móvel) no celular; a
  partir de 640 px, 36/40 px.
- Item ativo da navegação: fundo, peso semibold, ícone na cor primária e barra de 3 px à esquerda
  (não depende só de cor).
- `active:translate-y-px` em botões como resposta tátil.

## 3. Componentes

| Componente                             | Arquivo                                   | Notas                                                                                                                                        |
| -------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `Button`, `buttonClasses`              | `ui/Button.tsx`, `ui/button-classes.ts`   | Variantes `primary`, `secondary`, `ghost`, `danger`; `buttonClasses` estiliza `<Link>` sem aninhar botões em links                           |
| `Card`, `CardHeader`, `CardBody`       | `ui/Card.tsx`                             | `section` rotulada por `aria-labelledby`                                                                                                     |
| `Badge`                                | `ui/Badge.tsx`                            | Tons semânticos; nunca a única pista de significado; reservado a estados que pedem atenção (atrasada, bloqueada, em andamento)               |
| `PriorityFlag`, `DueMeta`              | `modules/tasks/components/TaskBadges.tsx` | Prioridade e prazo como metadado em listas (bandeira/ícone + texto); prioridade baixa só para leitores de tela                               |
| `EmptyState`, `ErrorState`, `Skeleton` | `ui/States.tsx`                           | Estados padronizados de dados; o vazio tem ícone em círculo, título, explicação e ação. Erro de consulta nunca aparece como lista vazia      |
| `ProgressBar`                          | `ui/ProgressBar.tsx`                      | `role="progressbar"` com `aria-valuetext` em unidades do domínio; tom `primary` em andamento e `success` quando o valor real atinge o alvo   |
| `SegmentedControl`                     | `ui/SegmentedControl.tsx`                 | Radio group acessível (setas)                                                                                                                |
| `PageHeader`                           | `layout/PageHeader.tsx`                   | Título único `h1` por página                                                                                                                 |
| `TextField`, `SelectField`             | `ui/Field.tsx`                            | Rótulo visível, dica e erro ligados por `aria-describedby`, `aria-invalid`, 44 px de altura; compatíveis com `register()` do React Hook Form |
| `Notice`                               | `ui/Notice.tsx`                           | Aviso em linha (info/sucesso/alerta/erro); erro usa `role="alert"`, os demais `role="status"`                                                |
| `AuthLayout`                           | `modules/auth/AuthLayout.tsx`             | Cartão central das telas públicas, com marca e seletor de tema; sem rolagem horizontal em 360 px                                             |
| `AccountPanel`                         | `layout/AccountPanel.tsx`                 | Identificação do usuário e "Sair" na sidebar e na gaveta                                                                                     |
| `FullPageStatus`, `SessionLoading`     | `layout/FullPageStatus.tsx`               | Tela cheia para verificação de sessão e configuração ausente                                                                                 |

## 4. Regras de conteúdo

- Idioma: pt-BR, tom direto e calmo. Verbos no infinitivo em ações ("Registrar atividade").
- Nunca exibir números pessoais que não venham de registros. Dados fictícios levam o rótulo **"Dados fictícios"** e um aviso global.
- Estados vazios explicam **o que aparecerá** e **de onde vem**.
- Módulos não implementados dizem "Em desenvolvimento" e a fase prevista.
- Bloco planejado cujo horário passou aparece esmaecido com o rótulo "Horário encerrado" — nunca riscado, porque riscar sugere "concluído" e o sistema não sabe disso (RN-02). O que aconteceu de fato vem de Atividades.
- Erros mostram o que fazer a seguir e nunca o texto técnico do servidor; telas de conta não revelam se um e-mail está cadastrado.
- Metas com progresso informado pelo usuário levam o rótulo **manual** (RN-10).
- Cor nunca é a única forma de transmitir informação (prioridade tem texto para leitores de tela; badges têm rótulo).

## 5. Gráficos (Fase 6)

- Recharts, cores a partir dos tokens, sem gradientes ou 3D. Série única sem identidade de entidade
  (ex.: "tempo por dia") usa `--lo-chart-primary` (a cor da marca); entidades (matérias, categorias,
  hábitos) mantêm a paleta categórica fixa `--lo-chart-1…6`, validada para daltonismo.
- Grade tracejada discreta (`3 4`).
- Planejado em traço/contorno, realizado em preenchimento — reforça RN-02 visualmente.
- Todo gráfico com título, unidades e tabela equivalente acessível; em telas estreitas, rótulos reduzidos e rolagem do gráfico, nunca da página.

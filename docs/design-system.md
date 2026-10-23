# LifeOS — Design system

Fonte: `src/styles/index.css` (tokens) e `src/components/ui/` (primitivos).

## 1. Direção visual

**"Papel e pinho."** Uma ferramenta calma, de uso diário, que precisa ser lida rápido e por muito tempo.

- Base neutra **quente** no claro (tons de papel) e **grafite** no escuro — evita o branco-azulado genérico de painéis administrativos.
- Cor primária **pinho** (verde-azulado profundo): foco, constância, crescimento. Usada com parcimônia em ações, estado ativo e progresso.
- Destaque **âmbar**: tempo, atenção e metas. Aparece no relógio da marca e em itens "para hoje".
- Profundidade discreta: bordas finas + sombras suaves no claro; superfícies em camadas no escuro (sombras quase não aparecem em fundos escuros).
- Um único gradiente sutil ("hero glow") no topo do dashboard. Nenhum outro elemento decorativo.

## 2. Tokens

Três camadas:

1. **Primitivas** (`--sand-*`, `--ink-*`, `--pine-*`, `--amber-*`): paleta crua, nunca usada em componentes.
2. **Semânticas** (`--lo-*`): redefinidas por tema em `[data-theme]`.
3. **Utilitários Tailwind** (`@theme inline`): `bg-surface`, `text-fg-muted`, `border-border`, `shadow-elev-2`…

### Cores semânticas

| Token (utilitário)                                 | Uso                                                                |
| -------------------------------------------------- | ------------------------------------------------------------------ |
| `bg`                                               | Fundo da página                                                    |
| `surface`                                          | Cards, sidebar                                                     |
| `surface-muted`                                    | Áreas secundárias, trilhas de progresso, hover                     |
| `surface-raised`                                   | Elementos acima da superfície (segmento ativo, menus)              |
| `border` / `border-strong`                         | Divisórias / contornos de controles e estados vazios               |
| `fg` / `fg-muted` / `fg-subtle` / `fg-disabled`    | Texto primário / secundário / terciário e metadados / desabilitado |
| `primary`, `primary-hover`, `primary-fg`           | Ação principal                                                     |
| `primary-soft`, `primary-soft-fg`                  | Item ativo na navegação, destaques suaves                          |
| `accent`, `accent-soft`, `accent-soft-fg`          | Tempo, metas, avisos de demonstração                               |
| `success`, `warning`, `danger`, `info` (+ `-soft`) | Estados                                                            |
| `focus`                                            | Anel de foco                                                       |
| `overlay`                                          | Fundo de diálogos                                                  |

### Contraste (WCAG 2.2)

Pares verificados para texto de corpo (≥ 4,5:1):

| Par                                           | Claro     | Escuro |
| --------------------------------------------- | --------- | ------ |
| `fg` sobre `surface`                          | 16,4:1    | 15,0:1 |
| `fg-muted` sobre `surface`                    | 7,4:1     | 8,3:1  |
| `fg-subtle` sobre `surface`                   | 5,2:1     | 5,8:1  |
| `fg-subtle` sobre `surface-muted` (pior caso) | 4,6:1     | 5,4:1  |
| `primary-fg` sobre `primary`                  | 6,4:1     | 6,4:1  |
| `primary-soft-fg` sobre `primary-soft`        | 6,7:1     | 8,5:1  |
| Badges de estado (texto sobre fundo `-soft`)  | 4,6–6,4:1 | ≥ 5:1  |

Valores calculados com a fórmula de luminância relativa da WCAG a partir dos hexadecimais dos tokens.

`fg-disabled` é intencionalmente abaixo de 4,5:1 e só deve ser usado em controles desabilitados (isentos pela WCAG). Revalidar sempre que um token mudar.

### Tipografia

- Família: **Geist** (variável, empacotada localmente via `@fontsource-variable/geist` — sem requisições a terceiros). Fallback: fontes do sistema.
- Números: `.tabular` (algarismos tabulares) em horários e durações, para que não "pulem".

| Utilitário      | Tamanho / linha | Uso                                              |
| --------------- | --------------- | ------------------------------------------------ |
| `text-caption`  | 12 / 16         | Metadados, badges                                |
| `text-body-sm`  | 13 / 20         | Listas, navegação                                |
| `text-body`     | 15 / 24         | Texto corrido (padrão)                           |
| `text-title-sm` | 17 / 24         | Títulos de card                                  |
| `text-title`    | 22 / 30         | Título de página (celular)                       |
| `text-display`  | 30 / 36         | Título de página (≥ 640 px), números de destaque |

### Espaçamento

Escala do Tailwind (base 4 px). Convenções:

- Padding de card: 20 px (`px-5`). Gap entre cards: 16 px (`gap-4`).
- Gutter da página: 16 px (celular), 24 px (≥ 640), 40 px (≥ 1024). Largura máxima do conteúdo: 1200 px.
- Grade do dashboard: 1 coluna (< 768), 2 colunas (768–1279) e 12 colunas só a partir de 1280 px (`xl`). Entre 1024 e 1279 a sidebar ocupa ~256 px e três cards lado a lado truncariam os títulos — verificado com capturas em 1024 px.

### Raios

`rounded-sm` 6 · `rounded-md` 10 (controles) · `rounded-lg` 14 (cards) · `rounded-xl` 20.

### Elevação

`shadow-elev-1` (cards e controles), `shadow-elev-2` (hover, popovers), `shadow-elev-3` (gaveta, diálogos).

### Movimento

- Durações de 150–240 ms com `ease-out-soft`. `animate-fade-up` na entrada de páginas.
- `prefers-reduced-motion: reduce` desativa animações e transições globalmente.

### Foco e interação

- `:focus-visible` com contorno de 2 px na cor `focus` e deslocamento de 2 px — nunca removido sem substituto.
- Alvos de toque ≥ 40 px (botões `sm`) e ≥ 44 px (`md`, itens de navegação móvel).
- `active:translate-y-px` em botões como resposta tátil.

## 3. Componentes

| Componente                             | Arquivo                                 | Notas                                                                                                                                        |
| -------------------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `Button`, `buttonClasses`              | `ui/Button.tsx`, `ui/button-classes.ts` | Variantes `primary`, `secondary`, `ghost`, `danger`; `buttonClasses` estiliza `<Link>` sem aninhar botões em links                           |
| `Card`, `CardHeader`, `CardBody`       | `ui/Card.tsx`                           | `section` rotulada por `aria-labelledby`                                                                                                     |
| `Badge`                                | `ui/Badge.tsx`                          | Tons semânticos; nunca a única pista de significado                                                                                          |
| `EmptyState`, `ErrorState`, `Skeleton` | `ui/States.tsx`                         | Estados padronizados de dados                                                                                                                |
| `ProgressBar`                          | `ui/ProgressBar.tsx`                    | `role="progressbar"` com `aria-valuetext` em unidades do domínio                                                                             |
| `SegmentedControl`                     | `ui/SegmentedControl.tsx`               | Radio group acessível (setas)                                                                                                                |
| `PageHeader`                           | `layout/PageHeader.tsx`                 | Título único `h1` por página                                                                                                                 |
| `TextField`, `SelectField`             | `ui/Field.tsx`                          | Rótulo visível, dica e erro ligados por `aria-describedby`, `aria-invalid`, 44 px de altura; compatíveis com `register()` do React Hook Form |
| `Notice`                               | `ui/Notice.tsx`                         | Aviso em linha (info/sucesso/alerta/erro); erro usa `role="alert"`, os demais `role="status"`                                                |
| `AuthLayout`                           | `modules/auth/AuthLayout.tsx`           | Cartão central das telas públicas, com marca e seletor de tema; sem rolagem horizontal em 360 px                                             |
| `AccountPanel`                         | `layout/AccountPanel.tsx`               | Identificação do usuário e "Sair" na sidebar e na gaveta                                                                                     |
| `FullPageStatus`, `SessionLoading`     | `layout/FullPageStatus.tsx`             | Tela cheia para verificação de sessão e configuração ausente                                                                                 |

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

- Recharts, cores a partir dos tokens (`primary`, `accent`, neutros), sem gradientes ou 3D.
- Planejado em traço/contorno, realizado em preenchimento — reforça RN-02 visualmente.
- Todo gráfico com título, unidades e tabela equivalente acessível; em telas estreitas, rótulos reduzidos e rolagem do gráfico, nunca da página.

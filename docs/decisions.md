# LifeOS — Registro de decisões arquiteturais (ADR)

Formato: contexto → decisão → consequências. Status: **Aceita**, **Proposta**, **Substituída**.

---

## ADR-001 — SPA com React, TypeScript estrito e Vite

**Status:** Aceita (Fase 1)

**Contexto.** Produto pessoal com muita interação no cliente (cronômetro, calendário, formulários), sem necessidade de SEO, e backend gerenciado (Supabase).

**Decisão.** SPA com React 19, TypeScript 6 em modo estrito (incluindo `noUncheckedIndexedAccess` e `exactOptionalPropertyTypes`) e Vite 8.

**Consequências.** Build e desenvolvimento rápidos; nenhum servidor próprio para manter. SSR/SEO não são objetivos. Se surgir necessidade de renderização no servidor, migrar para o modo _framework_ do React Router.

## ADR-002 — React Router 7 em modo de dados, rotas derivadas de um registro de módulos

**Status:** Aceita

**Contexto.** Doze módulos aparecem em quatro lugares (rotas, sidebar, gaveta, barra inferior). Listas duplicadas divergem.

**Decisão.** `src/app/modules.ts` é a fonte única; `router.tsx`, a navegação e os testes derivam dela. `createBrowserRouter` (modo de dados) prepara _loaders_ e _lazy_ para as próximas fases.

**Alternativas.** React Router 8 (lançado recentemente) — adiado até o ecossistema estabilizar; a migração a partir da v7 é planejada como pequena. TanStack Router — tipagem excelente, mas adiciona curva de aprendizado sem ganho decisivo aqui.

**Consequências.** Um teste garante que não há links internos sem destino.

## ADR-003 — Tailwind CSS 4 com tokens semânticos em variáveis CSS

**Status:** Aceita

**Decisão.** Tokens em variáveis CSS (`--lo-*`) redefinidas por tema e expostas ao Tailwind via `@theme inline`. Tema escuro por atributo `data-theme` (não por media query) para permitir escolha manual.

**Consequências.** Componentes usam `bg-surface`/`text-fg-muted` e funcionam nos dois temas sem `dark:`. Trocar a paleta é mexer em um único arquivo.

## ADR-004 — Sem biblioteca de componentes; primitivos próprios

**Status:** Aceita

**Contexto.** Bibliotecas completas (MUI, Chakra) impõem visual próprio; shadcn/ui traz Radix + utilitários.

**Decisão.** Poucos primitivos próprios (Button, Card, Badge, States, ProgressBar, SegmentedControl). Para componentes com acessibilidade complexa (menus, combobox, popover, date picker), adotar **Radix UI** pontualmente quando forem necessários, em vez de reimplementar.

**Consequências.** Identidade visual própria e poucos KB. Gaveta móvel e radio group foram implementados manualmente seguindo WAI-ARIA e cobertos por testes.

## ADR-005 — Supabase como backend definitivo, segurança no banco

**Status:** Aceita — implementada na Fase 2 (ver ADR-012 a ADR-021)

**Decisão.** Supabase Auth + PostgreSQL com RLS em todas as tabelas, constraints e funções para regras invariantes. O cliente usa apenas a chave pública (`publishable`, ou a `anon` legada).

**Consequências.** Isolamento entre contas desde o início; regras testáveis com pgTAP. Lógica crítica (encerrar sessão, calcular duração) em funções SQL transacionais.

## ADR-006 — `localStorage` apenas para preferências do dispositivo

**Status:** Aceita

**Decisão.** Somente preferências (tema, fonte de dados de desenvolvimento), sempre validadas com Zod e com tratamento de exceções. Dados pessoais nunca ficam apenas no navegador.

**Exceção (Fase 2).** Os tokens da sessão ficam no `localStorage` sob a chave `lifeos-auth`, gerenciados pelo supabase-js. Guardá-los em cookie `HttpOnly` exigiria um servidor próprio, que o projeto não tem (ADR-001). A mitigação é não ter scripts de terceiros, não injetar HTML de usuário e manter o token de acesso curto (1 h, com renovação rotativa).

## ADR-007 — Estado de servidor: hooks com repositórios agora; TanStack Query depois

**Status:** Substituída pela ADR-023 (Fase 3)

**Contexto.** Nesta fase há uma única leitura (dashboard) e nenhuma mutação.

**Decisão.** Hooks com máquina de estados explícita + interface de repositório. Reavaliar TanStack Query no início da Fase 3, quando houver mutações, invalidação e cache entre telas.

## ADR-008 — Biblioteca de calendário

**Status:** Decidida na ADR-026 (FullCalendar standard, só recursos MIT)

| Opção                                            | Licença      | Pontos fortes                                                      | Pontos fracos                                                                                 |
| ------------------------------------------------ | ------------ | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| **FullCalendar** (standard)                      | MIT          | Madura, visões dia/semana/mês, arrastar/redimensionar              | Recursos de _timeline/resources_ são **premium (comerciais)**; customização visual trabalhosa |
| **Schedule-X**                                   | MIT (núcleo) | Moderna, temas, mobile, drag-and-drop por plugin                   | Alguns plugins premium; comunidade menor                                                      |
| **react-big-calendar**                           | MIT          | Simples, integração React                                          | Visual datado, acessibilidade e mobile limitados                                              |
| **Implementação própria** (grade CSS + date-fns) | —            | Controle total de design, acessibilidade e "planejado × realizado" | Custo alto: arrastar, fusos, sobreposição                                                     |

**Recomendação preliminar.** Prototipar a visão semanal com **Schedule-X** e com uma grade própria. Escolher pela qualidade em 360 px, operação por teclado e facilidade de sobrepor "realizado" ao "planejado". Nenhuma dependência paga será introduzida sem aviso.

## ADR-009 — Bibliotecas adiadas

**Status:** Aceita

Recharts (Fase 6), React Hook Form (Fase 3, com `@hookform/resolvers` + Zod), Playwright (Fase 8), supabase-js (Fase 2) **não** foram instalados agora: nenhuma funcionalidade desta fase os utiliza. Zod já é usado (validação de preferências).

`eslint-plugin-jsx-a11y` não suporta ESLint 10 na versão atual; a acessibilidade é coberta por testes com consultas por papel/rótulo e revisão manual. Reavaliar quando houver suporte.

## ADR-010 — Dados de demonstração isolados e sinalizados

**Status:** Aceita

**Decisão.** Uma "fonte de dados" selecionável em Configurações: _sem backend_ (padrão, mostra o estado vazio real), _demonstração_, _simular erro_, _simular lentidão_. Dados de demonstração vivem em `demo-dashboard.ts`, carregam `origin: 'demo'` e disparam um aviso global.

**Consequências.** É possível avaliar o design e todos os estados sem violar o princípio "nenhuma estatística inventada como dado pessoal". Na Fase 2, o modo padrão passa a ser o Supabase e os demais ficam restritos ao ambiente de desenvolvimento.

## ADR-011 — Fonte tipográfica empacotada localmente

**Status:** Aceita

**Decisão.** Geist via `@fontsource-variable/geist`, servida pelo próprio app.

**Consequências.** Sem requisições a terceiros (privacidade) e funciona offline; ~50 KB de fonte variável.

---

## Fase 2 — Backend, autenticação e segurança

## ADR-012 — Supabase Auth com e-mail e senha, fluxo PKCE

**Status:** Aceita

**Contexto.** Era preciso ter cadastro, login, recuperação de senha e confirmação de e-mail reais, sem servidor próprio.

**Decisão.** Usar e-mail e senha com `flowType: 'pkce'`. Os links de e-mail trazem um código de uso único que é trocado por sessão no mesmo navegador, sem tokens no fragmento da URL. A sessão é persistida e renovada automaticamente pelo supabase-js. Login social e magic link ficam para depois (são fáceis de acrescentar).

**Consequências.** O link precisa ser aberto no navegador em que o pedido foi feito; em outro navegador, a tela explica o que fazer. As URLs de retorno precisam estar na allowlist do projeto.

## ADR-013 — Isolamento por FKs compostas `(fk, user_id)` além do RLS

**Status:** Aceita

**Contexto.** O RLS impede ler e gravar linhas alheias, mas as checagens de FK do PostgreSQL ignoram o RLS. Sem cuidado extra, um usuário poderia criar uma tarefa própria apontando para o projeto de outra pessoa (conhecendo o UUID).

**Decisão.** Toda tabela-pai expõe `unique (id, user_id)` e toda FK entre dados pessoais é composta com `user_id`. Exclusões que anulam uma referência usam `ON DELETE SET NULL (coluna)` (PostgreSQL 15+), preservando o `user_id`.

**Consequências.** Associações entre contas são impossíveis por construção. Um teste de catálogo falha se uma FK nova for criada sem `user_id`.

## ADR-014 — Padrão de segurança aplicado por função e verificado por catálogo

**Status:** Aceita

**Decisão.** O utilitário `private.secure_owned_table(tabela)`, usado só nas migrations, aplica em toda tabela pessoal: RLS, quatro políticas do dono (`user_id = (select auth.uid())`, com `WITH CHECK` em INSERT/UPDATE), revogação de `anon`/`PUBLIC` e o trigger de auditoria e imutabilidade do dono. Utilitários vivem no schema `private`, que a API não expõe. Funções são `SECURITY INVOKER`, exceto `delete_my_account` e o trigger de cadastro, ambas com `search_path = ''`. Não há views em `public`.

**Consequências.** As regras ficam uniformes e as exceções, explícitas (`profiles` e `recommendations` têm GRANT por coluna). O teste `01_security_catalog` verifica as propriedades gerais, e tabelas futuras não escapam delas.

## ADR-015 — Valores enumerados como `text` + `CHECK`

**Status:** Aceita

**Decisão.** Não usar `CREATE TYPE … AS ENUM`. Status, prioridades e tipos usam `text` com `CHECK`.

**Consequências.** Acrescentar ou remover um valor é uma migration simples (trocar o `CHECK`); com `ENUM`, remover um valor exige recriar o tipo. Os tipos gerados ficam como `string`, e as uniões são definidas nos schemas Zod e em `types/domain.ts`.

## ADR-016 — Estratégia de datas: instantes, datas de calendário e fuso do perfil

**Status:** Aceita

**Decisão.** Instantes em `timestamptz` (UTC). Prazos e dias em `date`, sem fuso. Eventos de dia inteiro usam um intervalo de datas com fim exclusivo. O "dia" de um usuário é calculado no servidor com o fuso IANA do perfil (dias de 23 ou 25 horas são tratados corretamente). Recorrências são RRULE mais o fuso do evento. A interface formata com `Intl` e o fuso do perfil, nunca com o fuso implícito do navegador.

**Consequências.** Mudar o fuso do perfil muda o que é "hoje" sem alterar nenhum dado. O tempo de sessões que atravessam a meia-noite é dividido exatamente entre os dias.

## ADR-017 — Sem tabela de livros nesta fase

**Status:** Aceita

**Contexto.** O brief citava "livros e registros de leitura, caso o módulo seja utilizado". Nenhum módulo do roadmap depende de um catálogo de livros.

**Decisão.** Não criar tabelas de leitura. Leitura é registrada como atividade (categoria), hábito ("20 páginas") ou meta manual ("6 livros").

**Consequências.** Se um módulo de leitura surgir, as tabelas `books` e `reading_logs` entram por migration nova, ligadas a `activities` para não duplicar o tempo realizado.

## ADR-018 — Atividades como fonte única do tempo realizado, com duração calculada no servidor

**Status:** Aceita

**Decisão.** `activities.duration_seconds` é sempre calculada por trigger: na manual, fim menos início; na de cronômetro, o tempo líquido da sessão menos as pausas. Encerrar uma sessão cria a atividade na mesma transação, e corrigir a sessão ou as pausas a recalcula. "Pausada" não é status armazenado; é a existência de uma pausa aberta.

**Consequências.** O cliente não consegue forjar duração (há teste). A cópia dos instantes da sessão em `activities` é a única desnormalização do modelo, mantida por triggers e testada.

## ADR-019 — React Hook Form adotado na Fase 2

**Status:** Aceita (antecipa a ADR-009)

**Decisão.** Os formulários de autenticação e de configurações usam React Hook Form com `@hookform/resolvers/zod`. Os schemas Zod são os mesmos usados na validação e nos testes.

**Consequências.** As dependências instaladas na Fase 2 são `@supabase/supabase-js` 2.118, `react-hook-form` 7.90 e `@hookform/resolvers` 5.9. Recharts e Playwright continuam adiados.

## ADR-020 — Contrato do dashboard validado com Zod e testado com o JSON real do banco

**Status:** Aceita

**Decisão.** `dashboard_summary` devolve `jsonb` no formato exato de `DashboardSummary`. A interface valida a resposta com `dashboardSummarySchema` antes de usá-la. A fixture do teste é a saída real da função num banco com dados de cenário, e não um exemplo escrito à mão.

**Consequências.** Se banco e interface divergirem, o usuário vê um erro explícito ("formato inesperado") em vez de uma tela quebrada, e o teste de contrato falha antes do deploy.

## ADR-021 — Estratégia de testes do backend em três níveis

**Status:** Aceita

**Decisão.**

1. **pgTAP** (`supabase/tests/database`): roda com `supabase test db` (Docker) ou com `npm run db:test:local`, que usa PostgreSQL puro, um shim mínimo do Supabase e um banco recriado a cada execução.
2. **Vitest com cliente falso**: fluxos de interface; só a rede é simulada.
3. **Integração** (`npm run test:integration`): duas contas reais num projeto Supabase, com isolamento verificado pela API pública. Sem credenciais, o teste é ignorado com aviso e nunca "passa" sem testar.

**Consequências.** Testes de segurança não dependem da interface. A suíte pgTAP foi validada com mutações (RLS desligado, política permissiva, FK sem `user_id`), e todas foram detectadas.

## ADR-022 — Roadmap deslocado: a Fase 2 é só infraestrutura

**Status:** Aceita

**Contexto.** O roadmap original colocava as telas de Estudos e Atividades na Fase 2. O escopo desta fase foi definido como infraestrutura de dados, autenticação e segurança.

**Decisão.** Estudos e Atividades passam para a Fase 3, e os demais módulos avançam uma fase. O esquema e as RPCs desses módulos já existem e estão testados.

**Consequências.** A interface mostra as fases corretas ("Fase 3 · em breve"), sem prometer o que esta versão não entrega.

## ADR-023 — TanStack Query para o estado de servidor (revisão da ADR-007)

**Status:** Aceita (Fase 3)

**Contexto.** Com os módulos centrais, várias telas leem as mesmas tabelas (tarefas aparecem em
Tarefas, Projetos, Calendário e Dashboard) e as escritas são frequentes. Hooks manuais com
`AbortController` não ofereciam cache compartilhado nem invalidação coordenada.

**Decisão.** TanStack Query v5. Um `QueryClient` por usuário (recriado ao trocar de conta), cache só em
memória, `staleTime` de 30 s, repetição automática apenas para falha de rede. Erros passam por
`toAppError`; sessão expirada em qualquer leitura/escrita leva ao login. O dashboard também usa o cache.

**Consequências.** Nenhum dado de negócio no `localStorage` competindo com o banco. Leituras são
deduplicadas entre telas; a dependência adiciona ~13 kB gzip.

## ADR-024 — Invalidação por domínio e atualização otimista só com desfazer

**Status:** Aceita (Fase 3)

**Decisão.** Toda chave de leitura começa pelo domínio (`tasks`, `sessions`, `goals`…). Cada escrita
declara o que altera e `lib/query/domains.ts` expande para os dependentes (ex.: concluir tarefa →
projetos, metas, calendário, dashboard), revalidando no sucesso **e** na falha. Atualização otimista
só onde a resposta imediata importa (mover cartão no Kanban, concluir tarefa), sempre com
`onMutate`/`onError` restaurando o estado anterior.

**Consequências.** Editar ou excluir um registro atualiza estatísticas em todas as telas sem lógica
específica por tela; o mapa de dependências é testado.

## ADR-025 — Revisão espaçada por escada de intervalos

**Status:** Aceita (Fase 3) — substitui a decisão adiada sobre SM-2/FSRS.

**Decisão.** Escada fixa 1 · 3 · 7 · 14 · 30 · 60 · 120 · 240 dias com notas 1–4 (errei volta a 1 dia;
difícil mantém; bom sobe um degrau; fácil sobe dois), calculada no banco
(`private.review_next_interval`) e espelhada na interface só para mostrar a próxima data antes de
confirmar (teste garante que as duas coincidem).

**Consequências.** Regra simples, previsível e explicável na tela. Não afirmamos superioridade
científica sobre SM-2/FSRS; trocar o algoritmo exige apenas outra função e uma migration.

## ADR-026 — Calendário: FullCalendar em "horário de parede" e recorrência expandida na interface

**Status:** Aceita (Fase 3) — resolve a ADR-008.

**Decisão.** FullCalendar 6 (MIT; plugins daygrid, timegrid, interaction) para mês/semana/dia, arrastar
e redimensionar. O calendário roda em UTC e recebe horários **locais do fuso do perfil** como se fossem
UTC ("horário de parede"); as conversões ficam em `calendar-items.ts`. Recorrências são guardadas como
regra (subconjunto da RFC 5545: DAILY/WEEKLY/MONTHLY/YEARLY, INTERVAL, BYDAY, COUNT, UNTIL) e
expandidas em TypeScript apenas na janela visível, no fuso do evento; partes não suportadas mostram só
a primeira ocorrência, sinalizada. Exceções (cancelada/alterada) são identificadas pelo início
original. Dashboard e calendário usam a mesma expansão.

**Consequências.** Sem plugin de fusos nomeados nem cópias de ocorrências no banco; horário de verão
correto. O FullCalendar fica num pedaço carregado só na tela do calendário (~84 kB gzip).

## ADR-027 — Domínio de tópico como histórico de eventos

**Status:** Aceita (Fase 3)

**Decisão.** Não existe "nível de domínio" editável. `topic_mastery_events` guarda cada avaliação com a
origem (`review`, `session`, `manual`); o atual é o mais recente. Ajuste manual é um registro novo,
identificado como manual e com motivo opcional.

## ADR-028 — Progresso de metas calculado no banco, por ciclo

**Status:** Aceita (Fase 3)

**Decisão.** Sete tipos de meta com valor derivado dos registros em `private.goal_value`, por ciclo
(`private.goal_cycle`) no fuso e no início de semana do perfil. Metas manuais usam lançamentos datados
(`goal_progress_entries`) em vez de um número sobrescrito. Mudanças de configuração vão para
`goal_changes`.

**Consequências.** Histórico estável ao editar a meta; arquivar preserva tudo. O cálculo por ciclo é
feito por consulta (adequado à escala pessoal; materialização fica para a Fase 7 se necessário).

## ADR-029 — Sequências de hábito sobre períodos elegíveis, em TypeScript

**Status:** Aceita (Fase 3)

**Decisão.** Elegibilidade, sequência e consistência são funções puras em
`modules/habits/logic/habits.ts`, sobre as marcações do último ano. Hábito "N vezes por semana" é
avaliado por semana; o período atual não quebra a sequência.

**Consequências.** Regras fáceis de testar e explicar; sequências mais longas que 365 dias aparecem
truncadas (limitação documentada).

## ADR-030 — dnd-kit para o Kanban; code splitting por rota

**Status:** Aceita (Fase 3)

**Decisão.** `@dnd-kit/core` (sensores de ponteiro, toque e teclado; anúncios em português) para mover
cartões entre colunas. Páginas dos módulos carregadas sob demanda com `React.lazy`.

**Consequências.** Kanban utilizável por teclado; cada módulo baixa só o próprio código. O pacote
inicial (auth, dashboard, supabase-js) ainda passa de 500 kB sem compressão (~230 kB gzip).

## ADR-031 — Estatísticas agregadas no banco, matemática em funções puras

**Status:** Aceita (Fase 4)

**Contexto.** As análises precisam somar tempo por dia local (com pausas e meia-noite), contar
eventos por período e comparar períodos, sem baixar todos os registros para o navegador.

**Decisão.** Agregações em funções SQL `stats_*` (SECURITY INVOKER, sob RLS, período ≤ 731 dias),
devolvendo só totais e séries diárias validadas com Zod. Razões, médias, medianas, comparação e
consistência ficam em funções TypeScript puras com testes (`analytics/logic`). Um domínio de cache
`stats` é invalidado por toda escrita que alimenta as estatísticas.

**Consequências.** Números coerentes com os registros após correções e exclusões; nenhuma conta
dentro de componentes; o navegador recebe poucos dados.

## ADR-032 — Comparação com período anterior equivalente e alinhado

**Status:** Aceita (Fase 4)

**Decisão.** O período anterior é o de calendário anterior (mês anterior com a própria duração;
personalizado: mesma duração). Período em andamento compara com os primeiros N dias do anterior.
Variação percentual é `null` quando o anterior é 0 (texto “sem base”), nunca 100 % ou ∞.

## ADR-033 — Recorrência: “só esta” por exceção, “esta e as seguintes” por divisão da série

**Status:** Aceita (Fase 4)

**Decisão.** Alterar uma ocorrência grava uma exceção `modified` identificada pelo início
original. “Esta e as seguintes” encerra a série original antes da ocorrência (UNTIL no dia
anterior, ou COUNT = ocorrências mantidas) e cria uma série nova a partir dela, herdando o fim;
exceções da série original a partir do ponto de divisão são removidas.

**Consequências.** O passado não muda; nenhuma ocorrência é duplicada ou perdida (teste em
`conflicts.test.ts`), inclusive na mudança de horário de verão.

## ADR-034 — Recomendações por regras explícitas, persistidas com deduplicação no banco

**Status:** Aceita (Fase 4)

**Contexto.** O brief proíbe IA/LLM e exige explicação, controle do usuário e deduplicação.

**Decisão.** Regras TypeScript puras (`rules.ts`) avaliadas no navegador; persistência só por
`sync_recommendations` (gatilho bloqueia inserção direta), com índice único de uma aberta por
escopo, período de espera após rejeição, encerramento automático quando a condição deixa de valer
e encerramento imutável. Regras sem dados suficientes não são “avaliadas” e não fecham nada.
Aceitar apenas registra a decisão — ações são atalhos de navegação.

**Alternativas.** Gerar no banco (SQL extenso, difícil de testar e explicar); gerar só na
interface sem persistir (sem histórico, sem adiamento).

## ADR-035 — Planejamento por heurística gulosa explicável

**Status:** Aceita (Fase 4)

**Decisão.** Algoritmo determinístico (prazo → prioridade → criação; primeiros horários livres nas
janelas, período preferido primeiro, blocos mín./máx., descanso, limite diário). Histórico só
ajusta estimativas com ≥ 5 amostras. Cada proposta tem motivos; nada é criado sem confirmação e
nada existente é alterado. A interface diz que não é necessariamente o melhor plano.

**Alternativas.** Solver de otimização (opaco, “ótimo” enganoso para preferências humanas).

## ADR-036 — Recharts com tabela equivalente e paleta categórica fixa

**Status:** Aceita (Fase 4)

**Decisão.** Recharts 3 para barras/linhas, sempre com “Ver dados em tabela”, tooltip, legenda
para 2+ séries e cores fixas por entidade (tokens `--lo-chart-1..6`, claros e escuros,
escolhidos para separação sob daltonismo). Eixo Y único; contagens com eixo inteiro.

**Consequências.** Gráficos legíveis em 360 px e acessíveis sem depender de cor; o Recharts só é
baixado nas telas de análise (code splitting).

## ADR-037 — Listas paginadas (`fetchAll`) e simulação com o teto real do servidor

**Status:** Aceita (auditoria da Fase 4)

**Contexto.** As leituras de lista usavam `.limit(2000)` ou `.limit(10000)`. O PostgREST do Supabase
devolve no máximo `max_rows` linhas por requisição (1000 por padrão) **sem erro**, então listas maiores
eram truncadas em silêncio. As marcações de hábito, por exemplo, vinham em ordem crescente: com cerca
de 1.100 marcações num ano, as mais **recentes** sumiam e a consistência saía errada. A simulação usada
nos testes não tinha esse teto, então nenhum teste pegava o problema.

**Decisão.** Toda lista usa `fetchAll`: páginas de 1000 por `.range()`, ordenação total terminando em
`id` e um teto de 50.000 linhas que gera **erro explícito** em vez de truncar. A simulação de testes
passa a aplicar o mesmo teto de 1000 linhas e a respeitar o deslocamento do `.range()`.

**Consequências.** Listas com mais de 1000 itens fazem mais de uma requisição. Um teto de 1000 no
servidor vira requisito documentado (`docs/supabase-setup.md`). Paginação por cursor (keyset) continua
desnecessária para o volume de uso pessoal.

## ADR-038 — Ausência de dado nunca é desenhada como zero

**Status:** Aceita (auditoria da Fase 4)

**Decisão.** Nos gráficos e cartões, dias futuros, métricas sem nenhum registro e comparações sem base
aparecem como “—”, estado vazio ou “sem dado” (inclusive no tooltip), nunca como 0. A evolução temporal
usa granularidade por dia, semana ou mês conforme o tamanho do período, e baldes parciais são marcados
com `*` e descritos na tabela (`analytics/logic/evolution.ts`). Taxas são comparadas em pontos
percentuais.

**Consequências.** Barras menores nas bordas de um período não são lidas como queda, e o usuário não
confunde “não registrei” com “não fiz”.

## ADR-039 — Testes de tela pré-carregam as páginas lazy

**Status:** Aceita

**Contexto.** No Windows, com a suíte inteira em paralelo, o **primeiro** import de uma página
carregada sob demanda num processo frio do Vitest passava de 5 s. Isso estourava a espera do `findBy`
só no primeiro teste de cada arquivo de tela (25 falhas, todas por tempo, nenhuma asserção errada); os
testes seguintes do mesmo arquivo passavam.

**Decisão.** `tests/render-app.tsx` registra um `beforeAll` (prazo de 120 s) que importa todas as
páginas por `PAGE_LOADERS` (`app/page-loaders.ts`), a mesma lista usada pelas rotas. Os limites de
espera dos testes continuam os mesmos.

**Consequências.** O carregamento frio deixa de ser confundido com um elemento ausente, e um elemento
que realmente não aparece continua falhando no prazo normal. Verificado no Windows: 351/351 em 47 s.

## ADR-040 — Callbacks por chamada sempre executam em `useLifeosMutation`

**Status:** Aceita (Fase 5)

**Contexto.** O TanStack Query só chama os callbacks passados a `mutate(vars, { onSuccess })` se o
componente que chamou ainda estiver montado. No LifeOS a escrita termina depois da revalidação, que
muitas vezes desmonta quem chamou: ao encerrar o cronômetro a sessão ativa some (a reflexão não
abria); ao excluir uma matéria a página vira "não encontrada" (o redirecionamento não acontecia). Os
testes de tela não mostravam o problema porque o `act` do Testing Library adia as renderizações; a
jornada ponta a ponta no navegador o revelou.

**Decisão.** `useLifeosMutation` expõe um `mutate` próprio, implementado sobre `mutateAsync`, que
executa `onSuccess`/`onError`/`onSettled` da chamada em qualquer caso. Erros continuam tratados pelo
`onError` do hook (aviso). Teste de regressão em `lib/query/mutations.test.tsx` com o modo `act`
desligado, como no navegador.

**Consequências.** Fluxos "depois de salvar, faça X" funcionam mesmo quando a tela muda; os
callbacks não podem depender de estado do componente desmontado (só navegam ou abrem diálogos de
nível superior).

## ADR-041 — Criação idempotente com id gerado no navegador

**Status:** Aceita (Fase 5)

**Contexto.** Se o servidor grava e a resposta se perde na rede, o app mostra erro e o usuário tenta
de novo — e surgia um registro duplicado (reproduzido com Playwright, `e2e/resilience.spec.ts`).

**Decisão.** O formulário gera o UUID uma vez (`useDraftId`) e o envia em todas as tentativas;
`insertOnce` trata `23505` na chave primária como "já gravado" e lê a linha pelo id (sob RLS). A
marcação de hábito usa a chave natural `(hábito, dia)`. Um id novo só é gerado depois de um
sucesso.

**Alternativas.** Chave de idempotência em tabela própria (mais estrutura sem ganho, já que o id é a
chave natural da criação); desabilitar o botão até a resposta (não resolve a resposta perdida).

**Consequências.** Repetir o envio é seguro em todas as criações dos formulários. Atualizações e
exclusões já eram idempotentes.

## ADR-042 — Cabeçalhos de segurança no deploy e testados localmente

**Status:** Aceita (Fase 5)

**Decisão.** `vercel.json` define CSP, `nosniff`, `Referrer-Policy`, `X-Frame-Options`,
`Permissions-Policy` e HSTS, além do roteamento da SPA e do cache. O único script embutido (tema antes
da pintura) virou `public/theme-init.js`, para a CSP aceitar só scripts do próprio site. O
`vite preview` lê os mesmos cabeçalhos de `vercel.json` (acrescentando ao `connect-src` a URL do
Supabase configurado), então a suíte ponta a ponta roda sob a política de produção e qualquer
violação aparece como erro de console e falha o teste — foi assim que a fonte `data:` do
FullCalendar foi detectada e liberada.

**Consequências.** `style-src 'unsafe-inline'` permanece (FullCalendar e Recharts geram estilos
embutidos); estilos não executam código. Um domínio personalizado do Supabase precisa ser
acrescentado ao `connect-src`.

## ADR-043 — Página de erro própria e recarga em versão desatualizada

**Status:** Aceita (Fase 5)

**Contexto.** Sem `errorElement`, um erro de renderização mostrava a página padrão do React Router
(em inglês, com a pilha). Depois de um deploy, uma aba aberta pede arquivos de tela que já não
existem e falhava do mesmo jeito.

**Decisão.** `RouteError` na raiz e dentro do layout (a navegação continua visível): mensagem em
português, sem detalhes técnicos, botões "Recarregar" e "Voltar ao início". Falha de carregamento de
módulo recarrega a página **uma vez** (marcada em `sessionStorage`, para não entrar em ciclo).

## ADR-044 — Dados de demonstração fora do pacote de produção; bibliotecas em pacotes próprios

**Status:** Aceita (Fase 5)

**Decisão.** Os modos de inspeção (demonstração, erro e lentidão simulados) já eram ignorados em
produção; agora o desvio usa `import.meta.env.DEV`, constante no build, e os dados fictícios nem
chegam ao pacote publicado. React/React Router, Supabase e formulários/consultas ficam em pacotes
separados (`codeSplitting.groups` no Vite): o total baixado na primeira visita é o mesmo (~244 kB
comprimidos), mas um deploy que só muda o app reaproveita do cache os ~200 kB das bibliotecas, e o
aviso de pacote grande do build deixou de existir.

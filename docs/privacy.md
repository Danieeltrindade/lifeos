# LifeOS — Privacidade e ciclo de vida dos dados

O LifeOS guarda dados pessoais sensíveis (rotina, desempenho, humor, diário). Este documento
registra o que está implementado, como exportar e excluir dados, e o que ainda precisa ser feito
antes de abrir o sistema para outras pessoas. Referência legal: LGPD (Lei 13.709/2018).

## 1. Princípios

1. **Isolamento por padrão.** Cada linha pertence a exatamente uma conta (RN-01). O acesso é decidido
   no banco (RLS + FKs compostas), não na interface.
2. **Mínimo necessário.** O cadastro pede apenas nome de exibição, e-mail e senha; o fuso horário é
   sugerido pelo navegador e pode ser alterado.
3. **Sem dados pessoais em logs.** O frontend não registra conteúdo do usuário em `console` nem em
   ferramentas de terceiros; erros carregam apenas um código técnico (`AppError.code`). Não há
   analytics nem rastreadores.
4. **Mensagens seguras.** A interface nunca exibe a mensagem crua do banco (que pode citar tabelas
   ou valores) e não revela se um e-mail tem conta (cadastro e recuperação respondem igual).

## 2. O que já está implementado

| Requisito                    | Implementação                                                                                                                                                                                                                                                                                         | Verificação                                               |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Isolamento entre contas      | RLS com 4 políticas do dono em todas as tabelas; FKs compostas `(fk, user_id)`; `user_id` imutável; `anon` sem privilégios                                                                                                                                                                            | pgTAP `01`, `02`; `npm run test:integration`              |
| Proteção do diário           | Mesmo RLS; conteúdo fora de qualquer agregação (`dashboard_summary` não lê `diary_entries`); nunca usado como evidência de recomendação (as regras da Fase 4 não leem o diário). A tela do diário não registra nada em log/console; a busca é feita no navegador sobre as entradas do próprio usuário | pgTAP `02` (B não lê o diário de A, nem via exportação)   |
| Exclusão segura de registros | Regras de `ON DELETE` explícitas por relação (cascata para dependentes, `SET NULL` para referências históricas, bloqueio para fontes de metas)                                                                                                                                                        | pgTAP `03`, `04`; `docs/data-model.md` §5                 |
| Prevenção de órfãos          | Toda FK é composta com `user_id` e tem regra de exclusão; não há tabela sem dono                                                                                                                                                                                                                      | pgTAP `04`: varre todas as tabelas após excluir a conta   |
| Exclusão da conta            | `delete_my_account()` remove `auth.users` → `profiles` → tudo em cascata, na mesma transação. A interface exige a senha e a palavra "EXCLUIR"                                                                                                                                                         | pgTAP `04`; teste de interface em `SettingsPage.test.tsx` |
| Portabilidade (exportação)   | `export_my_data()` (v3) devolve todas as tabelas do usuário em JSON; CSV por tabela e resumo semanal (CSV/JSON) gerados no navegador, sem envio a terceiros (`docs/metrics.md` §9)                                                                                                                    | pgTAP `02` e `04`                                         |
| Segredos fora do navegador   | Só URL + chave publishable no bundle; o app recusa `service_role`/`secret`; `.env*` fora do Git                                                                                                                                                                                                       | `config.test.ts`                                          |
| Sessão                       | Tokens no `localStorage` do próprio domínio (padrão do supabase-js); renovação automática; "Sair" encerra a sessão local; sessão expirada leva ao login com aviso                                                                                                                                     | `auth-flows.test.tsx`                                     |

## 3. Comportamento ao excluir a conta

1. O usuário confirma com a senha (reautenticação) e digita `EXCLUIR`.
2. `public.delete_my_account()` (única função `SECURITY DEFINER` acionável pelo usuário) apaga a
   linha de `auth.users` do próprio `auth.uid()`.
3. A exclusão cascateia para `profiles` e, de lá, para todas as tabelas. Nada fica para trás.
4. A sessão local é encerrada e a tela de login confirma a exclusão.

**Pendente para produção:** backups (PITR) continuam contendo os dados excluídos até expirarem;
a política de privacidade precisa informar o prazo de retenção dos backups do plano contratado.

## 4. A concluir antes de produção

| Item                                          | Por quê                                                                                                                                                                                         | Fase prevista                                                                               |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Política de privacidade e termos publicados   | Base legal e transparência (LGPD art. 9º)                                                                                                                                                       | Antes do primeiro usuário externo                                                           |
| SMTP próprio com domínio verificado           | O servidor de e-mail padrão é só para testes; e-mails de conta são dados pessoais                                                                                                               | Antes do primeiro usuário externo                                                           |
| Prazo de retenção de backups documentado      | A exclusão de conta não alcança backups existentes                                                                                                                                              | Idem                                                                                        |
| Criptografia adicional do diário (opcional)   | O disco do Supabase já é criptografado; avaliar criptografia no cliente (chave do usuário) se o diário for usado para conteúdo muito sensível — com a contrapartida de perder busca no servidor | Avaliar após a Fase 3 (busca hoje é no navegador; criptografia no cliente seria compatível) |
| Registro de consentimento e versão dos termos | Comprovar aceite                                                                                                                                                                                | Antes do primeiro usuário externo                                                           |
| Revisão de logs do Supabase                   | Logs da API podem conter parâmetros de requisição; definir retenção e acesso                                                                                                                    | Fase 9 (qualidade)                                                                          |
| MFA opcional                                  | Conta guarda dados íntimos                                                                                                                                                                      | Fase 9                                                                                      |

## Recomendações e estatísticas (Fase 4)

- As recomendações são calculadas por regras fixas no navegador do próprio usuário, a partir das
  leituras autenticadas; só o resultado (título, motivo, evidências numéricas) é gravado, sob RLS.
  Não há IA, modelo externo nem envio de dados a terceiros.
- As estatísticas são agregadas no banco pelas funções `stats_*` (SECURITY INVOKER: o RLS vale) e
  nunca leem o diário.

## 5. Exportar e excluir: como fazer (Fase 5)

### 5.1 Exportar

| Como                                                        | O que vem                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Configurações → Conta → "Exportar meus dados (JSON)"**    | Um arquivo `lifeos-export` (versão 3) com **todas** as tabelas da conta: perfil, preferências e disponibilidade, projetos, marcos e histórico, tarefas e dependências, matérias, tópicos, domínio, anotações, sessões, pausas, reflexões, revisões (cartões, tentativas, reagendamentos), atividades e categorias, hábitos e marcações, metas, lançamentos, alterações e marcos, diário, eventos e exceções, recomendações, lembretes, revisões semanais e prioridades. Gerado por `export_my_data()` no banco, sob RLS: só os registros da própria conta. |
| **Configurações → Conta → "Exportar uma tabela em CSV"**    | Uma tabela por arquivo, para abrir numa planilha (UTF-8, separador vírgula).                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **Análises → Revisão semanal → "Baixar resumo (CSV/JSON)"** | O resumo da semana em CSV ou JSON (os mesmos números da tela).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

Os arquivos são montados no navegador e baixados direto; nada passa por terceiros. Nenhuma senha,
token ou dado de outra conta entra na exportação (verificado pelo teste de integração
`isolation-sweep` e pelo pgTAP `02`).

### 5.2 Excluir registros

- Cada tela tem **Excluir** com confirmação; a exclusão é definitiva (não há lixeira).
- As relações seguem regras explícitas (`docs/data-model.md` §5 e §9.9):
  - **Dependentes caem junto (cascata):** excluir uma matéria apaga os tópicos, os cartões de
    revisão desses tópicos e as anotações; excluir uma tarefa apaga as subtarefas e as dependências;
    excluir um projeto apaga marcos e histórico de status; excluir um hábito apaga as marcações.
  - **Histórico é preservado sem o vínculo (`SET NULL`):** sessões de estudo, atividades, eventos
    e as tarefas de um projeto excluído continuam existindo (e contando nas estatísticas), apenas
    sem a matéria/tarefa/projeto excluído.
  - **Bloqueio com explicação:** um registro usado como fonte de uma meta não pode ser excluído
    enquanto a meta apontar para ele; a mensagem diz o que fazer.
- O pgTAP `07_phase5_integrity` monta um grafo completo de dados e exclui cada tipo de registro,
  conferindo o que permanece e o que some — nenhuma exclusão deixa linha órfã.

### 5.3 Excluir a conta

**Configurações → Excluir conta → "Quero excluir minha conta"**: pede a senha e a palavra `EXCLUIR`.
Apaga a conta de autenticação e, em cascata, **todas** as linhas de todas as tabelas, numa única
transação (§3). Não há período de carência: depois de confirmada, não pode ser desfeita. Exporte
antes, se quiser guardar os dados.

### 5.4 Limites técnicos (backups e retenção)

- **Backups do Supabase.** Cópias automáticas (e PITR, nos planos que o oferecem) continuam
  contendo os dados excluídos até expirarem. O prazo depende do plano contratado — confira na
  página de preços/documentação do Supabase no momento da publicação e informe-o na política de
  privacidade.
- **Logs.** Os logs da API do Supabase registram endereços e caminhos das requisições. No LifeOS
  essas URLs levam só identificadores e datas (filtros do PostgREST); textos digitados — títulos,
  diário, buscas — vão no corpo das requisições ou são filtrados no próprio navegador. O app não
  grava nada em `console` nem usa ferramentas de analytics.
- **E-mail.** Mensagens de confirmação e recuperação já enviadas ficam na caixa do usuário e nos
  registros do provedor de SMTP.
- **Navegador.** A sessão fica no `localStorage` do domínio do app; "Sair" a remove. Preferências
  locais (tema) continuam no navegador até serem limpas.

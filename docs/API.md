# API para o site e futuros aplicativos

A API usa JSON sob `/api`. O servidor só publica `public/`; arquivos de `server/`,
credenciais, SQL e regras de negócio não são enviados ao navegador. O endereço da
API é público por definição: sua proteção é autenticação, autorização e validação,
não esconder os nomes das rotas. O frontend não calcula valores definitivos.

## Sessão e proteção de alterações

1. `GET /api/csrf`: guarde o cookie `rr_csrf` e o campo JSON `token`.
2. Em **toda** requisição POST, PUT, PATCH ou DELETE, envie o cookie e o cabeçalho
   `X-CSRF-Token: <token>`. Para enviar corpo, use `Content-Type: application/json`.
3. Faça login e preserve também o cookie de sessão retornado (`HttpOnly`).
4. Aplicativos nativos precisam de um cookie jar; o frontend web usa cookies da
   mesma origem. Não há CORS permissivo, tokens no localStorage nem credenciais
   embutidas no JavaScript. Um frontend em outro domínio exige uma política de
   origens explícita, não a remoção dessas proteções.
5. Sessões e chaves CSRF são invalidadas ao reiniciar. Em 401, faça login novamente;
   em 403 de token, obtenha `/api/csrf` novamente antes de repetir conscientemente
   a operação. Nunca repita vendas com um novo identificador após falha de rede.

Erros seguem `{ "error": "mensagem" }`: 400 validação, 401 autenticação,
403 autorização/CSRF, 404 inexistente, 409 conflito de estado/estoque e 429 limite.
Horários de agenda e datas financeiras usam **America/Sao_Paulo**. Timestamps
`created_at`, `started_at` e `completed_at` são UTC. Valores de relatórios são
centavos inteiros; comissão em `commission_bps` usa pontos-base (4500 = 45%).

## Autenticação existente

| Método / rota                    | Uso                                                     |
| -------------------------------- | ------------------------------------------------------- |
| POST `/api/customer/register`    | name, email, cpf, phone, password                       |
| POST `/api/customer/login`       | identifier (CPF/e-mail), password                       |
| GET `/api/customer/session`      | Cliente autenticado, sem CPF completo                   |
| PUT `/api/customer/profile`      | Completar dados de login Google                         |
| POST `/api/customer/logout`      | Encerrar sessão                                         |
| GET `/api/customer/google/start` | OAuth Google configurado no servidor                    |
| POST `/api/admin/login`          | username, password; pode retornar otpRequired/challenge |
| POST `/api/admin/login/otp`      | challenge, code (OTP ou recuperação)                    |
| GET `/api/admin/session`         | Administrador e perfil                                  |
| POST `/api/admin/logout`         | Encerrar sessão administrativa                          |
| POST `/api/admin/otp/setup`      | password; retorna secret e URI para autenticador        |
| POST `/api/admin/otp/enable`     | code; retorna códigos de recuperação uma vez            |
| POST `/api/admin/otp/disable`    | password, code                                          |

CPF tem validação matemática e unicidade; isso não comprova existência,
titularidade ou identidade civil. O Google verifica a conta/e-mail, não o CPF.

## Agenda

| Método / rota                                                  | Uso                                                                           |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| GET `/api/catalog`                                             | Catálogo público sem comissão, estoque ou dados de clientes                   |
| GET `/api/availability?date=YYYY-MM-DD&barberId=1&serviceId=1` | Cliente com cadastro completo; horários sem dados pessoais de outros clientes |
| POST `/api/appointments`                                       | date, time, barberId, serviceId, payment; preço e identidade vêm do servidor  |
| GET `/api/customer/appointments`                               | Agendamentos do próprio cliente                                               |
| DELETE `/api/customer/appointments/:id`                        | Apenas agendamento futuro ainda não iniciado, do próprio cliente              |
| GET `/api/admin/appointments?date=YYYY-MM-DD`                  | Agenda diária, escopo pela sessão                                             |
| GET `/api/admin/history`                                       | Histórico completo paginado                                                   |
| PATCH `/api/admin/appointments/:id/status`                     | status: in_progress, completed ou cancelled                                   |
| GET/PUT `/api/admin/appointments/:id/products`                 | Consultar/substituir produtos vinculados; PUT só em andamento                 |
| GET `/api/now` e POST `/api/now`                               | Opções e pedido presencial                                                    |
| GET `/api/admin/walkins`                                       | Pedidos presenciais pendentes                                                 |
| POST `/api/admin/walkins/:id`                                  | decision: accept/reject; aceitação pelo profissional selecionado              |

Histórico aceita `from`, `to`, `barberId`, `status`, `limit` (1–100, padrão 50),
`offset`. Retorna `{ total, items, limit, offset }`. Sem datas, percorre todo o
histórico. BARBER nunca pode consultar outro profissional, mesmo manipulando a URL.

Estados: `confirmed` → `in_progress` → `completed`. Administradores autorizados
podem cancelar agendados ou em andamento. Concluídos são imutáveis nesta versão;
correções financeiras futuras devem ser lançamentos compensatórios, não exclusões.
Só um atendimento pode ficar em andamento por profissional. Iniciar atendimento
futuro é proibido. O início real não modifica os horários originalmente reservados.

Para concluir, envie também `payment`: `Dinheiro`, `Pix`, `Cartão de Débito` ou
`Cartão de Crédito`. Cartões exigem `cardBrand` (ex.: `Visa`, `Elo`, `Mastercard`).
Nunca envie número, validade ou código de segurança do cartão.

Produtos do atendimento: `{ "items": [{ "productId": 1, "quantity": 2 }] }`.
A lista substitui a anterior; `items: []` remove todos antes da conclusão.
Estoque e recebimento são atualizados juntos na conclusão, não na inclusão.

## Expediente e restrições

| Método / rota                           | Uso                                                                                  |
| --------------------------------------- | ------------------------------------------------------------------------------------ |
| GET `/api/admin/barbers/:id/hours`      | weekly e exceptions                                                                  |
| PUT `/api/admin/barbers/:id/hours`      | Semana pessoal: hours com sete dias weekday 0–6, opens/closes HH:MM, closed boolean  |
| PUT `/api/admin/barbers/:id/hours`      | Exceção: date, opens, closes, closed                                                 |
| DELETE `/api/admin/barbers/:id/hours`   | Corpo com date: remove exceção e volta à semana                                      |
| GET `/api/admin/blocks?date=YYYY-MM-DD` | Bloqueios diários, com source_role                                                   |
| POST `/api/admin/blocks`                | barberId, date, start, end, reason; fullDay:true substitui start/end por 00:00–24:00 |
| PATCH `/api/admin/blocks/:id`           | releaseFrom HH:MM: reduz o fim de um bloqueio                                        |
| DELETE `/api/admin/blocks/:id`          | Remove bloqueio, respeitando origem ROOT                                             |

Prioridade: exceção da data → semana pessoal → padrão ROOT. Qualquer bloqueio
continua valendo independentemente do expediente. Bloqueios ROOT só podem ser
removidos/reduzidos pelo ROOT; os legados são tratados como ROOT por segurança.
Para liberar desde o início do bloqueio, remova-o. Liberação parcial não remove
outros bloqueios sobrepostos. ROOT pode bloquear um dia já reservado: a resposta
`affectedAppointments` informa os atendimentos existentes que precisam de revisão;
eles não são cancelados silenciosamente. Bloqueio pessoal sobre reserva é rejeitado.

## Vendas, estoque e comissões

| Método / rota                           | Uso                                                                      |
| --------------------------------------- | ------------------------------------------------------------------------ |
| PUT `/api/admin/barbers/:id/commission` | ROOT: percent entre 0 e 100, até 2 decimais                              |
| POST `/api/admin/sales`                 | Venda avulsa: barberId, items, payment, cardBrand, requestId, standalone |
| PUT `/api/admin/products/:id/stock`     | ROOT: stock inteiro não negativo; null desativa controle                 |
| GET `/api/admin/reports`                | Totais, itens agrupados e detalhes paginados                             |

`requestId` deve ser um UUID gerado pelo cliente e reutilizado em tentativas da
mesma venda. A API não registra a mesma venda duas vezes. Se há atendimento em
andamento, vincule os produtos por sua rota ou envie `standalone:true` após a
escolha explícita do operador. Não reutilize a chave para outra venda.

Relatórios aceitam `from`, `to`, `barberId`, `kind` (`service`/`product` ou vazio),
`payment`, `cardBrand` e `offset` (páginas de 50). ROOT pode omitir barberId para
somar todos, incluindo profissionais posteriormente desativados. BARBER recebe
somente seus dados. `totals` e `breakdown` cobrem todo o filtro; `items` é paginado.
`projectedCommissionCents` estima serviços reservados ainda não concluídos usando
a porcentagem atual. A estimativa é zero para filtro de produto/pagamento/bandeira,
pois esses recebimentos ainda não foram confirmados. Não é um controle de repasse.

O servidor armazena nome, quantidade, preço, porcentagem, comissão, pagamento e
bandeira de cada item como retrato do recebimento. Alterações no catálogo ou na
porcentagem não mudam valores anteriores. Nenhum lançamento financeiro é criado
retroativamente para reservas legadas, pois não existe comprovação de pagamento.

Não há cobrança online. Para integrá-la futuramente, um provedor deve confirmar
pagamentos por webhooks autenticados e idempotentes antes de registrar recebimento.
Não marque pagamento confirmado a partir de um retorno de navegador.

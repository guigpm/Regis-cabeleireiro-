# Organização MVC e manutenção

## Fronteiras

- **View — `public/`**: HTML, CSS, imagens e JavaScript de interface. Consome JSON,
  apresenta erros e pede confirmações. Não autoriza operações nem decide preços.
- **Controller — `server/controllers/`**: adapta rotas HTTP, lê corpo/filtros,
  identifica a sessão e chama modelos. `routes.js` mantém o ponto de entrada.
- **Model — `server/models/`**: consultas e regras de expediente, lançamentos,
  estados de atendimento, comissão, transações e propriedade dos registros.
- **Serviços compartilhados — `server/`**: autenticação, OTP, clientes, OAuth,
  disponibilidade, validação e SQLite. Os módulos existentes são reutilizados
  pelos controllers e modelos; não são copiados para o frontend.
- **Infraestrutura — `app.js`, `security.js`, `sessions.js`**: HTTP, arquivos
  estáticos permitidos, CSRF, CSP, cookies, expiração e limites.

JavaScript no Node é backend e não é baixado pelo navegador. TypeScript adicionaria
checagem estática durante o desenvolvimento, mas não esconderia JavaScript do
frontend nem substituiria validação em tempo de execução. Mantivemos JavaScript
para evitar uma migração de linguagem sem ganho de segurança correspondente.

## Módulos novos

| Arquivo                              | Responsabilidade                                            |
| ------------------------------------ | ----------------------------------------------------------- |
| models/catalog.js                    | Catálogo público/administrativo sem vazar dados privados    |
| models/schedule.js                   | Semana individual, exceções e bloqueios protegidos          |
| models/operations.js                 | Histórico, estados, produtos, vendas e comissões            |
| controllers/operations-controller.js | Rotas operacionais, sem renderização HTML                   |
| public/assets/js/admin-operations.js | Componentes e ações de agenda/vendas/relatórios             |
| public/assets/js/events.js           | Registro explícito de eventos compatível com CSP            |
| public/sw.js                         | Exibição de notificações locais sem cache de dados privados |

## Alterações futuras

1. Acrescente migração versionada/transacional em `migrations.js`. Nunca apague ou
   recrie tabelas de produção para mudar um campo. Faça backup antes de aplicar.
2. Implemente a regra no modelo com validação de identidade, escopo e estado.
   Use parâmetros SQL; nomes dinâmicos de tabelas precisam de lista permitida.
3. Exponha a operação no controller. Toda mutação exige sessão, salvo login/cadastro
   que têm limites próprios; **todas** exigem CSRF, inclusive login e DELETE.
4. No frontend, chame `api()`. Escape conteúdo externo com `esc()` ao criar HTML.
   Não use `onclick`, scripts embutidos, `eval` ou `new Function`; registre a ação
   em `events.js` ou use `addEventListener`. Atributos `data-arg-*` só contêm dados.
5. Cubra sucesso e tentativas de violação de permissões, repetição e concorrência.
   Rode `npm test` e `npm run format:check`.

Dinheiro novo usa centavos inteiros. O catálogo legado ainda armazena preço decimal;
a conversão ocorre no servidor ao criar o lançamento. Comissões são arredondadas
uma vez por linha de venda. Não recalcule históricos usando preços atuais.
A transação de conclusão grava todos os itens e dá baixa de estoque, ou não grava
nenhum. Produtos vinculados não reservam estoque antes da conclusão: estoque
insuficiente impede concluir e exige correção das quantidades.

## Operação e limites atuais

Execute uma instância Node por banco. SQLite deve ficar em disco local/volume Docker,
não em SMB/NFS. Sessões e limites de tentativas são locais ao processo; múltiplas
réplicas exigem armazenamento compartilhado de sessões/rate limit e outro planejamento
de banco. Não confiamos em `X-Forwarded-For` enviado pelo cliente; atrás de proxy,
o limite por IP é compartilhado pelos clientes daquele proxy. Configure limites
adicionais por IP na borda antes de publicar em grande escala.

O registro `audit_events` guarda ações financeiras e identificadores de operadores,
sem senhas ou dados de cartão. Não representa uma trilha inviolável contra alguém
com acesso ao arquivo SQLite. Backups contêm CPF, telefone e segredos OTP; use disco
e backup criptografados, com acesso restrito. Criptografia do banco em repouso não
está implementada nesta aplicação. Não publique o SQLite, `.env` ou backups.

Os avisos são locais, após consentimento: o painel consulta próximos atendimentos
e o service worker apresenta a notificação. Não expõem nome/telefone na tela bloqueada.
A página precisa continuar aberta; suspensão do navegador pode atrasar avisos. HTTPS
é necessário fora de localhost. Push com página fechada exige subscriptions, VAPID,
agendamento no servidor e tratamento de entrega; não está incluído nesta versão.

A interface não processa cartão: guarda apenas modalidade e bandeira informadas
pelo operador. Não há estorno, fechamento de caixa, entradas de estoque por compra,
repasse de comissão ou gateway de pagamento nesta etapa.

Referências de segurança usadas:

- [OWASP: armazenamento de senhas](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [OWASP: prevenção CSRF](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
- [MDN: notificações via service worker](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerRegistration/showNotification)

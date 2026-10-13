# R&R Barbearia

Aplicação Node.js com SQLite em arquivo, interface de clientes e painel administrativo
separado. HTML, CSS e JavaScript permanecem organizados por responsabilidade, sem etapa
de compilação ou dependências de terceiros no servidor.

## Executar com Docker

O projeto inclui `Dockerfile`, `compose.yaml` e `.dockerignore`. Não é necessário
instalar Node no host para essa opção. O Docker armazena o SQLite no volume
persistente `rr-barbearia-data`, montado em `/data` dentro do contêiner. O código
pode ficar no NAS; o armazenamento do próprio Docker precisa estar em disco local
(neste computador, `/var/lib/docker` está em ext4).

Neste computador está instalado **`docker-compose`** (com hífen). Na raiz do projeto:

```sh
docker-compose -p rr-barbearia -f compose.yaml up -d --build
docker-compose -p rr-barbearia -f compose.yaml ps
```

Acesse http://localhost:4000/ ou http://localhost:4000/painel. Em instalações com o
plugin Compose atual, substitua `docker-compose` por `docker compose` nos comandos.
Mantenha `-p rr-barbearia` para identificar os mesmos recursos em todos os comandos.

O Compose lê `ADMIN_PASSWORD`, `COOKIE_SECURE` e as variáveis `GOOGLE_*` do `.env`. Nenhuma senha ou banco é
incluído na imagem. Se a senha estiver vazia, será mantida a senha do banco; somente
um banco novo gera uma senha inicial nos logs:

```sh
docker-compose -p rr-barbearia -f compose.yaml logs --tail=50 app
```

Configurações opcionais no `.env`:

```dotenv
ADMIN_PASSWORD="sua-senha-com-12-ou-mais-caracteres"
DOCKER_PORT=4000
DOCKER_BIND_IP=127.0.0.1
DOCKER_DATA_VOLUME=rr-barbearia-data
```

`DB_PATH`, `HOST` e `PORT` usados na execução direta com `npm start` são substituídos
no contêiner por `/data/barbearia.sqlite`, `0.0.0.0` e `4000`. A porta publicada no
computador é `DOCKER_PORT`. Use outra porta se já houver um servidor Node em 3000.
Para acesso pela rede local, altere `DOCKER_BIND_IP` para `0.0.0.0`.

### Atualizar o código ou a senha do .env

Use o mesmo projeto `-p rr-barbearia` em todos os comandos. Recrie o contêiner para aplicar alterações no `.env`; apenas `restart` não atualiza
as variáveis. O fluxo abaixo também evita problemas de recriação nas versões antigas
do Compose:

```sh
docker-compose -p rr-barbearia -f compose.yaml down
docker-compose -p rr-barbearia -f compose.yaml up -d --build
```

O volume e seus dados são mantidos por `down`. **Não use `down -v`** se quiser
preservar o banco. Alterar `DOCKER_DATA_VOLUME` seleciona outro banco.

### Parar e iniciar

```sh
docker-compose -p rr-barbearia -f compose.yaml stop
docker-compose -p rr-barbearia -f compose.yaml start
```

O serviço reinicia automaticamente após falhas ou reinicialização do Docker, exceto
quando foi parado manualmente. Executa como usuário `node`, sem root, com verificação
de saúde HTTP, sistema de arquivos da imagem somente leitura e volume gravável para
o banco. Os logs têm rotação.

### Banco anterior e backup do volume

Nesta configuração, foi copiado um snapshot consistente do banco local existente
para o volume Docker. O arquivo original foi preservado. A partir daí são bancos
independentes: use o contêiner para que todos os clientes continuem na mesma agenda.
Em uma instalação nova, o volume vazio recebe os dados iniciais do projeto; arquivos
`.sqlite` na pasta do código não são importados automaticamente.

Para exportar o banco, pare o serviço antes da cópia e inicie-o ao terminar. Use um
nome de backup novo para não substituir um backup anterior:

```sh
mkdir -p backups
docker-compose -p rr-barbearia -f compose.yaml stop app
docker cp "$(docker-compose -p rr-barbearia -f compose.yaml ps -a -q app)":/data/. ./backups/
docker-compose -p rr-barbearia -f compose.yaml start app
```

Essa cópia inclui os arquivos auxiliares SQLite se existirem. `backups/` é ignorado
pelo Git e pelo build. Preserve o backup em local seguro: ele contém os cadastros,
contatos e o hash da senha. O arquivo original no host não é um backup das novas
reservas feitas no Docker.

### Testes na imagem

```sh
docker build --target test -t rr-barbearia:test .
```

Esse estágio executa `npm test` com bancos temporários, sem alterar o volume da
aplicação. A imagem final `runtime` contém somente o necessário para executar o site.

Referência: [persistência com volumes Docker](https://docs.docker.com/engine/storage/volumes/).

## Executar diretamente com Node

Requer **Node.js 24 ou superior** (usa `node:sqlite`).

```sh
npm start
```

- Clientes: http://localhost:3000/
- Administração: http://localhost:3000/painel

No primeiro início, o banco é criado e recebe os serviços, equipe e produtos iniciais.
Uma senha administrativa aleatória é exibida **uma única vez no terminal**. Guarde-a.
Ela é armazenada no banco como hash com salt, nunca em texto puro.

Para configurar a senha, preencha `ADMIN_PASSWORD` no `.env` (copie `.env.example`
se o arquivo ainda não existir) e reinicie o servidor:

```dotenv
ADMIN_PASSWORD="sua-senha-com-12-ou-mais-caracteres"
```

Use entre 12 e 200 caracteres. Quando preenchida, essa variável define a senha do
painel em cada inicialização, inclusive quando o banco já existe. Uma senha inválida
impede a inicialização. Se a variável estiver vazia ou ausente, a senha já cadastrada
é mantida; uma senha aleatória só é gerada se ainda não houver nenhuma.
O arquivo `.env` e os bancos de dados são ignorados pelo Git.

```sh
npm run dev             # Reinicia o servidor ao alterar arquivos do backend
npm test                # Testes automatizados com banco temporário
npm run admin:password  # Define ou redefine a senha do painel pelo terminal
```

Depois de redefinir a senha, reinicie o servidor para invalidar sessões existentes.
Se `ADMIN_PASSWORD` estiver preenchido, ele prevalece sobre a senha definida pelo
comando `admin:password` no próximo início; nesse caso, altere a senha no `.env`.
O comando de troca de senha mostra a digitação no terminal. O frontend não usa hot
reload: recarregue o navegador depois de alterar HTML, CSS ou JavaScript.

**É necessário usar o servidor Node.** Abrir o HTML diretamente ou usar apenas um
servidor estático não executa o banco nem as APIs.

## Banco local e acesso em outros aparelhos

Por padrão, o arquivo fica em `~/.local/share/rr-barbearia/barbearia.sqlite`,
fora da pasta do projeto. Se `XDG_DATA_HOME` estiver definido com um caminho absoluto,
será usado `XDG_DATA_HOME/rr-barbearia/barbearia.sqlite`. O servidor e o comando de
troca de senha usam a mesma regra. A pasta é criada automaticamente.

O SQLite deve ficar em **disco local do computador que executa o Node**, fora de
pastas NAS, SMB, NFS ou sincronização em nuvem. Neste ambiente, o projeto está no
NAS, mas a pasta pessoal está em disco local: não é necessário criar `.env` para
iniciar com o caminho padrão corrigido.

`DB_PATH` continua tendo prioridade. Caso tenha um `.env` antigo com
`DB_PATH=./data/barbearia.sqlite`, remova essa linha para usar o novo padrão ou
aponte para outro disco local. Exemplo:

```dotenv
DB_PATH=/caminho/local/rr-barbearia/barbearia.sqlite
```

Os navegadores acessam a API HTTP; não abrem o arquivo SQLite. Todos os dispositivos
que acessarem **o mesmo servidor** verão a mesma agenda. Para acesso na rede local,
configure `HOST=0.0.0.0` e acesse o IP do servidor na porta configurada. O padrão
`127.0.0.1` permite acesso somente no próprio computador.

Para uso público, mantenha uma única instância com disco persistente, HTTPS no proxy
reverso e `COOKIE_SECURE=true`. O cookie seguro não funciona em HTTP comum. O servidor
precisa permanecer ligado para aceitar reservas. O arquivo do banco não é servido
pela aplicação. Em proxy reverso, preserve o cabeçalho `Host` original.

## Cadastro de clientes e agenda

O catálogo é público. A consulta de horários, reserva e solicitação presencial
exigem sessão de cliente e cadastro completo (nome, e-mail, CPF e telefone com DDD).
A área **Minha conta** permite criar cadastro, entrar com e-mail ou CPF e senha,
consultar as próprias reservas e acompanhar a confirmação de pedidos presenciais.
As senhas exigem 12 a 200 caracteres e são armazenadas com scrypt e salt.

O CPF é normalizado, validado pelos dígitos verificadores e único por cliente.
**Isso não comprova identidade, titularidade nem existência na Receita Federal.**
O cadastro local também não verifica a titularidade do e-mail. Uma verificação de
identidade real exigiria um serviço externo apropriado, não incluído nesta versão.
O CPF completo não é enviado nas respostas da área do cliente: é exibido mascarado.

A agenda mostra horários livres, ocupados e passados do profissional selecionado.
Os ocupados ficam desabilitados e nenhum dado de outro cliente é exposto. Somente
profissionais habilitados para o serviço aparecem na escolha. A validação é repetida
no servidor ao reservar, considerando duração, expediente, bloqueios, reservas e
solicitações presenciais pendentes. Duas reservas sobrepostas não são aceitas.
Os dados do cliente vêm da sessão, não de um nome ou telefone enviado na reserva.

A reserva normal é confirmada no banco antes do envio opcional de comprovante pelo
WhatsApp. Não há cobrança online. A agenda segue `America/Sao_Paulo`, oferece início
a cada 30 minutos e aceita datas nos próximos 90 dias. O carrinho continua sendo
finalizado pelo WhatsApp, sem estoque ou persistência de pedidos nesta versão.

### Cadastro pelo Google

Crie um cliente OAuth do tipo **Aplicativo Web** no Google Cloud, configure a tela
de consentimento e autorize exatamente a URI de retorno. Depois preencha o `.env`:

```dotenv
GOOGLE_CLIENT_ID="seu-client-id.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="seu-client-secret"
GOOGLE_REDIRECT_URI="http://localhost:4000/api/customer/google/callback"
```

Use a porta e o domínio reais do ambiente. Em produção, use HTTPS. Na execução
direta em Node na porta 3000, ajuste a URI para essa porta. Reinicie o servidor ou
recrie o contêiner após alterar as variáveis. Sem as três configurações, o login
Google fica indisponível e o cadastro local continua funcionando.

A integração usa Authorization Code, PKCE e `state` associado ao navegador. O
servidor consulta o perfil pelo Google e exige e-mail verificado. O usuário completa
CPF e telefone antes de acessar horários. A conta Google confirma o controle da
conta, não o CPF. Contas locais existentes não são vinculadas automaticamente por
e-mail; nesse caso, o cliente deve entrar com a senha cadastrada.
A integração foi testada com respostas Google simuladas; a validação com uma conta
real depende das credenciais OAuth do ambiente.

Referência: [OpenID Connect do Google](https://developers.google.com/identity/openid-connect/openid-connect).

## Administradores, serviços e permissões

O painel continua em `/painel`, sem link na área do cliente. O login agora pede
**usuário e senha**. O usuário principal é **`root`**, mantendo a senha já existente
no banco ou aquela configurada em `ADMIN_PASSWORD`. A migração é automática e
transacional. Reservas antigas são preservadas no painel, mas não são atribuídas a
novos clientes automaticamente.

| Perfil | Permissões |
| --- | --- |
| ROOT | Gerencia equipe, serviços, produtos, expediente, todas as agendas e contas administrativas; edita e desativa outros administradores. |
| Administrador cabeleireiro | Consulta e cancela reservas da própria agenda, cria/remove seus bloqueios, seleciona os serviços que executa e confirma seus pedidos presenciais. Não cadastra produtos, serviços, equipe ou administradores. |

Contas administrativas são separadas do cadastro de profissionais. ROOT não possui
vínculo com profissional e não aparece na agenda. Para habilitar um cabeleireiro:

1. Cadastre o profissional na seção **Equipe**.
2. Em **Administradores**, crie uma conta de perfil **Administrador cabeleireiro** e selecione o profissional.
3. Em **Serviços por profissional**, marque serviços específicos ou **Executar todos os serviços**, que inclui automaticamente novos serviços cadastrados.

O cabeleireiro também pode alterar a própria seleção em **Meus serviços**. As
restrições são verificadas em todas as APIs, não apenas nos botões. Ao alterar uma
conta administrativa, suas sessões anteriores são invalidadas. O ROOT principal
não pode ser desativado ou rebaixado pela interface.

Remover cadastros não apaga agendamentos históricos. Alterar o expediente não cancela
reservas. Bloqueios respeitam tanto reservas quanto pedidos presenciais pendentes.
Cancelamentos devem ser comunicados ao cliente; não há mensagens automáticas.

### Verificação em duas etapas (OTP)

Cada administrador ativa seu próprio OTP em **Segurança / OTP**, confirmando a senha,
adicionando a chave em um autenticador TOTP e validando o código de seis dígitos.
A chave pode ser inserida manualmente ou aberta pelo link `otpauth` em um dispositivo
compatível. O cadastro não fica ativo até que o código seja verificado.

Após ativar, o login exige uma segunda etapa; apenas a senha não cria sessão. Códigos
já usados são recusados. São emitidos oito códigos de recuperação, mostrados uma
única vez e armazenados somente como hashes; cada um permite um único acesso. Para
desativar o OTP, são necessários a senha atual e um código válido do autenticador ou
de recuperação. Alterar a senha, inclusive via `.env`, **não desativa o OTP**.

Guarde os códigos de recuperação antes de sair. O banco contém CPFs, contatos e
segredos TOTP necessários para validar códigos: restrinja acesso ao volume e aos
backups. As sessões administrativas duram oito horas, as dos clientes até sete
dias; ambas são encerradas quando o servidor reinicia. Use HTTPS e
`COOKIE_SECURE=true` em produção. Há limites de tentativas no login e nas operações
OTP. O algoritmo segue [RFC 6238](https://www.rfc-editor.org/rfc/rfc6238).

## Marcar para agora (presencial)

Em **Minha conta → Marcar para agora**, o cliente vê combinações de serviços e
profissionais que podem iniciar o atendimento no momento. O profissional precisa
ter uma conta administrativa de cabeleireiro ativa para receber pedidos.

A solicitação bloqueia temporariamente o intervalo por até cinco minutos. O cliente
acompanha o estado na própria conta, e o profissional recebe o pedido na seção
**Presenciais**, atualizada a cada 15 segundos. Somente o profissional selecionado
pode confirmar; o ROOT pode consultar ou recusar, mas não substituir essa
confirmação presencial. Ao aceitar, o servidor verifica novamente a disponibilidade
e cria o agendamento com início naquele momento. Pedidos recusados ou expirados
liberam o intervalo. Cada cliente pode ter apenas um pedido pendente.

O sistema não usa localização para provar presença física: a confirmação do
profissional é a verificação presencial. Para aguardar a resposta, mantenha o painel
ou a conta abertos; não há notificações push externas nesta versão.

## Organização

```text
public/
  index.html              Página do cliente
  admin.html              Página do painel (servida em /painel)
  assets/
    css/styles.css        Tema, componentes e responsividade
    images/logo.jpg       Logo compartilhada
    js/
      config.js           Caminho da logo e configuração recebida da API
      utils.js            Requisições HTTP, formatação e escape de textos
      state.js            Estado temporário da interface do cliente
      ui.js               Navegação e notificações
      booking.js          Consulta de horários e confirmação da reserva
      store.js            Catálogo, busca e filtros
      cart.js             Carrinho e finalização via WhatsApp
      admin.js            Agenda, cadastros e expediente
      admin-security.js   OTP, permissões, contas e pedidos presenciais
      customer.js         Cadastro, login, perfil e reservas do cliente
      app.js              Inicialização da área do cliente
server/
  index.js                Inicialização e encerramento do servidor
  config.js               Caminho local do banco, compartilhado pelos comandos
  app.js                  Rotas HTTP, arquivos públicos e limites de requisição
  database.js             Criação das tabelas e carga inicial
  seed.json               Dados usados apenas na criação do banco
  booking.js              Disponibilidade e gravação transacional
  admin.js                Cadastros, expediente e bloqueios
  auth.js                 Login administrativo, segunda etapa e configuração OTP
  customers.js            Cadastro e sessão de clientes
  identity.js             Validação de CPF, e-mail e telefone
  google.js               Fluxo OAuth Google com PKCE e state
  otp.js                  TOTP e códigos de recuperação
  sessions.js             Cookies e sessões com expiração
  permissions.js          Perfis ROOT/cabeleireiro e serviços por profissional
  migrations.js           Migrações versionadas do banco
  routes.js               APIs de clientes, administradores e agenda
  walkins.js              Solicitações presenciais e confirmação
  validation.js           Validação dos dados recebidos
  password.js             Troca de senha pelo terminal
 test/app.test.js          Testes de integração com banco temporário
```

O SQLite armazena `services`, `barbers`, `products`, `hours`, `appointments`, `blocks`
, `settings`, `customers`, `administrators`, `barber_services`, `walkins` e
`schema_migrations`. Para ajustes cotidianos, use o painel; editar `seed.json` não sobrescreve
um banco existente. O número do WhatsApp fica na configuração `whatsapp` da tabela
`settings`, inicialmente copiado de `seed.json`.

## Backup e dados anteriores

Para um backup simples, pare o servidor, copie a pasta do banco para um local seguro
e depois reinicie. Preserve também arquivos `-wal` e `-shm`, caso existam. Para
restaurar, pare o servidor e restaure a pasta completa no caminho de `DB_PATH`.
O backup contém contatos de clientes, CPFs, hashes de senha e segredos OTP.

O antigo arquivo `data/barbearia.sqlite` dentro do projeto não é apagado nem
transferido automaticamente para o novo caminho. Se ele já tiver dados, preserve-o
junto com os arquivos auxiliares e faça a migração com o servidor parado antes de
começar a usar outro banco.

Os cadastros antigos do `localStorage` não são importados automaticamente. Eles não
foram apagados do navegador; o novo banco começa com os dados iniciais do projeto.
Cadastros personalizados e solicitações antigas precisam ser revisados antes de
serem transferidos para a agenda compartilhada.

## Validação

`npm test` cobre autenticação, acesso a arquivos privados, validação de entradas,
expediente, horários passados, duração do serviço, concorrência de reservas,
cancelamentos, bloqueios, cadastros, logout e persistência após reabrir o banco.
Os testes usam arquivos temporários e não alteram o banco da aplicação.

A interface também foi verificada em navegador: reserva do cliente, visualização no
painel, login e edição de serviços. Fontes, ícones, mapa e fotos externas ainda
necessitam de internet.

Referências técnicas: [SQLite em aplicações web](https://www.sqlite.org/whentouse.html)
e [SQLite nativo do Node.js](https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html).

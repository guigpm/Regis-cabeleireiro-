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

Acesse http://localhost:3000/ ou http://localhost:3000/painel. Em instalações com o
plugin Compose atual, substitua `docker-compose` por `docker compose` nos comandos.
Mantenha `-p rr-barbearia` para identificar os mesmos recursos em todos os comandos.

O Compose lê `ADMIN_PASSWORD` e `COOKIE_SECURE` do `.env`. Nenhuma senha ou banco é
incluído na imagem. Se a senha estiver vazia, será mantida a senha do banco; somente
um banco novo gera uma senha inicial nos logs:

```sh
docker-compose -p rr-barbearia -f compose.yaml logs --tail=50 app
```

Configurações opcionais no `.env`:

```dotenv
ADMIN_PASSWORD="sua-senha-com-12-ou-mais-caracteres"
DOCKER_PORT=3000
DOCKER_BIND_IP=127.0.0.1
DOCKER_DATA_VOLUME=rr-barbearia-data
```

`DB_PATH`, `HOST` e `PORT` usados na execução direta com `npm start` são substituídos
no contêiner por `/data/barbearia.sqlite`, `0.0.0.0` e `3000`. A porta publicada no
computador é `DOCKER_PORT`. Use outra porta se já houver um servidor Node em 3000.
Para acesso pela rede local, altere `DOCKER_BIND_IP` para `0.0.0.0`.

### Atualizar o código ou a senha do .env

Recrie o contêiner para aplicar alterações no `.env`; apenas `restart` não atualiza
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

## Fluxo do cliente

1. Serviços, preços, durações, profissionais, produtos e expediente vêm do banco.
2. O cliente escolhe serviço, profissional e data.
3. A API retorna os horários livres, considerando expediente, duração, reservas e bloqueios.
4. O cliente informa nome, telefone com DDD e pagamento e confirma.
5. O servidor confere novamente o intervalo e grava a reserva em uma transação.
6. A tela apresenta o código da reserva e um link opcional para enviar o comprovante pelo WhatsApp.

A reserva já está confirmada no banco antes do WhatsApp. Não há cobrança online.
Os horários seguem `America/Sao_Paulo`, são oferecidos a cada 30 minutos a partir da
abertura e precisam terminar dentro do expediente. O limite de antecedência é de 90
dias. Intervalos sobrepostos são impedidos por profissional; profissionais distintos
podem atender ao mesmo tempo. Se alguém reservar enquanto outra pessoa preenche o
formulário, a segunda pessoa recebe uma mensagem para escolher outro horário.

O carrinho e os pedidos de produtos continuam sendo finalizados pelo WhatsApp;
esta versão não inclui estoque, pagamento ou persistência dos pedidos da loja.

## Painel

Não existe link para o painel na área do cliente. A URL `/painel` exige login para
acessar dados e operações. O endereço separado não substitui a senha: todas as APIs
administrativas conferem a sessão. As sessões expiram em oito horas e são encerradas
quando o servidor reinicia; os dados da agenda permanecem no banco.

No painel você pode:

- Consultar reservas por data, com cliente, telefone, serviço, preço e pagamento.
- Cancelar uma reserva e liberar o intervalo. O cancelamento fica registrado.
- Bloquear intervalos de um profissional para almoço, folga ou compromissos.
- Criar, editar e remover serviços, profissionais e produtos, incluindo fotos.
- Alterar abertura, fechamento e dias sem atendimento.

Remover um cadastro não apaga agendamentos históricos. Reservas preservam os nomes,
preços e duração vigentes no momento da confirmação. Alterações no expediente não
cancelam automaticamente reservas existentes. O painel impede criar bloqueios sobre
reservas confirmadas: cancele a reserva primeiro e avise o cliente. A aplicação não
envia mensagens automáticas de cancelamento.

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
      admin.js            Login, agenda, cadastros e expediente
      app.js              Inicialização da área do cliente
server/
  index.js                Inicialização e encerramento do servidor
  config.js               Caminho local do banco, compartilhado pelos comandos
  app.js                  Rotas HTTP, arquivos públicos e limites de requisição
  database.js             Criação das tabelas e carga inicial
  seed.json               Dados usados apenas na criação do banco
  booking.js              Disponibilidade e gravação transacional
  admin.js                Cadastros, expediente e bloqueios
  auth.js                 Senha e sessões administrativas
  validation.js           Validação dos dados recebidos
  password.js             Troca de senha pelo terminal
 test/app.test.js          Testes de integração com banco temporário
```

O SQLite armazena `services`, `barbers`, `products`, `hours`, `appointments`, `blocks`
e `settings`. Para ajustes cotidianos, use o painel; editar `seed.json` não sobrescreve
um banco existente. O número do WhatsApp fica na configuração `whatsapp` da tabela
`settings`, inicialmente copiado de `seed.json`.

## Backup e dados anteriores

Para um backup simples, pare o servidor, copie a pasta do banco para um local seguro
e depois reinicie. Preserve também arquivos `-wal` e `-shm`, caso existam. Para
restaurar, pare o servidor e restaure a pasta completa no caminho de `DB_PATH`.
O backup contém contatos de clientes e o hash da senha do painel.

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

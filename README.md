# R&R Barbearia

Aplicação Node.js com SQLite em arquivo, interface de clientes e painel administrativo
separado. HTML, CSS e JavaScript permanecem organizados por responsabilidade, sem etapa
de compilação ou dependências de terceiros no servidor.

## Executar

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

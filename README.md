# R&R Barbearia

Site estático com agendamento por WhatsApp, catálogo, carrinho e painel de cadastro.
Não exige instalação de dependências nem compilação.

## Estrutura

```text
index.html                  Estrutura da página, navegação e formulários
assets/
  images/logo.jpg           Logo compartilhada pelo cabeçalho, fundo e imagens alternativas
  css/styles.css            Tema, componentes, classes auxiliares e responsividade
  js/
    config.js               WhatsApp, serviços, equipe e produtos iniciais
    utils.js                Armazenamento, formatação e integração com WhatsApp
    state.js                Estado compartilhado e carregamento dos dados salvos
    ui.js                   Navegação, modais e notificações
    booking.js              Etapas do agendamento e histórico
    store.js                Catálogo, busca e categorias
    cart.js                 Carrinho e finalização do pedido
    admin.js                Cadastro e exclusão de produtos e profissionais
    app.js                  Inicialização e atalhos de teclado
```

## Executar

Abra `index.html` no navegador ou, para desenvolvimento, sirva a pasta do projeto:

```sh
python3 -m http.server 8000
```

Acesse `http://localhost:8000`. Para publicar, envie `index.html` e toda a pasta
`assets`, mantendo os caminhos relativos.

## Manutenção

- **Telefone, serviços, preços e dados iniciais:** edite `assets/js/config.js`.
- **Cores, tamanhos e layout:** edite `assets/css/styles.css`; as variáveis do tema ficam no início.
- **Textos e estrutura da página:** edite `index.html`. As telas dinâmicas são geradas nos arquivos JavaScript de cada funcionalidade.
- **Logo:** substitua `assets/images/logo.jpg`. Caso altere o nome ou formato, atualize as referências no HTML, CSS e em `config.js`.
- **Fotos:** as fotos de profissionais, produtos e a foto principal continuam usando URLs externas. Para usar arquivos locais, coloque-os em `assets/images/`; no HTML e no JavaScript use `assets/images/nome.jpg`, e no CSS use `../images/nome.jpg`.

Os scripts são carregados com `defer`, na ordem declarada no final do HTML.
Mantenha essa ordem: configurações e utilitários precedem o estado; a inicialização
vem por último. São scripts clássicos, com funções compartilhadas também usadas
pelos eventos do HTML e das telas dinâmicas.

## Dados do navegador

Produtos, equipe e agendamentos usam `localStorage`, nas chaves `rr_products_v2`,
`rr_barbers_v2` e `rr_appointments_v2`. Elas foram preservadas nesta organização.
O carrinho permanece apenas na memória da página.

Alterar os dados iniciais em `config.js` não substitui os cadastros já salvos;
esses cadastros podem ser gerenciados pelo painel. Os dados pertencem ao navegador
e à origem do site: mudar domínio, porta ou alternar entre arquivo local e servidor
não transfere os registros automaticamente.

Fontes, ícones, mapa e fotos externas dependem de internet. A agenda não é
compartilhada entre aparelhos: a disponibilidade é confirmada pela barbearia no WhatsApp.

## Conferência manual

Após alterações, confira o agendamento até a escolha do pagamento, os filtros da
loja, a inclusão e remoção no carrinho, os cadastros do painel e o fechamento dos
modais com Escape. Verifique também a página em largura de celular.

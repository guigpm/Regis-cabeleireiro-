"use strict";

// Exibição, busca e filtros do catálogo de produtos.
function renderProducts() {
  let q = ($('storeSearch')?.value || '').toLocaleLowerCase('pt-BR');
  let list = products.filter(p => (category === 'Todos' || p.category === category) && p.name.toLocaleLowerCase('pt-BR').includes(q));
  $('productsGrid').innerHTML = list.map(p => `<article class="product"><img src="${esc(p.image || LOGO)}" alt="${esc(p.name)}" loading="lazy" onerror="this.onerror=null;this.src='${LOGO}'"><div class="product-info"><div class="product-name">${esc(p.name)}</div><div class="product-category">${esc(p.category)}</div><div class="price">${money(p.price)}</div><button class="btn btn-gold" onclick="addToCart(${Number(p.id)})"><i class="fa-solid fa-plus"></i> Adicionar</button></div></article>`).join('') || '<div class="span-full empty">Nenhum produto encontrado.</div>';
}
function filterCategory(c, el) {
  category = c;
  document.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
  el.classList.add('active');
  renderProducts();
}

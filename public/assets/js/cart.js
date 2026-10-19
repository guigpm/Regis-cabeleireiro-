'use strict';

// Itens do carrinho, totais e pedido pelo WhatsApp.
function addToCart(id) {
  let p = products.find((x) => x.id === id);
  if (p) {
    cart.push({
      ...p
    });
    $('cartBadge').textContent = cart.length;
    toast('Produto adicionado ao carrinho.');
  }
}
function openCart() {
  $('cartModal').classList.add('active');
  renderCart();
}
function renderCart() {
  let total = 0;
  $('cartItems').innerHTML =
    cart
      .map((p, i) => {
        total += Number(p.price);
        return `<div class="cart-row"><div><strong>${esc(p.name)}</strong><small>${money(p.price)}</small></div><button class="btn btn-danger" data-event-click="removeCartAction" data-arg-0="${esc(i)}"><i class="fa-solid fa-trash"></i></button></div>`;
      })
      .join('') || '<div class="empty">Seu carrinho está vazio.</div>';
  $('cartTotal').textContent = money(total);
  $('cartBadge').textContent = cart.length;
}
function removeCart(i) {
  cart.splice(i, 1);
  renderCart();
}
function checkoutCart() {
  if (!cart.length) {
    toast('Seu carrinho está vazio.');
    return;
  }
  let total = 0,
    lines = cart
      .map((p) => {
        total += Number(p.price);
        return `• ${p.name} — ${money(p.price)}`;
      })
      .join('\n');
  whatsapp(
    `Olá, R&R Barbearia! Gostaria de pedir:\n\n${lines}\n\nTotal: ${money(total)}\n\nPor favor, confirmem a disponibilidade.`
  );
}

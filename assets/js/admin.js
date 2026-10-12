"use strict";

// Cadastro e remoção de produtos e profissionais.

function openProductAdmin() {
  renderAdminProducts();
  $('productAdminModal').classList.add('active');
}

function renderAdminProducts() {
  $('adminProductList').innerHTML = '<h3 class="text-gold small">Produtos cadastrados</h3>' + products.map(p => `<div class="cart-row"><div><strong>${esc(p.name)}</strong><small>${money(p.price)} · ${esc(p.category)}</small></div><button class="btn btn-danger" onclick="deleteProduct(${Number(p.id)})"><i class="fa-solid fa-trash"></i></button></div>`).join('');
}

function deleteProduct(id) {
  products = products.filter(p => p.id !== id);
  save('rr_products_v2', products);
  renderProducts();
  renderAdminProducts();
  toast('Produto removido.');
}

function saveProduct(e) {
  e.preventDefault();
  let name = $('prodName').value.trim(),
    price = Number($('prodPrice').value),
    cat = $('prodCategory').value,
    url = $('prodImage').value.trim(),
    file = $('prodFile').files[0];
  if (!name || !Number.isFinite(price) || price <= 0) {
    toast('Confira nome e preço.');
    return;
  }
  let done = image => {
    products.push({
      id: Date.now(),
      name,
      price,
      category: cat,
      image: image || url || LOGO
    });
    if (save('rr_products_v2', products)) {
      renderProducts();
      renderAdminProducts();
      $('productForm').reset();
      toast('Produto salvo.');
    }
  };
  if (file) {
    if (file.size > 900000) {
      toast('Escolha uma foto menor que 900 KB.');
      return;
    }
    let r = new FileReader();
    r.onload = e => done(e.target.result);
    r.onerror = () => toast('Não foi possível ler a foto.');
    r.readAsDataURL(file);
  } else done('');
}

function openTeamAdmin() {
  renderAdminTeam();
  $('teamAdminModal').classList.add('active');
}

function renderAdminTeam() {
  $('adminTeamList').innerHTML = '<h3 class="text-gold small">Equipe cadastrada</h3>' + barbers.map(b => `<div class="cart-row"><div><img class="admin-barber-photo" src="${esc(b.photo || LOGO)}" alt="" onerror="this.onerror=null;this.src='${LOGO}'"><strong>${esc(b.name)}</strong><small>${esc(b.spec)}</small></div><button class="btn btn-danger" onclick="deleteBarber(${Number(b.id)})"><i class="fa-solid fa-trash"></i></button></div>`).join('') || '<div class="empty">Nenhum profissional cadastrado.</div>';
}

function saveBarber(e) {
  e.preventDefault();
  let name = $('barberName').value.trim(),
    spec = $('barberSpec').value.trim(),
    url = $('barberPhotoUrl').value.trim(),
    file = $('barberPhotoFile').files[0];
  if (!name || !spec) return;
  const done = photo => {
    barbers.push({
      id: Date.now(),
      name,
      spec,
      photo: photo || url || LOGO
    });
    if (save('rr_barbers_v2', barbers)) {
      $('barberName').value = '';
      $('barberSpec').value = '';
      $('barberPhotoUrl').value = '';
      $('barberPhotoFile').value = '';
      renderAdminTeam();
      renderBooking();
      toast('Profissional adicionado.');
    }
  };
  if (file) {
    if (file.size > 900000) {
      toast('Escolha uma foto menor que 900 KB.');
      return;
    }
    let r = new FileReader();
    r.onload = ev => done(ev.target.result);
    r.onerror = () => toast('Não foi possível ler a foto.');
    r.readAsDataURL(file);
  } else done('');
}

function deleteBarber(id) {
  barbers = barbers.filter(b => b.id !== id);
  save('rr_barbers_v2', barbers);
  renderAdminTeam();
  renderBooking();
  toast('Profissional removido.');
}

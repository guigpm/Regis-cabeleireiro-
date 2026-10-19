'use strict';

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape')
    document.querySelectorAll('.modal.active').forEach((modal) => modal.classList.remove('active'));
});
async function loadCatalog() {
  try {
    const data = await api('/api/catalog');
    services = data.services;
    barbers = data.barbers;
    products = data.products;
    hours = data.hours;
    WHATSAPP = data.whatsapp;
    const days = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    $('businessHours').innerHTML = hours
      .map(
        (day) =>
          `<div class="row-between"><span class="muted">${days[day.weekday]}</span><strong>${day.closed ? 'Fechado' : `${clock(day.opens)} – ${clock(day.closes)}`}</strong></div>`
      )
      .join('');
    await loadCustomer();
    renderBooking();
    renderProducts();
    const params = new URLSearchParams(location.search);
    if (params.has('account') || params.has('authError')) {
      switchTab('conta');
      if (params.has('authError')) renderAccount(params.get('authError'));
      history.replaceState(null, '', '/#conta');
    }
  } catch (error) {
    $('bookingContent').innerHTML =
      `<p class="text-danger small">${esc(error.message)}</p><button class="btn btn-outline full" data-event-click="loadCatalogAction">Tentar novamente</button>`;
    $('productsGrid').innerHTML =
      '<p class="empty span-full">Catálogo indisponível. Tente recarregar a página.</p>';
  }
}
window.addEventListener('DOMContentLoaded', loadCatalog);

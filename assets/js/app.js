"use strict";

// Inicialização da página e atalhos de teclado.

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') document.querySelectorAll('.modal.active').forEach(m => m.classList.remove('active'));
});

window.addEventListener('load', () => {
  renderBooking();
  renderProducts();
  renderAppointments();
});

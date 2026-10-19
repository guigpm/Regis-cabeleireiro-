'use strict';

// Navegação, modais e mensagens de feedback.
function toast(s) {
  $('toast').textContent = s;
  $('toast').classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('toast').classList.remove('show'), 2600);
}
function switchTab(id) {
  document
    .querySelectorAll('.tab')
    .forEach((t) => t.classList.toggle('active', t.id === 'tab-' + id));
  document
    .querySelectorAll('.nav-item')
    .forEach((n) => n.classList.toggle('active', n.dataset.tab === id));
  window.scrollTo({
    top: 0,
    behavior: 'smooth'
  });
}
function goToBooking() {
  switchTab('inicio');
  setTimeout(
    () =>
      $('agendamento').scrollIntoView({
        behavior: 'smooth'
      }),
    80
  );
}
function closeModal(id) {
  $(id).classList.remove('active');
}

"use strict";

// Estado compartilhado da aplicação. Preserve as chaves para manter os dados salvos.

let barbers = load('rr_barbers_v2', defaultBarbers),
  products = load('rr_products_v2', defaultProducts),
  appointments = load('rr_appointments_v2', []),
  cart = [],
  category = 'Todos',
  step = 1,
  booking = {
    service: null,
    barber: null,
    date: '',
    time: '',
    payment: ''
  };

let toastTimer;

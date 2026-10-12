"use strict";

// Catálogo e disponibilidade vêm do servidor; o carrinho é temporário.
let services = [],
  barbers = [],
  products = [],
  hours = [];
let cart = [],
  category = 'Todos',
  step = 1,
  toastTimer;
let booking = emptyBooking();
let bookingBusy = false,
  slotsRequest = 0;
function emptyBooking() {
  return {
    service: null,
    barber: null,
    date: '',
    time: '',
    payment: '',
    customer: '',
    phone: ''
  };
}

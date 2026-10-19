'use strict';
// Explicit event registry: data attributes never execute JavaScript. No eval/Function.
// Keep handlers in this file when adding UI actions so CSP can forbid inline scripts.
const uiHandlers = {
  openCartAction: (event, element, args) => {
    return openCart();
  },
  goToBookingAction: (event, element, args) => {
    return goToBooking();
  },
  openStoreLink: (event, element, args) => {
    switchTab('loja');
    return false;
  },
  showLocation: (event, element, args) => {
    document.getElementById('localizacao').scrollIntoView({ behavior: 'smooth' });
    return false;
  },
  renderProductsAction: (event, element, args) => {
    return renderProducts();
  },
  filterAllProducts: (event, element, args) => {
    return filterCategory('Todos', element);
  },
  filterHairProducts: (event, element, args) => {
    return filterCategory('Cabelo', element);
  },
  filterBeardProducts: (event, element, args) => {
    return filterCategory('Barba', element);
  },
  filterFinishProducts: (event, element, args) => {
    return filterCategory('Acabamento', element);
  },
  openHome: (event, element, args) => {
    return switchTab('inicio');
  },
  openBooking: (event, element, args) => {
    switchTab('inicio');
    return goToBooking();
  },
  openStore: (event, element, args) => {
    return switchTab('loja');
  },
  openAccount: (event, element, args) => {
    return switchTab('conta');
  },
  closeCartBackdrop: (event, element, args) => {
    if (event.target === element) closeModal('cartModal');
  },
  closeModalAction: (event, element, args) => {
    return closeModal('cartModal');
  },
  checkoutCartAction: (event, element, args) => {
    return checkoutCart();
  },
  resetAdminLoginAction: (event, element, args) => {
    return resetAdminLogin();
  },
  enableRemindersAction: (event, element, args) => {
    return enableReminders();
  },
  previousHistoryPage: (event, element, args) => {
    historyOffset = Math.max(0, historyOffset - 50);
    return loadHistory();
  },
  nextHistoryPage: (event, element, args) => {
    historyOffset += 50;
    return loadHistory();
  },
  reportToday: (event, element, args) => {
    return reportPeriod('day');
  },
  reportThisWeek: (event, element, args) => {
    return reportPeriod('week');
  },
  reportThisMonth: (event, element, args) => {
    return reportPeriod('month');
  },
  previousReportPage: (event, element, args) => {
    reportOffset = Math.max(0, reportOffset - 50);
    return loadReport();
  },
  nextReportPage: (event, element, args) => {
    reportOffset += 50;
    return loadReport();
  },
  refreshWalkins: (event, element, args) => {
    return action(loadWalkins);
  },
  renderSkillsAction: (event, element, args) => {
    return renderSkills(element.value);
  },
  saveSkillsAction: (event, element, args) => {
    return saveSkills(event, Number(args[0]));
  },
  toggleServiceChoicesAction: (event, element, args) => {
    return toggleServiceChoices();
  },
  saveAdminAccountAction: (event, element, args) => {
    return saveAdminAccount(event);
  },
  accountRoleChangedAction: (event, element, args) => {
    return accountRoleChanged();
  },
  loadAccountsAction: (event, element, args) => {
    return loadAccounts().catch((e) => status(e.message));
  },
  editAdminAccountAction: (event, element, args) => {
    return editAdminAccount(Number(args[0]));
  },
  disableAdminAccountAction: (event, element, args) => {
    return disableAdminAccount(Number(args[0]), element);
  },
  disableOtpAction: (event, element, args) => {
    return disableOtp(event);
  },
  setupOtpAction: (event, element, args) => {
    return setupOtp(event);
  },
  enableOtpAction: (event, element, args) => {
    return enableOtp(event);
  },
  decideWalkinAction: (event, element, args) => {
    return decideWalkin(args[0], 'accept', element);
  },
  decideWalkinAction39: (event, element, args) => {
    return decideWalkin(args[0], 'reject', element);
  },
  customerLoginAction: (event, element, args) => {
    return customerLogin(event);
  },
  customerRegisterAction: (event, element, args) => {
    return customerRegister(event);
  },
  completeCustomerAction: (event, element, args) => {
    return completeCustomer(event);
  },
  customerLogoutAction: (event, element, args) => {
    return customerLogout();
  },
  openNowAction: (event, element, args) => {
    return openNow();
  },
  loadMyAppointmentsAction: (event, element, args) => {
    return loadMyAppointments();
  },
  cancelCustomerAppointmentAction: (event, element, args) => {
    return cancelCustomerAppointment(args[0]);
  },
  askNowAction: (event, element, args) => {
    return askNow(Number(args[0]), Number(args[1]), element);
  },
  loadCatalogAction: (event, element, args) => {
    return loadCatalog();
  },
  addToCartAction: (event, element, args) => {
    return addToCart(Number(args[0]));
  },
  saveRecordAction: (event, element, args) => {
    return saveRecord(event, args[0]);
  },
  resetRecordAction: (event, element, args) => {
    return resetRecord(args[0]);
  },
  editRecordAction: (event, element, args) => {
    return editRecord(args[0], Number(args[1]));
  },
  removeRecordAction: (event, element, args) => {
    return removeRecord(args[0], Number(args[1]), element);
  },
  removeBlockAction: (event, element, args) => {
    return removeBlock(Number(args[0]), element);
  },
  releaseBlockAction: (event, element, args) => {
    return releaseBlock(Number(args[0]));
  },
  removeCartAction: (event, element, args) => {
    return removeCart(Number(args[0]));
  },
  changeAppointmentAction: (event, element, args) => {
    return changeAppointment(args[0], 'in_progress');
  },
  openCompletionAction: (event, element, args) => {
    return openCompletion(args[0]);
  },
  openAttachedProductsAction: (event, element, args) => {
    return openAttachedProducts(args[0]);
  },
  cancelAppointmentAction: (event, element, args) => {
    return cancelAppointment(args[0], element);
  },
  closeOperationAction: (event, element, args) => {
    return closeOperation();
  },
  removeExceptionAction: (event, element, args) => {
    return removeException(args[0]);
  },
  chooseServiceAction: (event, element, args) => {
    return chooseService(Number(args[0]));
  },
  chooseBarberAction: (event, element, args) => {
    return chooseBarber(Number(args[0]));
  },
  bookingBackAction: (event, element, args) => {
    return bookingBack(1);
  },
  renderTimesAction: (event, element, args) => {
    booking.date = element.value;
    booking.time = '';
    return renderTimes();
  },
  bookingBackAction67: (event, element, args) => {
    return bookingBack(2);
  },
  confirmBookingAction: (event, element, args) => {
    return confirmBooking(event);
  },
  selectPaymentAction: (event, element, args) => {
    return (booking.payment = element.value);
  },
  bookingBackAction70: (event, element, args) => {
    return bookingBack(3);
  },
  chooseTimeAction: (event, element, args) => {
    return chooseTime(args[0]);
  },
  renderTimesAction72: (event, element, args) => {
    return renderTimes();
  },
  newBookingAction: (event, element, args) => {
    return newBooking();
  }
};
for (const type of ['click', 'change', 'input', 'submit']) {
  document.addEventListener(type, (event) => {
    const element = event.target.closest('[data-event-' + type + ']');
    if (!element) return;
    const handler = uiHandlers[element.getAttribute('data-event-' + type)];
    if (!handler) return;
    if (type === 'submit') event.preventDefault();
    const args = Array.from({ length: 8 }, (_, i) => element.getAttribute('data-arg-' + i));
    try {
      const result = handler(event, element, args);
      if (result === false) event.preventDefault();
      Promise.resolve(result).catch(uiError);
    } catch (error) {
      uiError(error);
    }
  });
}
function uiError(error) {
  if (document.getElementById('adminStatus')) {
    if (error.status === 401) showLogin();
    document.getElementById('adminStatus').textContent = error.message;
  } else alert(error.message);
}
document.addEventListener(
  'error',
  (event) => {
    const image = event.target;
    if (image.tagName === 'IMG' && image.hasAttribute('data-image-fallback')) {
      image.removeAttribute('data-image-fallback');
      image.src = LOGO;
    }
  },
  true
);

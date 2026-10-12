"use strict";

// O servidor decide a disponibilidade e grava a reserva antes de exibir a confirmação.
function renderBooking() {
  for (let i = 1; i <= 4; i++) $('dot' + i).classList.toggle('active', i <= step);
  const content = $('bookingContent');
  if (step === 1) {
    content.innerHTML = `<h3 class="booking-heading small">Escolha seu serviço</h3>
      <div class="select-grid">${services.map(service => `
        <button type="button" class="select-card" onclick="chooseService(${service.id})">
          <span><span class="name">${esc(service.name)}</span><span class="detail service-duration">${service.duration} min</span></span>
          <span class="price">${money(service.price)}</span>
        </button>`).join('') || '<p class="empty">Nenhum serviço disponível no momento.</p>'}</div>`;
  } else if (step === 2) {
    content.innerHTML = `<h3 class="booking-heading small">Escolha o barbeiro</h3>
      <div class="select-grid">${barbers.map(barber => `
        <button type="button" class="select-card" onclick="chooseBarber(${barber.id})">
          <span class="barber-choice"><img class="barber-photo" src="${esc(barber.photo || LOGO)}" alt="Foto de ${esc(barber.name)}" onerror="this.onerror=null;this.src='${LOGO}'">
          <span class="barber-copy"><span class="name">${esc(barber.name)}</span><span class="detail service-duration">${esc(barber.spec)}</span></span></span>
          <i class="fa-solid fa-circle-check check"></i>
        </button>`).join('') || '<p class="empty">Nenhum profissional disponível no momento.</p>'}</div>
      <button class="btn btn-muted full" onclick="bookingBack(1)">Voltar</button>`;
  } else if (step === 3) {
    content.innerHTML = `<h3 class="booking-heading small">Data e horário</h3>
      <label class="small muted" for="bookingDate">Data desejada</label>
      <input class="form-control" type="date" id="bookingDate" min="${today()}" value="${esc(booking.date)}" onchange="booking.date=this.value;booking.time='';renderTimes()">
      <div id="timeButtons" class="time-grid" aria-live="polite"></div>
      <p class="notice">Horários disponíveis para ${esc(booking.barber.name)}, considerando os ${booking.service.duration} minutos do serviço. A reserva é concluída na próxima etapa.</p>
      <button class="btn btn-muted full" onclick="bookingBack(2)">Voltar</button>`;
    renderTimes();
  } else {
    content.innerHTML = `<form id="bookingForm" onsubmit="confirmBooking(event)">
      <h3 class="booking-heading small">Seus dados e pagamento</h3>
      <label class="small muted" for="customerName">Seu nome</label>
      <input id="customerName" class="form-control" required minlength="2" maxlength="90" autocomplete="name" value="${esc(booking.customer)}" oninput="booking.customer=this.value">
      <label class="small muted" for="customerPhone">Telefone com DDD</label>
      <input id="customerPhone" class="form-control" required type="tel" maxlength="25" autocomplete="tel" placeholder="(41) 99999-9999" value="${esc(booking.phone)}" oninput="booking.phone=this.value">
      <label class="small muted" for="bookingPayment">Pagamento no atendimento</label>
      <select id="bookingPayment" class="form-control" required onchange="booking.payment=this.value">
        <option value="">Selecione</option>${['Pix', 'Cartão de Crédito', 'Cartão de Débito', 'Dinheiro'].map(p => `<option ${booking.payment === p ? 'selected' : ''}>${p}</option>`).join('')}
      </select>
      <div class="summary">${[['Serviço', booking.service.name], ['Barbeiro', booking.barber.name], ['Data', formatDate(booking.date)], ['Horário', booking.time], ['Valor', money(booking.service.price)]].map(([label, value]) => `<div class="summary-line"><span class="muted">${label}</span><span>${esc(value)}</span></div>`).join('')}</div>
      <p class="notice">Ao confirmar, o horário será reservado. Nenhuma cobrança será feita agora.</p>
      <p id="bookingError" class="text-danger small" role="alert"></p>
      <button id="confirmBookingButton" class="btn btn-gold full" type="submit">Confirmar agendamento</button>
      <button id="bookingBackButton" class="btn btn-muted full" type="button" onclick="bookingBack(3)">Voltar</button>
    </form>`;
  }
}
function bookingBack(next) {
  if (bookingBusy) return;
  step = next;
  renderBooking();
}
function chooseService(id) {
  booking.service = services.find(service => service.id === id);
  booking.time = '';
  step = 2;
  renderBooking();
}
function chooseBarber(id) {
  booking.barber = barbers.find(barber => barber.id === id);
  booking.time = '';
  step = 3;
  renderBooking();
}
async function renderTimes() {
  const box = $('timeButtons'),
    request = ++slotsRequest;
  if (!box) return;
  if (!booking.date) {
    box.innerHTML = '<p class="small muted span-full">Escolha a data para consultar os horários.</p>';
    return;
  }
  box.innerHTML = '<p class="small muted span-full">Consultando horários…</p>';
  try {
    const query = new URLSearchParams({
      date: booking.date,
      barberId: booking.barber.id,
      serviceId: booking.service.id
    });
    const {
      slots
    } = await api('/api/availability?' + query);
    if (request !== slotsRequest || !box.isConnected) return;
    box.innerHTML = slots.map(time => `<button class="time-btn" onclick="chooseTime('${time}')">${time}</button>`).join('') || '<p class="notice span-full">Nenhum horário disponível nesta data. Escolha outro dia ou profissional.</p>';
  } catch (error) {
    if (request === slotsRequest && box.isConnected) box.innerHTML = `<p class="text-danger small span-full">${esc(error.message)}</p><button class="btn btn-outline span-full" onclick="renderTimes()">Tentar novamente</button>`;
  }
}
function chooseTime(time) {
  booking.time = time;
  step = 4;
  renderBooking();
}
async function confirmBooking(event) {
  event.preventDefault();
  if (bookingBusy) return;
  bookingBusy = true;
  $('confirmBookingButton').disabled = true;
  $('bookingBackButton').disabled = true;
  $('confirmBookingButton').textContent = 'Reservando…';
  $('bookingError').textContent = '';
  try {
    const result = await api('/api/appointments', {
      method: 'POST',
      body: {
        serviceId: booking.service.id,
        barberId: booking.barber.id,
        date: booking.date,
        time: booking.time,
        customer: booking.customer,
        phone: booking.phone,
        payment: booking.payment
      }
    });
    const message = `Olá, R&R Barbearia! Meu agendamento está registrado.\nCódigo: ${result.id}\nNome: ${result.customer}\nServiço: ${result.service}\nBarbeiro: ${result.barber}\nData: ${formatDate(result.date)} às ${result.time}\nPagamento: ${result.payment}\nValor: ${money(result.price)}`;
    $('bookingContent').innerHTML = `<div class="booking-success" role="status"><h3 class="text-gold">Agendamento confirmado!</h3>
      <p>${esc(result.customer)}, seu horário está reservado com ${esc(result.barber)}.</p>
      <p><strong>${esc(formatDate(result.date))} às ${esc(result.time)}</strong> · ${esc(result.service)}</p>
      <p class="small muted">Código: ${esc(result.id)}</p>
      <p class="notice">Para cancelar ou alterar, entre em contato com a barbearia.</p>
      <a class="btn btn-outline full" target="_blank" rel="noopener" href="https://wa.me/${WHATSAPP}?text=${encodeURIComponent(message)}">Enviar comprovante pelo WhatsApp</a>
      <button class="btn btn-gold full" onclick="newBooking()">Novo agendamento</button></div>`;
    booking = emptyBooking();
  } catch (error) {
    if (error.status === 409) {
      booking.time = '';
      step = 3;
      renderBooking();
      toast(error.message);
    } else {
      $('bookingError').textContent = error.message;
      $('confirmBookingButton').disabled = false;
      $('bookingBackButton').disabled = false;
      $('confirmBookingButton').textContent = 'Confirmar agendamento';
    }
  } finally {
    bookingBusy = false;
  }
}
function newBooking() {
  booking = emptyBooking();
  step = 1;
  renderBooking();
}

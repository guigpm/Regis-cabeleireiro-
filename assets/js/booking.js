"use strict";

// Etapas do agendamento, horários e histórico de solicitações.

function renderBooking() {
  for (let i = 1; i <= 4; i++) $('dot' + i).classList.toggle('active', i <= step);
  let c = $('bookingContent');
  if (step === 1) c.innerHTML = `<h3 class="booking-heading small">Escolha seu serviço</h3><div class="select-grid">${services.map(s => `<div class="select-card ${booking.service?.id === s.id ? 'selected' : ''}" onclick="chooseService(${s.id})"><div><div class="name">${esc(s.name)}</div><div class="detail">${s.duration} min</div></div><span class="price">${money(s.price)}</span></div>`).join('')}</div><p class="notice">Selecione um serviço para continuar.</p>`;else if (step === 2) c.innerHTML = `<h3 class="booking-heading small">Escolha o barbeiro</h3><div class="select-grid">${barbers.map(b => `<div class="select-card ${booking.barber?.id === b.id ? 'selected' : ''}" onclick="chooseBarber(${b.id})"><div class="barber-choice"><img class="barber-photo" src="${esc(b.photo || LOGO)}" alt="Foto de ${esc(b.name)}" onerror="this.onerror=null;this.src='${LOGO}'"><div class="barber-copy"><div class="name">${esc(b.name)}</div><div class="detail">${esc(b.spec)}</div></div></div><i class="fa-solid fa-circle-check check"></i></div>`).join('') || '<div class="empty">Cadastre um barbeiro no Painel.</div>'}</div><button class="btn btn-muted full" onclick="step=1;renderBooking()">Voltar</button>`;else if (step === 3) {
    let min = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    c.innerHTML = `<h3 class="text-gold small">Data e horário</h3><label class="small muted">Data desejada</label><input class="form-control" type="date" id="bookingDate" min="${min}" value="${esc(booking.date)}" onchange="booking.date=this.value;booking.time='';renderTimes()"><label class="small muted">Horário desejado</label><div id="timeButtons" class="time-grid"></div><p class="notice">O horário será confirmado pela barbearia via WhatsApp. Esta versão não consulta uma agenda compartilhada em tempo real.</p><button class="btn btn-muted full" onclick="step=2;renderBooking()">Voltar</button>`;
    renderTimes();
  } else c.innerHTML = `<h3 class="text-gold small">Forma de pagamento</h3><div class="select-grid">${['Pix', 'Cartão de Crédito', 'Cartão de Débito', 'Dinheiro'].map(p => `<div class="select-card ${booking.payment === p ? 'selected' : ''}" onclick="choosePayment('${p}')"><span class="name">${p}</span><i class="fa-solid fa-circle-check check"></i></div>`).join('')}</div><div class="summary"><strong class="text-gold">Resumo do agendamento</strong>${[['Serviço', booking.service?.name], ['Barbeiro', booking.barber?.name], ['Data', formatDate(booking.date)], ['Horário', booking.time], ['Valor', money(booking.service?.price)]].map(([a, b]) => `<div class="summary-line"><span class="muted">${a}</span><span>${esc(b)}</span></div>`).join('')}</div><button class="btn btn-gold full" onclick="confirmBooking()"><i class="fa-brands fa-whatsapp"></i> Confirmar via WhatsApp</button><button class="btn btn-muted full" onclick="step=3;renderBooking()">Voltar</button>`;
}

function chooseService(id) {
  booking.service = services.find(s => s.id === id);
  step = 2;
  renderBooking();
}

function chooseBarber(id) {
  booking.barber = barbers.find(b => b.id === id);
  if (booking.barber) {
    step = 3;
    renderBooking();
  }
}

function choosePayment(p) {
  booking.payment = p;
  renderBooking();
}

function renderTimes() {
  let box = $('timeButtons');
  if (!box) return;
  let d = booking.date,
    day = d ? new Date(d + 'T12:00:00').getDay() : -1;
  if (day === 0) {
    box.innerHTML = '<div class="span-full notice">A barbearia fecha aos domingos. Escolha outra data.</div>';
    return;
  }
  let times = [];
  for (let h = 9; h <= (day === 6 ? 17 : 19); h++) {
    times.push(String(h).padStart(2, '0') + ':00');
    if (h < (day === 6 ? 17 : 19)) times.push(String(h).padStart(2, '0') + ':30');
  }
  if (day === 6) times = times.filter(t => t <= '17:30');
  box.innerHTML = times.map(t => `<button class="time-btn ${booking.time === t ? 'selected' : ''}" onclick="chooseTime('${t}')">${t}</button>`).join('');
}

function chooseTime(t) {
  if (!booking.date) {
    toast('Escolha a data primeiro.');
    return;
  }
  if (new Date(booking.date + 'T12:00:00').getDay() === 0) {
    toast('A barbearia fecha aos domingos.');
    return;
  }
  booking.time = t;
  step = 4;
  renderBooking();
}

function confirmBooking() {
  if (!booking.service || !booking.barber || !booking.date || !booking.time || !booking.payment) {
    toast('Confira os dados do agendamento.');
    return;
  }
  let msg = `Olá, R&R Barbearia! Gostaria de solicitar um agendamento:\n\n✂️ Serviço: ${booking.service.name}\n👤 Barbeiro: ${booking.barber.name}\n📅 Data: ${formatDate(booking.date)}\n⏰ Horário: ${booking.time}\n💳 Pagamento: ${booking.payment}\n💰 Valor: ${money(booking.service.price)}\n\nPor favor, confirmem a disponibilidade.`;
  appointments.unshift({
    id: Date.now(),
    service: booking.service.name,
    barber: booking.barber.name,
    date: booking.date,
    time: booking.time,
    payment: booking.payment,
    price: booking.service.price
  });
  save('rr_appointments_v2', appointments);
  renderAppointments();
  whatsapp(msg);
  toast('Abrindo o WhatsApp para confirmar a solicitação.');
}

function renderAppointments() {
  $('appointmentsList').innerHTML = appointments.length ? appointments.map(a => `<div class="appointment"><strong>${esc(a.service)}</strong><div>${esc(formatDate(a.date))} às ${esc(a.time)} · ${money(a.price)}</div><div class="muted">Barbeiro: ${esc(a.barber)} · ${esc(a.payment)}</div></div>`).join('') : 'Nenhum agendamento registrado neste aparelho.';
}

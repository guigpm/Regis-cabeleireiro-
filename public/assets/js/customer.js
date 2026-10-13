"use strict";

let currentCustomer = null,
  googleEnabled = false;
async function loadCustomer() {
  const config = await api('/api/customer/config');
  googleEnabled = config.googleEnabled;
  try {
    currentCustomer = (await api('/api/customer/session')).customer;
  } catch (error) {
    if (error.status !== 401) throw error;
    currentCustomer = null;
  }
  renderAccount();
}
function renderAccount(message = '') {
  const target = $('accountContent');
  const input = (id, label, type = 'text', extra = '') => `<label class="small" for="${id}">${label}</label><input class="form-control" id="${id}" type="${type}" ${extra}>`;
  if (!currentCustomer) {
    target.innerHTML = `<p class="small muted">Cadastre-se para escolher horários e acompanhar seus agendamentos.</p>
      <p class="text-danger small" role="alert">${esc(message)}</p>
      <form onsubmit="customerLogin(event)"><h3 class="text-gold">Entrar</h3>
        ${input('customerIdentifier', 'E-mail ou CPF', 'text', 'required autocomplete="username"')}
        ${input('customerLoginPassword', 'Senha', 'password', 'required autocomplete="current-password" maxlength="200"')}
        <button class="btn btn-gold full" type="submit">Entrar na minha conta</button>
      </form>
      ${googleEnabled ? '<a class="btn btn-outline full" href="/api/customer/google/start">Continuar com Google</a>' : '<p class="small muted">Login Google ainda não habilitado pela barbearia.</p>'}
      <details class="account-register"><summary>Criar cadastro com CPF</summary><form onsubmit="customerRegister(event)">
        ${input('registerName', 'Nome completo', 'text', 'required minlength="2" maxlength="90" autocomplete="name"')}
        ${input('registerEmail', 'E-mail', 'email', 'required maxlength="254" autocomplete="email"')}
        ${input('registerCpf', 'CPF', 'text', 'required maxlength="14" inputmode="numeric"')}
        ${input('registerPhone', 'Telefone com DDD', 'tel', 'required maxlength="25" autocomplete="tel"')}
        ${input('registerPassword', 'Senha (mínimo 12 caracteres)', 'password', 'required minlength="12" maxlength="200" autocomplete="new-password"')}
        <p class="notice">Seu CPF deve ser o seu próprio. A validação confere os dígitos; não é uma consulta à Receita Federal.</p>
        <button class="btn btn-gold full" type="submit">Criar minha conta</button>
      </form></details>`;
  } else if (!currentCustomer.complete) {
    target.innerHTML = `<h3 class="text-gold">Complete seu cadastro</h3><p class="small">Conta Google: ${esc(currentCustomer.email)}</p>
      <form onsubmit="completeCustomer(event)">
        ${input('completeName', 'Nome completo', 'text', `required minlength="2" maxlength="90" value="${esc(currentCustomer.name)}"`)}
        ${input('completeCpf', 'CPF', 'text', 'required maxlength="14" inputmode="numeric"')}
        ${input('completePhone', 'Telefone com DDD', 'tel', 'required maxlength="25"')}
        <p class="notice">O Google confirmou sua conta. Informe CPF e telefone para liberar a agenda. A validação do CPF não comprova identidade.</p>
        <button class="btn btn-gold full" type="submit">Completar cadastro</button>
      </form><button class="btn btn-outline full" onclick="customerLogout()">Sair</button>`;
  } else {
    target.innerHTML = `<h3 class="text-gold">Olá, ${esc(currentCustomer.name)}</h3><p class="small muted">${esc(currentCustomer.email)} · CPF ${esc(currentCustomer.cpfMasked)}</p>
      <button class="btn btn-gold full" onclick="goToBooking()">Escolher um horário</button>
      <button class="btn btn-outline full" onclick="openNow()">Marcar para agora · presencial</button>
      <button class="btn btn-muted full" onclick="customerLogout()">Sair da conta</button>
      <div id="nowContent"></div><h3 class="text-gold">Meus agendamentos</h3><button class="btn btn-outline" onclick="loadMyAppointments()">Atualizar</button><div id="myAppointments"></div>`;
    loadMyAppointments().catch(error => toast(error.message));
  }
}
async function customerAction(event, callback) {
  event.preventDefault();
  const button = event.submitter;
  button.disabled = true;
  try {
    await callback();
    renderAccount();
    renderBooking();
    toast('Conta pronta para agendar.');
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = false;
  }
}
function customerLogin(event) {
  return customerAction(event, async () => {
    currentCustomer = (await api('/api/customer/login', {
      method: 'POST',
      body: {
        identifier: $('customerIdentifier').value,
        password: $('customerLoginPassword').value
      }
    })).customer;
  });
}
function customerRegister(event) {
  return customerAction(event, async () => {
    currentCustomer = (await api('/api/customer/register', {
      method: 'POST',
      body: {
        name: $('registerName').value,
        email: $('registerEmail').value,
        cpf: $('registerCpf').value,
        phone: $('registerPhone').value,
        password: $('registerPassword').value
      }
    })).customer;
  });
}
function completeCustomer(event) {
  return customerAction(event, async () => {
    currentCustomer = (await api('/api/customer/profile', {
      method: 'PUT',
      body: {
        name: $('completeName').value,
        cpf: $('completeCpf').value,
        phone: $('completePhone').value
      }
    })).customer;
  });
}
async function customerLogout() {
  try {
    await api('/api/customer/logout', {
      method: 'POST',
      body: {}
    });
    currentCustomer = null;
    booking = emptyBooking();
    step = 1;
    renderAccount();
    renderBooking();
  } catch (error) {
    toast(error.message);
  }
}
const requestLabels = {
  pending: 'Aguardando confirmação do profissional',
  confirmed: 'Confirmado pelo profissional',
  rejected: 'Não aceito pelo profissional',
  expired: 'Prazo encerrado — faça uma nova solicitação',
  cancelled: 'Cancelado'
};
async function loadMyAppointments() {
  if (!currentCustomer?.complete || !$('myAppointments')) return;
  const customerId = currentCustomer.id;
  const data = await api('/api/customer/appointments');
  if (!$('myAppointments') || currentCustomer?.id !== customerId) return;
  $('myAppointments').innerHTML = data.walkins.map(item => `<div class="appointment"><strong>Presencial · ${esc(item.service)}</strong><p>${esc(item.barber)} · ${requestLabels[item.status]}</p>${item.status === 'pending' ? '<p class="small muted">Confirmação em até 5 minutos. Aguarde no local.</p>' : ''}</div>`).join('') + data.appointments.map(item => `<div class="appointment"><strong>${esc(item.service)}</strong><p>${formatDate(item.date)} · ${clock(item.start)} – ${clock(item.end)} · ${esc(item.barber)}</p><p>${item.status === 'confirmed' ? 'Confirmado' : 'Cancelado'} · ${money(item.price)}</p></div>`).join('') || '<p class="empty">Você ainda não tem agendamentos.</p>';
}
async function openNow() {
  switchTab('conta');
  if (!currentCustomer?.complete) {
    renderAccount();
    toast('Entre e complete seu cadastro primeiro.');
    return;
  }
  $('nowContent').innerHTML = '<p class="small">Consultando profissionais disponíveis agora…</p>';
  try {
    const options = await api('/api/now');
    $('nowContent').innerHTML = `<h3 class="text-gold">Atendimento presencial agora</h3><p class="notice">Escolha somente se você estiver na barbearia. O profissional tem 5 minutos para confirmar. Seu atendimento só estará marcado após essa confirmação.</p>
      <label for="nowPayment" class="small">Pagamento no atendimento</label><select id="nowPayment" class="form-control">${['Pix', 'Cartão de Crédito', 'Cartão de Débito', 'Dinheiro'].map(p => `<option>${p}</option>`).join('')}</select>
      <div class="select-grid">${options.map(item => {
      const service = services.find(s => s.id === item.serviceId),
        barber = barbers.find(b => b.id === item.barberId);
      return service && barber ? `<button class="select-card" onclick="askNow(${item.serviceId},${item.barberId},this)"><span><strong>${esc(service.name)}</strong><span class="detail service-duration">${esc(barber.name)} · ${service.duration} min · ${money(service.price)}</span></span><span>Solicitar</span></button>` : '';
    }).join('') || '<p class="empty">Nenhum profissional disponível agora. Você pode escolher outro horário.</p>'}</div>`;
  } catch (error) {
    $('nowContent').innerHTML = `<p class="text-danger small">${esc(error.message)}</p>`;
  }
}
async function askNow(serviceId, barberId, button) {
  button.disabled = true;
  try {
    await api('/api/now', {
      method: 'POST',
      body: {
        serviceId,
        barberId,
        payment: $('nowPayment').value
      }
    });
    $('nowContent').innerHTML = '<p class="notice" role="status">Solicitação enviada. Aguarde a confirmação do profissional abaixo.</p>';
    await loadMyAppointments();
  } catch (error) {
    toast(error.message);
    button.disabled = false;
  }
}
setInterval(() => {
  if (!document.hidden && $('tab-conta')?.classList.contains('active') && currentCustomer?.complete) loadMyAppointments().catch(() => {});
}, 15000);

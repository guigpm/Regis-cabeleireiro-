"use strict";

let catalog = {
  services: [],
  barbers: [],
  products: [],
  hours: []
};
let agendaRequest = 0;
const labels = {
  services: 'Serviços',
  barbers: 'Equipe',
  products: 'Produtos'
};
const days = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
function status(message) {
  $('adminStatus').textContent = message;
}
function showLogin() {
  adminUser = null;
  resetAdminLogin();
  administratorAccounts = [];
  catalog = {
    services: [],
    barbers: [],
    products: [],
    hours: []
  };
  $('adminPassword').value = '';
  for (const id of ['accountsContent', 'skillsContent', 'blocksList', 'panel-services', 'panel-barbers', 'panel-products']) $(id).replaceChildren();
  $('securityContent').replaceChildren();
  $('walkinsContent').replaceChildren();
  $('loginSection').hidden = false;
  $('adminContent').hidden = true;
  $('logoutButton').hidden = true;
  agendaRequest++;
  $('agendaList').replaceChildren();
}
async function action(callback, button) {
  if (button) button.disabled = true;
  status('');
  try {
    await callback();
  } catch (error) {
    if (error.status === 401) showLogin();
    status(error.message);
  } finally {
    if (button) button.disabled = false;
  }
}
async function refreshCatalog() {
  catalog = await api('/api/admin/catalog');
  if (adminUser?.role === 'ROOT') for (const kind of Object.keys(labels)) renderCatalog(kind);
  $('blockBarber').innerHTML = catalog.barbers.filter(barber => adminUser?.role === 'ROOT' || barber.id === adminUser?.barberId).map(barber => `<option value="${barber.id}">${esc(barber.name)}</option>`).join('');
  $('hoursRows').innerHTML = catalog.hours.map(day => `<div class="hours-row">
    <label><input type="checkbox" id="closed-${day.weekday}" ${day.closed ? 'checked' : ''}> ${days[day.weekday]} fechado</label>
    <label>Abertura<input type="time" class="form-control" id="opens-${day.weekday}" value="${clock(day.opens)}" required></label>
    <label>Fechamento<input type="time" class="form-control" id="closes-${day.weekday}" value="${clock(day.closes)}" required></label>
  </div>`).join('');
}
async function enterPanel() {
  adminUser = (await api('/api/admin/session')).admin;
  await refreshCatalog();
  applyPermissions();
  renderSkills();
  renderSecurity();
  if (adminUser.role === 'ROOT') await loadAccounts();
  await loadWalkins();
  $('loginSection').hidden = true;
  $('adminContent').hidden = false;
  $('logoutButton').hidden = false;
  $('adminPassword').value = '';
  await loadAgenda();
}
function field(kind, name, label, type = 'text', extra = '') {
  return `<label for="${kind}-${name}" class="small">${label}</label><input class="form-control" id="${kind}-${name}" name="${name}" type="${type}" ${extra}>`;
}
function renderCatalog(kind) {
  let inputs = field(kind, 'name', 'Nome', 'text', 'required minlength="2" maxlength="100"');
  if (kind === 'services' || kind === 'products') inputs += field(kind, 'price', 'Preço (R$)', 'number', 'required min="0.01" max="100000" step="0.01"');
  if (kind === 'services') inputs += field(kind, 'duration', 'Duração (minutos)', 'number', 'required min="5" max="480" step="1"');
  if (kind === 'barbers') inputs += field(kind, 'spec', 'Especialidade', 'text', 'required maxlength="100"');
  if (kind === 'products') inputs += `<label class="small" for="products-category">Categoria</label><select class="form-control" id="products-category" name="category"><option>Cabelo</option><option>Barba</option><option>Acabamento</option></select>`;
  if (kind !== 'services') inputs += field(kind, 'imageUrl', 'Link da foto (opcional)', 'url', 'placeholder="https://..."') + field(kind, 'file', 'Ou uma foto deste aparelho (até 900 KB)', 'file', 'accept="image/png,image/jpeg,image/webp,image/gif"') + `<label class="small"><input type="checkbox" name="removeImage"> Remover foto atual</label>`;
  $(`panel-${kind}`).innerHTML = `<h2 class="section-title">${labels[kind]}</h2>
    <form id="form-${kind}" onsubmit="saveRecord(event, '${kind}')"><input type="hidden" name="id"><h3 id="heading-${kind}" class="small text-gold">Novo cadastro</h3>${inputs}
      <div class="admin-actions"><button class="btn btn-gold" type="submit">Salvar</button><button class="btn btn-outline" type="button" onclick="resetRecord('${kind}')">Limpar / novo</button></div>
    </form><div class="admin-list">${catalog[kind].map(item => `<article class="admin-record">
      ${kind !== 'services' ? `<img class="admin-photo" src="${esc(item.image || item.photo || LOGO)}" alt="" onerror="this.onerror=null;this.src='${LOGO}'">` : ''}
      <strong>${esc(item.name)}</strong><p class="small muted">${kind === 'services' ? `${money(item.price)} · ${item.duration} min` : kind === 'barbers' ? esc(item.spec) : `${money(item.price)} · ${esc(item.category)}`}</p>
      <div class="admin-actions"><button class="btn btn-outline" onclick="editRecord('${kind}',${item.id})">Editar</button><button class="btn btn-danger" onclick="removeRecord('${kind}',${item.id},this)">Remover</button></div>
    </article>`).join('') || '<p class="empty">Nenhum cadastro.</p>'}</div>`;
}
function resetRecord(kind) {
  $(`form-${kind}`).reset();
  $(`form-${kind}`).elements.id.value = '';
  $(`heading-${kind}`).textContent = 'Novo cadastro';
}
function editRecord(kind, id) {
  const item = catalog[kind].find(record => record.id === id),
    form = $(`form-${kind}`);
  form.reset();
  for (const name of ['id', 'name', 'price', 'duration', 'spec', 'category']) if (form.elements[name]) form.elements[name].value = item[name];
  const picture = item.image || item.photo || '';
  if (form.elements.imageUrl) form.elements.imageUrl.value = /^https?:/.test(picture) ? picture : '';
  $(`heading-${kind}`).textContent = `Editando: ${item.name}`;
  form.scrollIntoView({
    behavior: 'smooth',
    block: 'start'
  });
}
function readImage(file) {
  return new Promise((resolve, reject) => {
    if (file.size > 900000) {
      reject(new Error('Escolha uma foto de até 900 KB.'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Não foi possível ler a foto.'));
    reader.readAsDataURL(file);
  });
}
function saveRecord(event, kind) {
  event.preventDefault();
  const form = event.target,
    button = event.submitter;
  action(async () => {
    const data = Object.fromEntries(new FormData(form));
    const id = data.id;
    const old = catalog[kind].find(item => item.id === Number(id));
    if (kind !== 'services') {
      const file = form.elements.file.files[0];
      data[kind === 'barbers' ? 'photo' : 'image'] = file ? await readImage(file) : data.removeImage ? '' : data.imageUrl || old?.image || old?.photo || '';
    }
    delete data.file;
    delete data.imageUrl;
    delete data.removeImage;
    await api(`/api/admin/${kind}${id ? '/' + id : ''}`, {
      method: id ? 'PUT' : 'POST',
      body: data
    });
    await refreshCatalog();
    renderSkills();
    if (adminUser.role === 'ROOT') await loadAccounts();
    status('Cadastro salvo.');
  }, button);
}
function removeRecord(kind, id, button) {
  if (!confirm('Remover este cadastro? Agendamentos existentes serão preservados.')) return;
  action(async () => {
    await api(`/api/admin/${kind}/${id}`, {
      method: 'DELETE'
    });
    await refreshCatalog();
    status('Cadastro removido.');
  }, button);
}
async function loadAgenda() {
  const request = ++agendaRequest,
    date = $('agendaDate').value;
  $('agendaList').textContent = 'Carregando agenda…';
  $('blocksList').replaceChildren();
  try {
    const [appointments, blocks] = await Promise.all([api('/api/admin/appointments?date=' + encodeURIComponent(date)), api('/api/admin/blocks?date=' + encodeURIComponent(date))]);
    if (request !== agendaRequest) return;
    $('agendaList').innerHTML = appointments.map(item => `<article class="admin-record">
      <strong>${clock(item.start)} – ${clock(item.end)} · ${esc(item.barber)}</strong>
      <p>${esc(item.customer)} · <a class="text-gold" href="tel:${esc(item.phone)}">${esc(item.phone)}</a></p>
      <p class="small">${esc(item.service)} · ${money(item.price)} · ${esc(item.payment)}</p>
      <p class="small ${item.status === 'cancelled' ? 'text-danger' : 'text-gold'}">${item.status === 'cancelled' ? 'Cancelado' : 'Confirmado'}</p>
      <p class="small muted">Código: ${esc(item.id)}</p>
      ${item.status === 'confirmed' ? `<button class="btn btn-danger" onclick="cancelAppointment('${item.id}',this)">Cancelar agendamento</button>` : ''}
    </article>`).join('') || '<p class="empty">Nenhum agendamento nesta data.</p>';
    $('blocksList').innerHTML = '<h3 class="text-gold">Bloqueios do dia</h3>' + (blocks.map(item => `<div class="admin-record"><strong>${clock(item.start)} – ${clock(item.end)} · ${esc(item.barber)}</strong><p class="small">${esc(item.reason)}</p><button class="btn btn-danger" onclick="removeBlock(${item.id},this)">Remover bloqueio</button></div>`).join('') || '<p class="empty">Nenhum bloqueio.</p>');
  } catch (error) {
    if (request === agendaRequest) $('agendaList').textContent = 'Não foi possível carregar a agenda.';
    throw error;
  }
}
function cancelAppointment(id, button) {
  if (!confirm('Cancelar este agendamento e liberar o horário? Avise o cliente sobre a alteração.')) return;
  action(async () => {
    await api('/api/admin/appointments/' + id, {
      method: 'DELETE'
    });
    await loadAgenda();
    status('Agendamento cancelado.');
  }, button);
}
function removeBlock(id, button) {
  action(async () => {
    await api('/api/admin/blocks/' + id, {
      method: 'DELETE'
    });
    await loadAgenda();
    status('Bloqueio removido.');
  }, button);
}
document.addEventListener('DOMContentLoaded', async () => {
  $('agendaDate').value = today();
  $('loginForm').addEventListener('submit', event => {
    event.preventDefault();
    action(async () => {
      const result = await api('/api/admin/login', {
        method: 'POST',
        body: {
          username: $('adminUsername').value,
          password: $('adminPassword').value
        }
      });
      $('adminPassword').value = '';
      if (result.otpRequired) {
        otpChallenge = result.challenge;
        $('loginForm').hidden = true;
        $('otpLoginForm').hidden = false;
        $('adminOtpCode').focus();
      } else await enterPanel();
    }, event.submitter);
  });
  $('logoutButton').addEventListener('click', event => action(async () => {
    await api('/api/admin/logout', {
      method: 'POST',
      body: {}
    });
    showLogin();
    status('Sessão encerrada.');
  }, event.target));
  $('agendaDate').addEventListener('change', () => action(loadAgenda));
  $('refreshAgenda').addEventListener('click', event => action(loadAgenda, event.target));
  document.querySelectorAll('[data-section]').forEach(button => button.addEventListener('click', () => {
    document.querySelectorAll('.admin-panel').forEach(panel => panel.hidden = panel.id !== 'panel-' + button.dataset.section);
    document.querySelectorAll('[data-section]').forEach(tab => {
      tab.classList.toggle('btn-gold', tab === button);
      tab.classList.toggle('btn-outline', tab !== button);
    });
    status('');
  }));
  $('blockForm').addEventListener('submit', event => {
    event.preventDefault();
    action(async () => {
      await api('/api/admin/blocks', {
        method: 'POST',
        body: {
          barberId: $('blockBarber').value,
          date: $('agendaDate').value,
          start: $('blockStart').value,
          end: $('blockEnd').value,
          reason: $('blockReason').value
        }
      });
      await loadAgenda();
      status('Intervalo bloqueado.');
    }, event.submitter);
  });
  $('hoursForm').addEventListener('submit', event => {
    event.preventDefault();
    action(async () => {
      const hours = catalog.hours.map(day => ({
        weekday: day.weekday,
        opens: $(`opens-${day.weekday}`).value,
        closes: $(`closes-${day.weekday}`).value,
        closed: $(`closed-${day.weekday}`).checked
      }));
      await api('/api/admin/hours', {
        method: 'PUT',
        body: {
          hours
        }
      });
      await refreshCatalog();
      status('Expediente salvo.');
    }, event.submitter);
  });
  try {
    await api('/api/admin/session');
    await enterPanel();
  } catch (error) {
    showLogin();
    if (error.status !== 401) status(error.message);
  }
});

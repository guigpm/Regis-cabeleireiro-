'use strict';

let adminUser = null,
  otpChallenge = '',
  administratorAccounts = [];
function resetAdminLogin() {
  otpChallenge = '';
  $('loginForm').hidden = false;
  $('otpLoginForm').hidden = true;
  $('adminOtpCode').value = '';
}
function applyPermissions() {
  const isRoot = adminUser.role === 'ROOT';
  for (const section of ['services', 'barbers', 'products', 'hours', 'accounts']) {
    document.querySelector(`[data-section="${section}"]`).hidden = !isRoot;
    if (!isRoot) $(`panel-${section}`).hidden = true;
  }
  document.querySelector('[data-section="skills"]').textContent = isRoot
    ? 'Serviços por profissional'
    : 'Meus serviços';
  document
    .querySelectorAll('.admin-panel')
    .forEach((panel) => (panel.hidden = panel.id !== 'panel-agenda'));
  document.querySelectorAll('[data-section]').forEach((button) => {
    button.classList.toggle('btn-gold', button.dataset.section === 'agenda');
    button.classList.toggle('btn-outline', button.dataset.section !== 'agenda');
  });
}
function renderSkills(selected) {
  const available = catalog.barbers.filter(
    (b) => b.active !== 0 && (adminUser.role === 'ROOT' || b.id === adminUser.barberId)
  );
  const id = Number(selected || available[0]?.id),
    barber = available.find((b) => b.id === id);
  $('skillsContent').innerHTML = barber
    ? `<label class="small" for="skillsBarber">Profissional</label><select id="skillsBarber" class="form-control" data-event-change="renderSkillsAction">${available.map((b) => `<option value="${b.id}" ${b.id === id ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select>
    <form data-event-submit="saveSkillsAction" data-arg-0="${esc(id)}"><label class="small"><input id="allServices" type="checkbox" ${barber.allServices ? 'checked' : ''} data-event-change="toggleServiceChoicesAction"> Executar todos os serviços, inclusive os cadastrados futuramente</label>
    <div id="serviceChoices" class="service-choices">${catalog.services.map((service) => `<label><input type="checkbox" name="serviceId" value="${service.id}" ${barber.serviceIds.includes(service.id) ? 'checked' : ''} ${barber.allServices ? 'disabled' : ''}> ${esc(service.name)}</label>`).join('')}</div>
    <button type="submit" class="btn btn-gold full">Salvar serviços disponíveis</button></form>`
    : '<p class="empty">Cadastre um profissional primeiro.</p>';
}
function toggleServiceChoices() {
  document
    .querySelectorAll('#serviceChoices input')
    .forEach((input) => (input.disabled = $('allServices').checked));
}
function saveSkills(event, id) {
  event.preventDefault();
  action(async () => {
    const serviceIds = Array.from(document.querySelectorAll('#serviceChoices input:checked')).map(
      (input) => Number(input.value)
    );
    await api(`/api/admin/barbers/${id}/services`, {
      method: 'PUT',
      body: {
        allServices: $('allServices').checked,
        serviceIds
      }
    });
    await refreshCatalog();
    renderSkills(id);
    status('Serviços atualizados.');
  }, event.submitter);
}
async function loadAccounts() {
  administratorAccounts = await api('/api/admin/accounts');
  $('accountsContent').innerHTML =
    `<p class="notice">ROOT administra o sistema e não aparece como profissional na agenda. Para dar acesso a um cabeleireiro, cadastre-o na Equipe e vincule uma conta abaixo.</p>
    <form id="adminAccountForm" data-event-submit="saveAdminAccountAction"><input type="hidden" name="id">
      <label class="small" for="accountUsername">Usuário de login</label><input id="accountUsername" name="username" class="form-control" required minlength="3" maxlength="60" pattern="[a-zA-Z0-9._-]+">
      <label class="small" for="accountName">Nome</label><input id="accountName" name="name" class="form-control" required minlength="2" maxlength="90">
      <label class="small" for="accountRole">Perfil</label><select id="accountRole" name="role" class="form-control" data-event-change="accountRoleChangedAction"><option value="BARBER">Administrador cabeleireiro</option><option value="ROOT">ROOT — acesso total</option></select>
      <div id="accountBarberField"><label class="small" for="accountBarber">Profissional vinculado</label><select id="accountBarber" name="barberId" class="form-control">${catalog.barbers.map((b) => `<option value="${b.id}">${esc(b.name)}</option>`).join('')}</select></div>
      <label class="small" for="accountPassword">Senha inicial ou nova senha (deixe vazia para manter na edição)</label><input id="accountPassword" name="password" class="form-control" type="password" minlength="12" maxlength="200" autocomplete="new-password">
      <div class="admin-actions"><button class="btn btn-gold" type="submit">Salvar administrador</button><button class="btn btn-outline" type="button" data-event-click="loadAccountsAction">Novo / limpar</button></div>
    </form>
    ${administratorAccounts.map((a) => `<article class="admin-record"><strong>${esc(a.name)} · ${esc(a.username)}</strong><p class="small">${a.role === 'ROOT' ? 'ROOT' : 'Cabeleireiro'} · ${a.active ? 'Ativo' : 'Desativado'} · OTP ${a.otpEnabled ? 'ativo' : 'inativo'}</p><div class="admin-actions"><button class="btn btn-outline" data-event-click="editAdminAccountAction" data-arg-0="${esc(a.id)}">Editar${a.active ? '' : ' / reativar'}</button>${a.id !== adminUser.id && a.username !== 'root' && a.active ? `<button class="btn btn-danger" data-event-click="disableAdminAccountAction" data-arg-0="${esc(a.id)}">Desativar</button>` : ''}</div></article>`).join('')}`;
}
function accountRoleChanged() {
  $('accountBarberField').hidden = $('accountRole').value === 'ROOT';
}
function editAdminAccount(id) {
  const account = administratorAccounts.find((a) => a.id === id),
    form = $('adminAccountForm');
  form.elements.id.value = id;
  form.elements.username.value = account.username;
  form.elements.name.value = account.name;
  form.elements.role.value = account.role;
  form.elements.barberId.value = account.barberId || '';
  form.elements.password.value = '';
  accountRoleChanged();
  form.scrollIntoView({
    behavior: 'smooth'
  });
}
function saveAdminAccount(event) {
  event.preventDefault();
  action(async () => {
    const data = Object.fromEntries(new FormData(event.target)),
      id = data.id;
    await api('/api/admin/accounts' + (id ? '/' + id : ''), {
      method: id ? 'PUT' : 'POST',
      body: data
    });
    if (Number(id) === adminUser.id) {
      showLogin();
      status('Conta atualizada. Entre novamente.');
      return;
    }
    await loadAccounts();
    status('Administrador salvo.');
  }, event.submitter);
}
function disableAdminAccount(id, button) {
  if (!confirm('Desativar o acesso deste administrador?')) return;
  action(async () => {
    await api('/api/admin/accounts/' + id, {
      method: 'DELETE'
    });
    await loadAccounts();
    status('Acesso desativado.');
  }, button);
}
function renderSecurity() {
  $('securityContent').innerHTML =
    `<p class="small">Conta: ${esc(adminUser.username)} · OTP <strong>${adminUser.otpEnabled ? 'ativo' : 'inativo'}</strong></p>
    ${adminUser.otpEnabled ? `<p class="notice">Seu login exige senha e código do autenticador. Guarde seus códigos de recuperação fora deste navegador.</p><form data-event-submit="disableOtpAction"><label class="small" for="disableOtpPassword">Senha atual</label><input id="disableOtpPassword" class="form-control" type="password" required autocomplete="current-password"><label class="small" for="disableOtpCode">Código do autenticador ou recuperação</label><input id="disableOtpCode" class="form-control" required autocomplete="one-time-code"><button class="btn btn-danger" type="submit">Desativar OTP</button></form>` : `<p class="notice">Use Google Authenticator, Microsoft Authenticator ou outro aplicativo compatível com TOTP. A ativação só termina após validar um código.</p><form data-event-submit="setupOtpAction"><label class="small" for="setupOtpPassword">Confirme sua senha</label><input id="setupOtpPassword" class="form-control" type="password" required autocomplete="current-password"><button class="btn btn-gold" type="submit">Configurar OTP</button></form><div id="otpEnrollment"></div>`}`;
}
function setupOtp(event) {
  event.preventDefault();
  action(async () => {
    const result = await api('/api/admin/otp/setup', {
      method: 'POST',
      body: {
        password: $('setupOtpPassword').value
      }
    });
    $('setupOtpPassword').value = '';
    $('otpEnrollment').innerHTML =
      `<p class="small">No autenticador, adicione uma chave manual: tipo baseado em tempo, 6 dígitos, 30 segundos.</p><pre class="secret-code">${esc(result.secret)}</pre><a class="btn btn-outline full" href="${esc(result.uri)}">Abrir no aplicativo autenticador</a><form data-event-submit="enableOtpAction"><label class="small" for="enableOtpCode">Código de 6 dígitos</label><input id="enableOtpCode" class="form-control" inputmode="numeric" pattern="[0-9]{6}" autocomplete="one-time-code" required><button class="btn btn-gold" type="submit">Verificar e ativar</button></form>`;
  }, event.submitter);
}
function enableOtp(event) {
  event.preventDefault();
  action(async () => {
    const result = await api('/api/admin/otp/enable', {
      method: 'POST',
      body: {
        code: $('enableOtpCode').value
      }
    });
    adminUser = result.admin;
    renderSecurity();
    $('securityContent').insertAdjacentHTML(
      'beforeend',
      `<div class="notice"><strong>Guarde estes códigos de recuperação. Cada um funciona uma única vez; eles não serão mostrados novamente.</strong><pre class="secret-code">${result.recoveryCodes.map(esc).join('\n')}</pre></div>`
    );
    status('OTP ativado.');
  }, event.submitter);
}
function disableOtp(event) {
  event.preventDefault();
  action(async () => {
    adminUser = (
      await api('/api/admin/otp/disable', {
        method: 'POST',
        body: {
          password: $('disableOtpPassword').value,
          code: $('disableOtpCode').value
        }
      })
    ).admin;
    renderSecurity();
    status('OTP desativado.');
  }, event.submitter);
}
async function loadWalkins() {
  if (!adminUser) return;
  const adminId = adminUser.id;
  const items = await api('/api/admin/walkins');
  if (adminUser?.id !== adminId) return;
  $('walkinCount').textContent = items.length ? `(${items.length})` : '';
  $('walkinsContent').innerHTML =
    items
      .map(
        (item) =>
          `<article class="admin-record"><strong>${esc(item.customer)} · ${esc(item.service)}</strong><p>${esc(item.barber)} · ${esc(item.phone)}</p><p class="small muted">Expira às ${new Date(
            item.expires_at
          ).toLocaleTimeString('pt-BR', {
            timeZone: 'America/Sao_Paulo',
            hour: '2-digit',
            minute: '2-digit'
          })}</p><div class="admin-actions">${adminUser.role === 'BARBER' && adminUser.barberId === item.barber_id ? `<button class="btn btn-gold" data-event-click="decideWalkinAction" data-arg-0="${esc(item.id)}">Cliente presente: confirmar agora</button>` : '<span class="small muted">Confirmação pelo cabeleireiro selecionado.</span>'}<button class="btn btn-danger" data-event-click="decideWalkinAction39" data-arg-0="${esc(item.id)}">Recusar</button></div></article>`
      )
      .join('') || '<p class="empty">Nenhum pedido aguardando confirmação.</p>';
}
function decideWalkin(id, decision, button) {
  action(async () => {
    await api('/api/admin/walkins/' + id, {
      method: 'POST',
      body: {
        decision
      }
    });
    await loadWalkins();
    await loadAgenda();
    status(decision === 'accept' ? 'Atendimento confirmado.' : 'Solicitação recusada.');
  }, button);
}
document.addEventListener('DOMContentLoaded', () => {
  $('otpLoginForm').addEventListener('submit', (event) => {
    event.preventDefault();
    action(async () => {
      await api('/api/admin/login/otp', {
        method: 'POST',
        body: {
          challenge: otpChallenge,
          code: $('adminOtpCode').value.trim()
        }
      });
      resetAdminLogin();
      await enterPanel();
    }, event.submitter);
  });
});
setInterval(() => {
  if (adminUser && !document.hidden)
    loadWalkins().catch((error) => {
      if (error.status === 401) showLogin();
    });
}, 15000);

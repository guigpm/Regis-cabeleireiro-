'use strict';
// Views consume JSON only. Amounts, permissions and transitions are recalculated by the API.
const appointmentLabels = {
  confirmed: 'Agendado',
  in_progress: 'Em andamento',
  completed: 'Concluído',
  cancelled: 'Cancelado'
};
let historyOffset = 0,
  reportOffset = 0,
  currentHistory = [],
  saleRequestId = '',
  reminderTimer;
function barberOptions(all = false) {
  return (
    (all && adminUser.role === 'ROOT' ? '<option value="">Todos os profissionais</option>' : '') +
    catalog.barbers
      .map(
        (b) =>
          `<option value="${b.id}">${esc(b.name)}${b.active === 0 ? ' (inativo)' : ''}</option>`
      )
      .join('')
  );
}
function refreshOperationOptions() {
  for (const [id, all] of [
    ['historyBarber', true],
    ['reportBarber', true],
    ['personalBarber', false],
    ['saleBarber', false],
    ['commissionBarber', false]
  ]) {
    const select = $(id),
      selected = select.value;
    select.innerHTML = barberOptions(all);
    if ([...select.options].some((option) => option.value === selected)) select.value = selected;
  }
}
function initOperations() {
  refreshOperationOptions();
  $('commissionSettings').hidden = adminUser.role !== 'ROOT';
  $('reportFrom').value = today();
  $('reportTo').value = today();
  $('exceptionDate').value = today();
  $('commissionPercent').value =
    (catalog.barbers.find((b) => b.id === Number($('commissionBarber').value))?.commission_bps ??
      4500) / 100;
  renderSaleProducts();
  loadPersonalHours().catch((e) => status(e.message));
  loadReport().catch((e) => status(e.message));
}
function appointmentCard(item) {
  return `<article class="admin-record"><strong>${formatDate(item.date)} · ${clock(item.start)} – ${clock(item.end)} · ${esc(item.barber)}</strong>
    <p>${esc(item.customer)} · <a class="text-gold" href="tel:${esc(item.phone)}">${esc(item.phone)}</a></p>
    <p>${esc(item.service)} · ${money(item.price)} · ${esc(item.payment)} ${esc(item.card_brand || '')}</p>
    <p class="text-gold">${appointmentLabels[item.status]}</p>
    ${item.started_at ? `<p class="small">Iniciado: ${esc(item.started_at)} UTC</p>` : ''}
    ${item.completed_at ? `<p class="small">Concluído: ${esc(item.completed_at)} UTC</p>` : ''}
    <div class="admin-actions">
    ${item.status === 'confirmed' ? `<button class="btn btn-gold" data-event-click="changeAppointmentAction" data-arg-0="${esc(item.id)}">Iniciar</button>` : ''}
    ${item.status === 'in_progress' ? `<button class="btn btn-gold" data-event-click="openCompletionAction" data-arg-0="${esc(item.id)}">Concluir / receber</button><button class="btn btn-outline" data-event-click="openAttachedProductsAction" data-arg-0="${esc(item.id)}">Produtos do atendimento</button>` : ''}
    ${['confirmed', 'in_progress'].includes(item.status) ? `<button class="btn btn-danger" data-event-click="cancelAppointmentAction" data-arg-0="${esc(item.id)}">Cancelar</button>` : ''}
    </div></article>`;
}
async function loadHistory(reset = false) {
  if (reset) historyOffset = 0;
  const query = new URLSearchParams({
    from: $('historyFrom').value || '0001-01-01',
    to: $('historyTo').value || '9999-12-31',
    barberId: $('historyBarber').value,
    status: $('historyStatus').value,
    offset: historyOffset
  });
  const result = await api('/api/admin/history?' + query);
  currentHistory = result.items;
  $('historyList').innerHTML =
    result.items.map(appointmentCard).join('') || '<p>Nenhum atendimento no período.</p>';
  $('historyCount').textContent = `${result.total} atendimentos · página ${historyOffset / 50 + 1}`;
  $('historyPrev').disabled = historyOffset === 0;
  $('historyNext').disabled = historyOffset + 50 >= result.total;
}
async function changeAppointment(id, state, extra = {}) {
  await api(`/api/admin/appointments/${id}/status`, {
    method: 'PATCH',
    body: { status: state, ...extra }
  });
  if (state === 'completed') {
    await refreshCatalog();
    renderSaleProducts();
  }
  await loadAgenda();
  await loadHistory();
  await loadReport();
  status('Atendimento atualizado.');
}
function paymentFields(prefix) {
  return `<label>Pagamento realizado<select class="form-control" id="${prefix}Payment" required><option value="">Selecione</option><option>Dinheiro</option><option>Pix</option><option>Cartão de Débito</option><option>Cartão de Crédito</option></select></label>
    <label>Bandeira (obrigatória para cartões)<input class="form-control" id="${prefix}Brand" list="cardBrands" maxlength="40" placeholder="Visa, Elo, Mastercard…"></label>`;
}
function openCompletion(id) {
  $('operationDialog').innerHTML =
    `<h2>Concluir atendimento</h2><p>Confirme o recebimento do serviço e dos produtos vinculados. Esta operação registra os valores e a comissão de forma definitiva.</p><form id="completionForm">${paymentFields('complete')}<button class="btn btn-gold">Confirmar conclusão</button></form><button class="btn btn-outline" data-event-click="closeOperationAction">Voltar</button>`;
  $('completionForm').addEventListener('submit', (e) => {
    e.preventDefault();
    action(async () => {
      await changeAppointment(id, 'completed', {
        payment: $('completePayment').value,
        cardBrand: $('completeBrand').value
      });
      closeOperation();
    }, e.submitter);
  });
  $('operationDialog').showModal();
}
function closeOperation() {
  $('operationDialog').close();
}
function productFields(prefix, existing = []) {
  return catalog.products
    .map(
      (p) =>
        `<label class="product-sale-row">${esc(p.name)} · ${money(p.price)}${p.stock === null ? '' : ` · estoque ${p.stock}`}<input class="form-control" type="number" min="0" max="1000" step="1" data-${prefix}-product="${p.id}" value="${existing.find((l) => l.product_id === p.id)?.quantity || 0}" aria-label="Quantidade de ${esc(p.name)}"></label>`
    )
    .join('');
}
function readProducts(prefix) {
  return [...document.querySelectorAll(`[data-${prefix}-product]`)]
    .filter((el) => Number(el.value) > 0)
    .map((el) => ({
      productId: Number(el.getAttribute(`data-${prefix}-product`)),
      quantity: Number(el.value)
    }));
}
async function openAttachedProducts(id) {
  const items = await api(`/api/admin/appointments/${id}/products`);
  $('operationDialog').innerHTML =
    `<h2>Produtos do atendimento</h2><p>O pagamento e a baixa de estoque acontecem na conclusão. Quantidade zero remove o produto.</p><form id="attachedForm">${productFields('attached', items)}<button class="btn btn-gold">Salvar produtos</button></form><button class="btn btn-outline" data-event-click="closeOperationAction">Voltar</button>`;
  $('attachedForm').addEventListener('submit', (e) => {
    e.preventDefault();
    action(async () => {
      await api(`/api/admin/appointments/${id}/products`, {
        method: 'PUT',
        body: { items: readProducts('attached') }
      });
      closeOperation();
      status('Produtos vinculados ao atendimento.');
    }, e.submitter);
  });
  $('operationDialog').showModal();
}
function renderSaleProducts() {
  $('saleProducts').innerHTML = productFields('sale');
  saleRequestId = newRequestId();
}
async function saveSale(event) {
  event.preventDefault();
  action(async () => {
    const barberId = $('saleBarber').value,
      items = readProducts('sale');
    if (!items.length) throw new Error('Selecione pelo menos um produto.');
    const ongoing = await api(
      '/api/admin/history?' + new URLSearchParams({ barberId, status: 'in_progress' })
    );
    if (
      ongoing.items.length &&
      confirm(
        'Há um atendimento em andamento. Deseja vincular esta venda a ele? Cancelar continua como venda separada.'
      )
    ) {
      const id = ongoing.items[0].id,
        previous = await api(`/api/admin/appointments/${id}/products`);
      const combined = new Map(
        previous.map((p) => [p.product_id, { productId: p.product_id, quantity: p.quantity }])
      );
      for (const item of items)
        combined.set(item.productId, {
          ...item,
          quantity: item.quantity + (combined.get(item.productId)?.quantity || 0)
        });
      await api(`/api/admin/appointments/${id}/products`, {
        method: 'PUT',
        body: { items: [...combined.values()] }
      });
      status('Produtos vinculados. Receba o pagamento ao concluir o atendimento.');
    } else {
      if (!confirm('Confirmar venda separada e recebimento do pagamento?')) return;
      await api('/api/admin/sales', {
        method: 'POST',
        body: {
          barberId,
          items,
          requestId: saleRequestId,
          standalone: true,
          payment: $('salePayment').value,
          cardBrand: $('saleBrand').value
        }
      });
      status('Venda registrada.');
    }
    await refreshCatalog();
    renderSaleProducts();
    await loadReport();
  }, event.submitter);
}
async function loadPersonalHours() {
  const id = $('personalBarber').value;
  if (!id) return;
  const data = await api(`/api/admin/barbers/${id}/hours`);
  $('personalHoursRows').innerHTML = data.weekly
    .map(
      (day) =>
        `<div class="hours-row"><label><input type="checkbox" id="personalClosed${day.weekday}" ${day.closed ? 'checked' : ''}> ${days[day.weekday]} fechado</label><label>Início<input type="time" class="form-control" id="personalOpen${day.weekday}" value="${clock(day.opens)}" required></label><label>Fim<input type="text" pattern="([01][0-9]|2[0-3]):[0-5][0-9]|24:00" class="form-control" id="personalClose${day.weekday}" value="${clock(day.closes)}" required></label></div>`
    )
    .join('');
  $('personalExceptions').innerHTML = data.exceptions
    .map(
      (day) =>
        `<div class="admin-record">${formatDate(day.date)} · ${day.closed ? 'Fechado' : clock(day.opens) + ' – ' + clock(day.closes)} <button class="btn btn-outline" data-event-click="removeExceptionAction" data-arg-0="${esc(day.date)}">Usar expediente semanal</button></div>`
    )
    .join('');
}
async function removeException(date) {
  await api(`/api/admin/barbers/${$('personalBarber').value}/hours`, {
    method: 'DELETE',
    body: { date }
  });
  await loadPersonalHours();
}
async function releaseBlock(id) {
  const releaseFrom = prompt('Liberar este bloqueio a partir de qual horário? (HH:MM)');
  if (!releaseFrom) return;
  await api('/api/admin/blocks/' + id, { method: 'PATCH', body: { releaseFrom } });
  await loadAgenda();
}
function reportPeriod(period) {
  const date = new Date(today() + 'T12:00:00Z'),
    end = new Date(date);
  if (period === 'week') {
    date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
    end.setTime(date.getTime() + 6 * 86400000);
  }
  if (period === 'month') {
    date.setUTCDate(1);
    end.setUTCMonth(end.getUTCMonth() + 1, 0);
  }
  $('reportFrom').value = date.toISOString().slice(0, 10);
  $('reportTo').value = end.toISOString().slice(0, 10);
  reportOffset = 0;
  return loadReport();
}
async function loadReport(reset = false) {
  if (reset) reportOffset = 0;
  const result = await api(
    '/api/admin/reports?' +
      new URLSearchParams({
        from: $('reportFrom').value,
        to: $('reportTo').value,
        barberId: $('reportBarber').value,
        kind: $('reportKind').value,
        payment: $('reportPayment').value,
        cardBrand: $('reportBrand').value,
        offset: reportOffset
      })
  );
  $('reportTotals').textContent =
    `Recebido: ${money(result.totals.grossCents / 100)} · Comissão apurada: ${money(result.totals.commissionCents / 100)} · Comissão estimada de serviços ainda não concluídos: ${money(result.projectedCommissionCents / 100)}`;
  $('reportBreakdown').innerHTML =
    `<table class="report-table"><thead><tr><th>Item</th><th>Tipo</th><th>Quantidade</th><th>Recebido</th><th>Comissão</th></tr></thead><tbody>${result.breakdown.map((i) => `<tr><td>${esc(i.name)}</td><td>${i.kind === 'service' ? 'Serviço' : 'Produto'}</td><td>${i.quantity}</td><td>${money(i.grossCents / 100)}</td><td>${money(i.commissionCents / 100)}</td></tr>`).join('')}</tbody></table>`;
  $('reportDetails').innerHTML =
    result.items
      .map(
        (i) =>
          `<article class="admin-record"><strong>${formatDate(i.date)} · ${esc(i.barber)} · ${esc(i.name)} × ${i.quantity}</strong><p>${money(i.gross_cents / 100)} · Comissão ${i.commission_bps / 100}%: ${money(i.commission_cents / 100)}</p><p>${esc(i.payment)} ${esc(i.card_brand)} · ${i.appointment_id ? 'Atendimento ' + esc(i.appointment_id) : 'Venda avulsa ' + esc(i.sale_id)}</p></article>`
      )
      .join('') || '<p>Nenhum recebimento neste período.</p>';
  $('reportCount').textContent =
    `${result.totals.lines} lançamentos · página ${reportOffset / 50 + 1}`;
  $('reportPrev').disabled = reportOffset === 0;
  $('reportNext').disabled = reportOffset + 50 >= result.totals.lines;
}
// Foreground reminders deliberately contain no customer names on the phone lock screen.
let reminderRegistration,
  reminded = new Set();
async function enableReminders() {
  if (!('Notification' in window) || !('serviceWorker' in navigator))
    throw new Error(
      'Este navegador não oferece notificações. Use HTTPS e um navegador compatível.'
    );
  if ((await Notification.requestPermission()) !== 'granted')
    throw new Error('Permita as notificações nas configurações do navegador.');
  await navigator.serviceWorker.register('/sw.js');
  reminderRegistration = await navigator.serviceWorker.ready;
  clearInterval(reminderTimer);
  reminderTimer = setInterval(() => checkReminders().catch(() => {}), 60000);
  await checkReminders();
  status('Avisos ativados enquanto o painel estiver aberto.');
}
async function checkReminders() {
  if (!adminUser || !reminderRegistration) return;
  const data = await api(
    '/api/admin/history?' + new URLSearchParams({ date: today(), status: 'confirmed', limit: 100 })
  );
  for (const item of data.items) {
    const until = new Date(`${item.date}T${clock(item.start)}:00-03:00`).getTime() - Date.now();
    if (until >= 0 && until <= 15 * 60000 && !reminded.has(item.id)) {
      await reminderRegistration.showNotification('Próximo atendimento', {
        body: 'Você tem um atendimento nos próximos 15 minutos. Consulte sua agenda.',
        tag: item.id,
        icon: '/assets/images/logo.jpg'
      });
      reminded.add(item.id);
    }
  }
}
document.addEventListener('DOMContentLoaded', () => {
  $('salePaymentFields').innerHTML = paymentFields('sale');
  $('saleForm').addEventListener('submit', saveSale);
  $('historyFilter').addEventListener('submit', (e) => {
    e.preventDefault();
    action(() => loadHistory(true), e.submitter);
  });
  $('reportFilter').addEventListener('submit', (e) => {
    e.preventDefault();
    action(() => loadReport(true), e.submitter);
  });
  $('personalBarber').addEventListener('change', () => action(loadPersonalHours));
  $('personalHoursForm').addEventListener('submit', (e) => {
    e.preventDefault();
    action(async () => {
      const hours = days.map((_, weekday) => ({
        weekday,
        opens: $('personalOpen' + weekday).value,
        closes: $('personalClose' + weekday).value,
        closed: $('personalClosed' + weekday).checked
      }));
      await api(`/api/admin/barbers/${$('personalBarber').value}/hours`, {
        method: 'PUT',
        body: { hours }
      });
      status('Expediente individual salvo. Restrições do ROOT continuam valendo.');
    }, e.submitter);
  });
  $('exceptionForm').addEventListener('submit', (e) => {
    e.preventDefault();
    action(async () => {
      await api(`/api/admin/barbers/${$('personalBarber').value}/hours`, {
        method: 'PUT',
        body: {
          date: $('exceptionDate').value,
          opens: $('exceptionOpen').value,
          closes: $('exceptionClose').value,
          closed: $('exceptionClosed').checked
        }
      });
      await loadPersonalHours();
      status('Exceção de expediente salva.');
    }, e.submitter);
  });
  $('commissionForm').addEventListener('submit', (e) => {
    e.preventDefault();
    action(async () => {
      await api(`/api/admin/barbers/${$('commissionBarber').value}/commission`, {
        method: 'PUT',
        body: { percent: $('commissionPercent').value }
      });
      await refreshCatalog();
      status('Comissão atualizada para os próximos recebimentos.');
    }, e.submitter);
  });
  $('commissionBarber').addEventListener('change', () => {
    $('commissionPercent').value =
      (catalog.barbers.find((b) => b.id === Number($('commissionBarber').value))?.commission_bps ??
        4500) / 100;
  });
});

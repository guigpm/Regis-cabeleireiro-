'use strict';

// Formatação, escape de texto e integração com WhatsApp.
const $ = (id) => document.getElementById(id);
function money(n) {
  return Number(n || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}
function esc(s) {
  return String(s ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      })[c]
  );
}
function formatDate(d) {
  if (!d) return '';
  let [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}
function whatsapp(msg) {
  window.open(
    'https://wa.me/' + WHATSAPP + '?text=' + encodeURIComponent(msg),
    '_blank',
    'noopener'
  );
}
let csrfTokenPromise;
async function api(path, options = {}) {
  let csrfToken;
  if (options.method && !['GET', 'HEAD'].includes(options.method)) {
    csrfTokenPromise ||= fetch('/api/csrf', { credentials: 'same-origin' })
      .then((r) => {
        if (!r.ok) throw new Error('Não foi possível obter proteção de sessão.');
        return r.json();
      })
      .catch((error) => {
        csrfTokenPromise = null;
        throw error;
      });
    csrfToken = (await csrfTokenPromise).token;
  }
  const response = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
      ...options.headers
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  const data = await response.json();
  if (response.status === 403 && data.error?.startsWith('Token de segurança'))
    csrfTokenPromise = null;
  if (!response.ok) {
    const error = new Error(data.error || 'Não foi possível concluir a operação.');
    error.status = response.status;
    throw error;
  }
  return data;
}
function today() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());
  const get = (type) => parts.find((p) => p.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
function clock(minutes) {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

// getRandomValues remains available on local HTTP; randomUUID requires a secure context.
function newRequestId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

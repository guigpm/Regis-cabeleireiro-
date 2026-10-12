"use strict";

// Armazenamento local, formatação, escape de texto e integração com WhatsApp.

function load(key, fallback) {
  try {
    let x = JSON.parse(localStorage.getItem(key));
    return Array.isArray(x) ? x : fallback.map(o => ({
      ...o
    }));
  } catch {
    return fallback.map(o => ({
      ...o
    }));
  }
}

const $ = id => document.getElementById(id);

function money(n) {
  return Number(n || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[c]);
}

function save(k, v) {
  try {
    localStorage.setItem(k, JSON.stringify(v));
    return true;
  } catch {
    toast('Armazenamento cheio. Tente uma foto menor.');
    return false;
  }
}

function formatDate(d) {
  if (!d) return '';
  let [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

function whatsapp(msg) {
  window.open('https://wa.me/' + WHATSAPP + '?text=' + encodeURIComponent(msg), '_blank', 'noopener');
}

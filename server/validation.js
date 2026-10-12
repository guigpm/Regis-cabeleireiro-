export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export function check(condition, message, status = 400) {
  if (!condition) throw new HttpError(status, message);
}
export function text(value, label, max = 100, min = 1) {
  check(typeof value === 'string' && value.trim().length >= min && value.trim().length <= max, `${label} inválido.`);
  return value.trim();
}
export function integer(value, label, min = 1, max = Number.MAX_SAFE_INTEGER) {
  const n = Number(value);
  check(Number.isInteger(n) && n >= min && n <= max, `${label} inválido.`);
  return n;
}
export function price(value) {
  const n = Number(value);
  check(Number.isFinite(n) && n > 0 && n <= 100000, 'Preço inválido.');
  return Math.round(n * 100) / 100;
}
export function image(value = '') {
  check(typeof value === 'string' && value.length <= 1250000, 'Imagem inválida ou muito grande.');
  check(!value || /^https?:\/\/[^\s"'<>]+$/i.test(value) || /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(value) || /^\/assets\/images\/[\w.-]+$/.test(value), 'Use uma foto PNG, JPEG, WebP, GIF ou um link HTTP(S).');
  return value;
}
export function date(value) {
  check(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value), 'Data inválida.');
  const parsed = new Date(value + 'T12:00:00Z');
  check(!Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value, 'Data inválida.');
  return value;
}
export function minutes(value) {
  check(typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value), 'Horário inválido.');
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
}
export function clock(value) {
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}

import { check, text } from './validation.js';
export function cpf(value) {
  check(typeof value === 'string' && /^[\d.\-\s]+$/.test(value), 'CPF inválido.');
  const digits = value.replace(/\D/g, '');
  check(digits.length === 11 && !/^(\d)\1{10}$/.test(digits), 'CPF inválido.');
  for (let length = 9; length <= 10; length++) {
    let sum = 0;
    for (let i = 0; i < length; i++) sum += Number(digits[i]) * (length + 1 - i);
    const digit = ((sum * 10) % 11) % 10;
    check(digit === Number(digits[length]), 'CPF inválido.');
  }
  return digits;
}
export function email(value) {
  const result = text(value, 'E-mail', 254).toLowerCase();
  check(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result), 'E-mail inválido.');
  return result;
}
export function phone(value) {
  const result = text(value, 'Telefone', 25).replace(/\D/g, '');
  check(result.length >= 10 && result.length <= 13, 'Informe um telefone com DDD.');
  return result;
}
export function customerView(customer) {
  return {
    id: customer.id,
    name: customer.name,
    email: customer.email,
    phone: customer.phone,
    cpfMasked: customer.cpf ? `***.***.***-${customer.cpf.slice(-2)}` : '',
    complete: Boolean(customer.cpf && customer.phone),
    google: Boolean(customer.google_sub)
  };
}

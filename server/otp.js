import { createHmac, randomBytes, timingSafeEqual, createHash } from 'node:crypto';
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function newSecret() {
  const bytes = randomBytes(20);
  let bits = '';
  for (const byte of bytes) bits += byte.toString(2).padStart(8, '0');
  return bits
    .match(/.{5}/g)
    .map((part) => alphabet[parseInt(part, 2)])
    .join('');
}
function decode(secret) {
  const bits = [...secret]
    .map((letter) => alphabet.indexOf(letter).toString(2).padStart(5, '0'))
    .join('');
  return Buffer.from(bits.match(/.{8}/g).map((byte) => parseInt(byte, 2)));
}
export function totp(secret, counter, digits = 6) {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const hash = createHmac('sha1', decode(secret)).update(buffer).digest();
  const offset = hash[hash.length - 1] & 15;
  return String((hash.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits).padStart(digits, '0');
}
export function verifyTotp(secret, code, last = -1, now = Date.now()) {
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) return null;
  const current = Math.floor(now / 30000);
  for (const counter of [current, current - 1, current + 1]) {
    if (counter > last && timingSafeEqual(Buffer.from(totp(secret, counter)), Buffer.from(code)))
      return counter;
  }
  return null;
}
export function recoveryHash(code) {
  return createHash('sha256').update(code).digest('hex');
}
export function recoveryCodes() {
  return Array.from(
    {
      length: 8
    },
    () => randomBytes(10).toString('hex')
  );
}

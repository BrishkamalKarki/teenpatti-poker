// Wei to ETH conversion and vice-versa

import { formatEther, parseEther } from 'ethers';

export function toEth(wei, maxDecimals = 5) {
  if (wei === null || wei === undefined || wei === '') return '0';
  const text = formatEther(BigInt(wei));
  if (!text.includes('.')) return text;
  const [whole, fraction] = text.split('.');
  const trimmed = fraction.slice(0, maxDecimals).replace(/0+$/, '');
  return trimmed ? `${whole}.${trimmed}` : whole;
}

export function toWei(eth) {
  try {
    return parseEther(String(eth).trim());
  } catch {
    throw new Error(`"${eth}" is not a valid ETH amount`);
  }
}

export function ethLabel(wei, maxDecimals = 5) {
  return `${toEth(wei, maxDecimals)} ETH`;
}

export function shortAddress(address) {
  if (!address) return '—';
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function shortHash(hash) {
  if (!hash) return '—';
  return `${hash.slice(0, 10)}…${hash.slice(-6)}`;
}

const CODE_ALPHABET = '3456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export function randomRoomCode(length = 5) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

export function isValidRoomCode(code) {
  return /^[3-9A-HJ-NP-Z]{5}$/.test((code || '').trim().toUpperCase());
}

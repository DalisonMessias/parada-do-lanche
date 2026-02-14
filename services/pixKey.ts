import { PixKeyType } from '../types';

const digitsOnly = (value: string) => (value || '').replace(/\D/g, '');

const toMaskedCpf = (value: string) =>
  digitsOnly(value)
    .slice(0, 11)
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1-$2');

const toMaskedCnpj = (value: string) =>
  digitsOnly(value)
    .slice(0, 14)
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');

const toMaskedPhone = (value: string) => {
  const digits = digitsOnly(value).slice(0, 11);
  if (digits.length <= 10) {
    return digits
      .replace(/^(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{4})(\d)/, '$1-$2');
  }
  return digits
    .replace(/^(\d{2})(\d)/, '($1) $2')
    .replace(/(\d{5})(\d)/, '$1-$2');
};

const validateCpf = (value: string) => {
  const cpf = digitsOnly(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const calc = (slice: number) => {
    const sum = cpf
      .slice(0, slice)
      .split('')
      .reduce((acc, digit, index) => acc + Number(digit) * (slice + 1 - index), 0);
    const mod = (sum * 10) % 11;
    return mod === 10 ? 0 : mod;
  };
  return calc(9) === Number(cpf[9]) && calc(10) === Number(cpf[10]);
};

const validateCnpj = (value: string) => {
  const cnpj = digitsOnly(value);
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
  const calcDigit = (base: string, factors: number[]) => {
    const sum = base
      .split('')
      .reduce((acc, digit, idx) => acc + Number(digit) * factors[idx], 0);
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  const d1 = calcDigit(cnpj.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = calcDigit(cnpj.slice(0, 12) + d1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return d1 === Number(cnpj[12]) && d2 === Number(cnpj[13]);
};

const validatePhone = (value: string) => {
  const digits = digitsOnly(value);
  if (digits.startsWith('55')) return false;
  return digits.length === 10 || digits.length === 11;
};

const validateEmail = (value: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((value || '').trim());

const validateRandom = (value: string) => {
  const clean = (value || '').trim();
  if (!clean || /\s/.test(clean)) return false;
  return /^[a-fA-F0-9-]{32,64}$/.test(clean);
};

export const getPixPlaceholder = (type: PixKeyType) => {
  switch (type) {
    case 'cpf':
      return '000.000.000-00';
    case 'cnpj':
      return '00.000.000/0000-00';
    case 'phone':
      return '(00) 00000-0000';
    case 'email':
      return 'exemplo@dominio.com';
    default:
      return 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx';
  }
};

export const maskPixInput = (type: PixKeyType, value: string) => {
  if (type === 'cpf') return toMaskedCpf(value);
  if (type === 'cnpj') return toMaskedCnpj(value);
  if (type === 'phone') return toMaskedPhone(value);
  return value;
};

export const normalizePixValue = (type: PixKeyType, value: string) => {
  const raw = (value || '').trim();
  if (type === 'cpf' || type === 'cnpj' || type === 'phone') return digitsOnly(raw);
  if (type === 'email') return raw.toLowerCase();
  return raw;
};

export const validatePixValue = (type: PixKeyType, value: string) => {
  if (type === 'cpf') return validateCpf(value);
  if (type === 'cnpj') return validateCnpj(value);
  if (type === 'phone') return validatePhone(value);
  if (type === 'email') return validateEmail(value);
  return validateRandom(value);
};


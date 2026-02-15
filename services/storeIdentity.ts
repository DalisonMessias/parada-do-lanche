export const DEFAULT_STORE_NAME = 'UaiTech';

export const normalizeStoreName = (value?: string | null) => {
  const clean = String(value || '').trim();
  return clean || DEFAULT_STORE_NAME;
};

export const getStoreInitials = (value?: string | null) => {
  const normalized = normalizeStoreName(value);
  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'PL';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
};

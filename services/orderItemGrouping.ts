type GroupableItem = {
  id?: string | null;
  name_snapshot?: string | null;
  unit_price_cents?: number | null;
  qty?: number | null;
  note?: string | null;
};

const normalizeSpaces = (value: string) => value.replace(/\s+/g, ' ').trim();

export const normalizeItemNote = (note?: string | null) =>
  (note || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => normalizeSpaces(line))
    .filter(Boolean)
    .join('\n');

export const buildLineItemKey = ({
  name_snapshot,
  unit_price_cents,
  note,
}: {
  name_snapshot?: string | null;
  unit_price_cents?: number | null;
  note?: string | null;
}) => {
  const normalizedName = normalizeSpaces(name_snapshot || '').toLowerCase();
  const normalizedUnitPrice = Math.max(0, Number(unit_price_cents || 0));
  const normalizedNote = normalizeItemNote(note);
  return `${normalizedName}::${normalizedUnitPrice}::${normalizedNote}`;
};

export const groupOrderItems = <T extends GroupableItem>(items: T[]) => {
  const grouped: T[] = [];
  const indexByKey = new Map<string, number>();

  for (const item of items || []) {
    const qty = Math.max(0, Number(item.qty || 0));
    if (qty <= 0) continue;

    const key = buildLineItemKey(item);
    const existingIndex = indexByKey.get(key);
    const normalizedNote = normalizeItemNote(item.note);

    if (existingIndex == null) {
      grouped.push({
        ...item,
        qty,
        note: normalizedNote || null,
      } as T);
      indexByKey.set(key, grouped.length - 1);
      continue;
    }

    const current = grouped[existingIndex];
    grouped[existingIndex] = {
      ...current,
      qty: Math.max(0, Number(current.qty || 0)) + qty,
    } as T;
  }

  return grouped;
};

import { describe, expect, it } from 'vitest';
import { buildLineItemKey, groupOrderItems, normalizeItemNote } from './orderItemGrouping';

describe('normalizeItemNote', () => {
  it('normalizes spaces and empty lines', () => {
    const note = '  sem   cebola  \r\n\r\n  bem  passado ';
    expect(normalizeItemNote(note)).toBe('sem cebola\nbem passado');
  });
});

describe('buildLineItemKey', () => {
  it('builds stable keys with normalized name, price and note', () => {
    const keyA = buildLineItemKey({
      name_snapshot: ' X-Burger ',
      unit_price_cents: 2500,
      note: ' sem  cebola ',
    });
    const keyB = buildLineItemKey({
      name_snapshot: 'x-burger',
      unit_price_cents: 2500,
      note: 'sem cebola',
    });

    expect(keyA).toBe(keyB);
  });
});

describe('groupOrderItems', () => {
  it('groups equal items by key and sums qty', () => {
    const grouped = groupOrderItems([
      { id: '1', name_snapshot: 'X-Burger', unit_price_cents: 2500, qty: 1, note: 'sem cebola' },
      { id: '2', name_snapshot: 'x-burger', unit_price_cents: 2500, qty: 2, note: ' sem  cebola ' },
      { id: '3', name_snapshot: 'X-Bacon', unit_price_cents: 3000, qty: 1, note: null },
    ]);

    expect(grouped).toHaveLength(2);
    expect(grouped[0].name_snapshot).toBe('X-Burger');
    expect(grouped[0].qty).toBe(3);
    expect(grouped[0].note).toBe('sem cebola');
    expect(grouped[1].name_snapshot).toBe('X-Bacon');
    expect(grouped[1].qty).toBe(1);
    expect(grouped[1].note).toBeNull();
  });

  it('ignores zero or negative qty items', () => {
    const grouped = groupOrderItems([
      { id: '1', name_snapshot: 'Refrigerante', unit_price_cents: 700, qty: 0, note: '' },
      { id: '2', name_snapshot: 'Suco', unit_price_cents: 900, qty: -3, note: '' },
      { id: '3', name_snapshot: 'Agua', unit_price_cents: 500, qty: 1, note: '' },
    ]);

    expect(grouped).toHaveLength(1);
    expect(grouped[0].name_snapshot).toBe('Agua');
    expect(grouped[0].qty).toBe(1);
  });
});

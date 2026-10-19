import Decimal from 'decimal.js';
import type { BagGroup, Basis, Ingredient, Batch } from './types';
Decimal.set({ precision: 32, rounding: Decimal.ROUND_HALF_UP });
export const D = (n: Decimal.Value) => new Decimal(n);
export function positive(n: Decimal.Value, allowZero = true) {
  const value = D(n);
  if (!value.isFinite() || (allowZero ? value.lt(0) : value.lte(0))) throw new Error('Enter a valid non-negative quantity');
  return value;
}
export function sum(values: Decimal.Value[]) { return values.reduce<Decimal>((s, n) => s.plus(n), D(0)); }
export function weight(n: Decimal.Value) { return D(n).toFixed(3); }
export function bagsTotal(groups: BagGroup[]) {
  const serials = new Set<string>();
  let count = 0;
  const values = groups.map(g => {
    if (!Number.isSafeInteger(g.count) || g.count < 1) throw new Error('Bag count must be a positive whole number');
    if (g.serial) { if (serials.has(g.serial)) throw new Error('Duplicate bag serial number'); serials.add(g.serial); }
    const net = positive(g.weight).minus(g.mode === 'gross' ? positive(g.tare) : 0);
    if (net.lt(0)) throw new Error('Tare cannot exceed gross weight');
    count += g.count;
    return net.times(g.count);
  });
  return { count, net: weight(sum(values)), tonnes: sum(values).div(1000).toFixed(6) };
}
export function reconcile(input: Decimal.Value, usable: Decimal.Value, scrap: Decimal.Value, loss: Decimal.Value, hours: Decimal.Value = 0) {
  const mass = positive(input); const output = positive(usable); const accounted = output.plus(positive(scrap)).plus(positive(loss));
  return { variance: weight(mass.minus(accounted)), yield: mass.isZero() ? null : output.div(mass).times(100).toFixed(2), kgHour: D(hours).lte(0) ? null : output.div(hours).toFixed(3) };
}
export function productiveHours(start: string | null, end: string | null, downtime: number) {
  if (!start || !end) return D(0);
  const minutes = D(new Date(end).getTime() - new Date(start).getTime()).div(60000);
  if (minutes.lt(0) || downtime < 0 || minutes.lt(downtime)) throw new Error('Actual end time and downtime must fit the running period');
  return minutes.minus(downtime).div(60);
}
export function batchMath(b: Pick<Batch, 'inputs' | 'outputs' | 'loss_kg' | 'started_at' | 'ended_at' | 'downtime_minutes'>) {
  return reconcile(sum(b.inputs.map(i => i.quantity)), sum(b.outputs.filter(o => o.kind === 'usable').map(o => o.quantity)), sum(b.outputs.filter(o => o.kind !== 'usable').map(o => o.quantity)), b.loss_kg, productiveHours(b.started_at, b.ended_at, b.downtime_minutes));
}
export function scaleRecipe(ingredients: Ingredient[], basis: Basis, baseQuantity: string, target: string, targetMode: 'total' | 'base' = 'total') {
  positive(target, false); positive(baseQuantity, false);
  if (!ingredients.length) throw new Error('Add at least one ingredient');
  const amounts = ingredients.map(i => {
    positive(i.amount, false);
    if (basis === 'total_percent' && i.unit !== '%') throw new Error('Total percentage recipes require percentage units');
    if (basis !== 'total_percent' && i.unit === '%') throw new Error('Use kg or g for quantity recipes');
    return D(i.amount).div(i.unit === 'g' ? 1000 : 1);
  });
  const total = sum(amounts);
  if (basis === 'total_percent' && !total.eq(100)) throw new Error('Percentages of total mix must equal 100%');
  if (basis === 'per_100' && !total.eq(100)) throw new Error('Ingredients must total 100 kg');
  if (basis === 'per_1000' && !total.eq(1000)) throw new Error('Ingredients must total 1,000 kg');
  const baseMass = sum(amounts.filter((_, i) => ingredients[i].is_base));
  if (basis === 'base_resin' && (baseMass.isZero() || !baseMass.eq(baseQuantity))) throw new Error('Base ingredients must sum to the defined base resin quantity');
  const divisor = basis === 'base_resin' && targetMode === 'base' ? baseMass : total;
  const scaled = amounts.map(n => n.div(divisor).times(target));
  return { ingredients: ingredients.map((i, index) => ({ ...i, kg: scaled[index].toFixed(6), g: scaled[index].times(1000).toFixed(3) })), total: sum(scaled).toFixed(6), base: sum(scaled.filter((_, i) => ingredients[i].is_base)).toFixed(6), roundingDifference: sum(scaled.map(n => n.toDecimalPlaces(3))).minus(sum(scaled)).toFixed(6) };
}
export function saleTotal(quantity: string, rate: string, tax: string, transport: string, discount: string) {
  const taxable = positive(quantity).times(positive(rate));
  const taxes = taxable.times(positive(tax)).div(100);
  const total = taxable.plus(taxes).plus(positive(transport)).minus(positive(discount));
  if (total.lt(0)) throw new Error('Discount exceeds total');
  return { taxable: taxable.toFixed(2), taxes: taxes.toFixed(2), total: total.toFixed(2) };
}

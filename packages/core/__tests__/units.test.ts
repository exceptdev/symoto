import { describe, it, expect } from 'vitest';
import {
  unit,
  sameDimension,
  convertValue,
  composeMul,
  composeDiv,
  DimensionMismatch,
} from '../src/quantity/units.js';

describe('units', () => {
  it('unit() returns a frozen SymUnit and throws on an unknown unit', () => {
    const u = unit('MWh');
    expect(u.canonical).toBe('MWh');
    expect(typeof u.dimension).toBe('string');
    expect(Object.isFrozen(u)).toBe(true);
    expect(() => unit('not-a-unit')).toThrow();
  });

  it('sameDimension is true within a dimension and false across', () => {
    expect(sameDimension(unit('MWh'), unit('kWh'))).toBe(true);
    expect(sameDimension(unit('MWh'), unit('m^2'))).toBe(false);
  });

  it('count units person and dwelling are distinct dimensions', () => {
    expect(sameDimension(unit('person'), unit('dwelling'))).toBe(false);
  });

  it('convertValue converts within a dimension and throws across', () => {
    expect(convertValue(1, unit('MWh'), unit('kWh'))).toBeCloseTo(1000, 9);
    expect(() => convertValue(1, unit('MWh'), unit('m^2'))).toThrow(DimensionMismatch);
  });

  it('composeMul and composeDiv compose dimensions', () => {
    const area = composeMul(unit('dwelling'), unit('m^2/dwelling'));
    expect(sameDimension(area, unit('m^2'))).toBe(true);
    const intensity = composeDiv(unit('MWh'), unit('person'));
    expect(sameDimension(intensity, unit('MWh'))).toBe(false);
  });
});

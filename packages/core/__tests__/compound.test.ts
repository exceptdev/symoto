import { describe, it, expect } from 'vitest';
import {
  q,
  unit,
  input,
  compound,
  componentByRole,
  type Boundary,
  type CompoundComponent,
} from '@symoto/core';

// PROV-02: the compound() builder is honest by default. It constructs only when the net is exposed
// alongside its gross components, and it throws on a lone netted headline (or an empty component list).

const B: Boundary = { accounting: 'territorial', basis: 'absolute', temporal: 'flow' };
const t = unit('t');

const grossIn = q(166_176.45, t, B, input('grossEmissions'));
const grossOut = q(8_395.86, t, B, input('sequestration'));
const net = q(166_176.45 - 8_395.86, t, B, input('net'));

describe('compound() honest-by-default guard (PROV-02)', () => {
  it('constructs with gross-in, gross-out, and a net, preserving values exactly', () => {
    const components: CompoundComponent[] = [
      { role: 'gross-in', key: 'gross', quantity: grossIn },
      { role: 'gross-out', key: 'seq', quantity: grossOut },
      { role: 'net', key: 'net', quantity: net },
    ];
    const c = compound('carbon', net, components);
    expect(c.key).toBe('carbon');
    expect(c.net.value).toBe(net.value);
    expect(componentByRole(c, 'gross-in')?.quantity.value).toBe(grossIn.value);
    expect(componentByRole(c, 'gross-out')?.quantity.value).toBe(grossOut.value);
    // The result is frozen (immutable).
    expect(Object.isFrozen(c)).toBe(true);
  });

  it('throws on a lone net (only net-role components)', () => {
    expect(() =>
      compound('carbon', net, [{ role: 'net', key: 'net', quantity: net }]),
    ).toThrow(/lone net/i);
  });

  it('throws on an empty component list', () => {
    expect(() => compound('carbon', net, [])).toThrow(/lone net/i);
  });

  it('constructs when at least one generic component is present', () => {
    const c = compound('balance', net, [
      { role: 'component', key: 'part', quantity: grossIn },
      { role: 'net', key: 'net', quantity: net },
    ]);
    expect(componentByRole(c, 'component')?.quantity.value).toBe(grossIn.value);
  });
});

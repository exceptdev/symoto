import { describe, it, expect } from 'vitest';
import { flagInvariance, type LocaleDescriptor } from '../src/locale/invariance.js';

const LOCALES = ['NL', 'VN', 'BR'] as const;

// A descriptor that returns the same value for every locale unless a per-locale map is supplied.
function descriptor(
  id: string,
  byLocale: Record<string, number | null>,
  localeInvariant?: boolean,
): LocaleDescriptor {
  return {
    id,
    localeInvariant,
    reason: localeInvariant ? 'declared global for this test' : undefined,
    resolve: (locale) => byLocale[locale] ?? null,
  };
}

describe('flagInvariance (LOC-02 mechanism)', () => {
  it('flags a non-invariant descriptor constant across all locales', () => {
    const d = descriptor('demand.electricity', { NL: 4200, VN: 4200, BR: 4200 });
    const flags = flagInvariance([d], LOCALES);
    expect(flags).toHaveLength(1);
    expect(flags[0]?.id).toBe('demand.electricity');
    expect(flags[0]?.value).toBe(4200);
    expect(flags[0]?.locales).toEqual(LOCALES);
    expect(flags[0]?.message.length).toBeGreaterThan(0);
    expect(flags[0]?.message).toContain('demand.electricity');
  });

  it('never flags a descriptor declared localeInvariant: true, even when constant', () => {
    const d = descriptor('physics.pvEfficiency', { NL: 0.2, VN: 0.2, BR: 0.2 }, true);
    expect(flagInvariance([d], LOCALES)).toEqual([]);
  });

  it('never flags a descriptor that resolves to different values across locales', () => {
    const d = descriptor('energy.pvYield', { NL: 875, VN: 1450, BR: 1600 });
    expect(flagInvariance([d], LOCALES)).toEqual([]);
  });

  it('does not flag and does not throw when a descriptor resolves null for some locale', () => {
    const d = descriptor('partial.coefficient', { NL: 100, VN: 100, BR: null });
    expect(() => flagInvariance([d], LOCALES)).not.toThrow();
    expect(flagInvariance([d], LOCALES)).toEqual([]);
  });

  it('returns an empty array for an empty descriptor list', () => {
    expect(flagInvariance([], LOCALES)).toEqual([]);
  });

  it('flags only the constant non-invariant entries in a mixed set', () => {
    const set: LocaleDescriptor[] = [
      descriptor('flagged.a', { NL: 1, VN: 1, BR: 1 }),
      descriptor('silenced.b', { NL: 2, VN: 2, BR: 2 }, true),
      descriptor('varying.c', { NL: 3, VN: 4, BR: 5 }),
      descriptor('flagged.d', { NL: 9, VN: 9, BR: 9 }),
    ];
    const ids = new Set(flagInvariance(set, LOCALES).map((f) => f.id));
    expect(ids).toEqual(new Set(['flagged.a', 'flagged.d']));
  });
});

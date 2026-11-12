import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import {
  assertUnitConversionCanBeAdded,
  resolveUnitConversionFactor,
} from './unit-conversion';

describe('unit conversion', () => {
  it('converts only within built-in measurement families by default', () => {
    expect(resolveUnitConversionFactor('kg', 'g', [])?.toString()).toBe('1000');
    expect(resolveUnitConversionFactor('L', 'ml', [])?.toString()).toBe('1000');
    expect(resolveUnitConversionFactor('kg', 'ml', [])).toBeNull();
  });

  it('supports tenant-configured custom and cross-family factors', () => {
    const rules = [
      {
        fromUnit: 'scoop',
        toUnit: 'g',
        factor: new Prisma.Decimal(12.5),
      },
      {
        fromUnit: 'g',
        toUnit: 'ml',
        factor: new Prisma.Decimal(0.9),
      },
    ];

    expect(resolveUnitConversionFactor('scoop', 'ml', rules)?.toString()).toBe(
      '11.25',
    );
    expect(
      resolveUnitConversionFactor('ml', 'scoop', rules)?.toNumber(),
    ).toBeCloseTo(1 / 11.25, 12);
  });

  it('rejects duplicate or conflicting conversion paths', () => {
    const rules = [
      { fromUnit: 'box', toUnit: 'piece', factor: new Prisma.Decimal(12) },
    ];
    expect(() => assertUnitConversionCanBeAdded('piece', 'box', rules)).toThrow(
      new BadRequestException(
        'A conversion path already exists for these units; conflicting or duplicate factors are not allowed',
      ),
    );
  });
});

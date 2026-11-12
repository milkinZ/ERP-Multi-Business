import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export type UnitConversionRule = {
  fromUnit: string;
  toUnit: string;
  factor: Prisma.Decimal | number | string;
};

const STANDARD_UNITS: Record<string, { family: string; scale: number }> = {
  mg: { family: 'mass', scale: 0.001 },
  g: { family: 'mass', scale: 1 },
  kg: { family: 'mass', scale: 1000 },
  ml: { family: 'volume', scale: 1 },
  l: { family: 'volume', scale: 1000 },
  ea: { family: 'count', scale: 1 },
  each: { family: 'count', scale: 1 },
  pc: { family: 'count', scale: 1 },
  pcs: { family: 'count', scale: 1 },
};

export function normalizeUnit(unit: string) {
  return unit.trim().toLocaleLowerCase('en-US');
}

export function resolveUnitConversionFactor(
  fromUnit: string,
  toUnit: string,
  rules: UnitConversionRule[],
): Prisma.Decimal | null {
  const from = normalizeUnit(fromUnit);
  const to = normalizeUnit(toUnit);
  if (!from || !to) return null;
  if (from === to) return new Prisma.Decimal(1);

  const graph = new Map<
    string,
    Array<{ unit: string; factor: Prisma.Decimal }>
  >();
  const addEdge = (source: string, target: string, factor: Prisma.Decimal) => {
    const edges = graph.get(source) ?? [];
    edges.push({ unit: target, factor });
    graph.set(source, edges);
  };

  const familyUnits = new Map<string, Array<[string, number]>>();
  for (const [unit, definition] of Object.entries(STANDARD_UNITS)) {
    const units = familyUnits.get(definition.family) ?? [];
    units.push([unit, definition.scale]);
    familyUnits.set(definition.family, units);
  }
  for (const units of familyUnits.values()) {
    for (const [source, sourceScale] of units) {
      for (const [target, targetScale] of units) {
        if (source !== target) {
          addEdge(
            source,
            target,
            new Prisma.Decimal(sourceScale).div(targetScale),
          );
        }
      }
    }
  }

  for (const rule of rules) {
    const source = normalizeUnit(rule.fromUnit);
    const target = normalizeUnit(rule.toUnit);
    const factor = new Prisma.Decimal(rule.factor.toString());
    if (source === target || !factor.isFinite() || factor.lte(0)) {
      throw new BadRequestException('Invalid unit conversion rule');
    }
    addEdge(source, target, factor);
    addEdge(target, source, new Prisma.Decimal(1).div(factor));
  }

  const pending: Array<{ unit: string; factor: Prisma.Decimal }> = [
    { unit: from, factor: new Prisma.Decimal(1) },
  ];
  const visited = new Set([from]);
  while (pending.length) {
    const current = pending.shift()!;
    for (const edge of graph.get(current.unit) ?? []) {
      if (visited.has(edge.unit)) continue;
      const factor = current.factor.mul(edge.factor);
      if (edge.unit === to) return factor;
      visited.add(edge.unit);
      pending.push({ unit: edge.unit, factor });
    }
  }
  return null;
}

export function assertUnitConversionCanBeAdded(
  fromUnit: string,
  toUnit: string,
  rules: UnitConversionRule[],
) {
  if (
    resolveUnitConversionFactor(fromUnit, toUnit, rules) !== null ||
    resolveUnitConversionFactor(toUnit, fromUnit, rules) !== null
  ) {
    throw new BadRequestException(
      'A conversion path already exists for these units; conflicting or duplicate factors are not allowed',
    );
  }
}

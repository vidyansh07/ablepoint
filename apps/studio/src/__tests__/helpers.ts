/* eslint-disable @typescript-eslint/no-explicit-any */
import { schemaTypes } from '../schemas';

type Level = 'error' | 'warning';
interface Custom {
  fn: (value: any, context: any) => unknown;
  level: Level;
}

/** A minimal stand-in for Sanity's Rule that records `custom` validators and their level. */
export function makeRule() {
  const customs: Custom[] = [];
  const rule: any = new Proxy(
    {},
    {
      get: (_t, prop) => {
        if (prop === 'custom') return (fn: Custom['fn']) => (customs.push({ fn, level: 'error' }), rule);
        if (prop === 'warning') return () => (customs.length > 0 && (customs[customs.length - 1]!.level = 'warning'), rule);
        return () => rule;
      },
    },
  );
  return { rule, customs };
}

export function findType(name: string): any {
  const t = (schemaTypes as any[]).find((s) => s.name === name);
  if (!t) throw new Error(`schema type ${name} not found`);
  return t;
}

export function findField(typeName: string, fieldName: string): any {
  const f = findType(typeName).fields.find((x: any) => x.name === fieldName);
  if (!f) throw new Error(`field ${typeName}.${fieldName} not found`);
  return f;
}

/** Run a field's validation with a value and context; returns messages by level. */
export function runValidation(field: any, value: unknown, context: Record<string, unknown> = {}) {
  const { rule, customs } = makeRule();
  if (typeof field.validation === 'function') field.validation(rule);
  const errors: string[] = [];
  const warnings: string[] = [];
  for (const c of customs) {
    const r = c.fn(value, context);
    if (r === true || r === undefined) continue;
    const msg = typeof r === 'string' ? r : JSON.stringify(r);
    (c.level === 'warning' ? warnings : errors).push(msg);
  }
  return { errors, warnings };
}

export function allFieldNames(type: any, seen = new Set<string>()): string[] {
  const names: string[] = [];
  const walk = (fields: any[] | undefined) => {
    for (const f of fields ?? []) {
      names.push(f.name);
      walk(f.fields);
      for (const m of f.of ?? []) walk(m.fields);
    }
  };
  walk(type.fields);
  return names;
}

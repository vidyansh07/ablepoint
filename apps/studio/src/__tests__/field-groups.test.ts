/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest';
import { schemaTypes } from '../schemas';

/**
 * Regression test for a bug found only by running the Studio (4 Nov 2026): block types such as `heroBlock` used helpers that
 * default a field to `group: 'content'`, but object types have no field groups, so Sanity refused to load the schema
 * ("Field group 'content' is not defined in schema for type 'heroBlock'"). The fake-Rule unit tests could not see this.
 * Rule: every field that names a group must sit in a type (document, object or inline array object) that declares it.
 */
function problems(def: any, path: string): string[] {
  const out: string[] = [];
  const declared = new Set<string>((def.groups ?? []).map((g: any) => g.name));
  for (const f of def.fields ?? []) {
    if (f.group !== undefined && !declared.has(f.group)) out.push(`${path}.${f.name}: group "${f.group}" is not declared on ${path}`);
    for (const m of f.of ?? []) if (m.fields) out.push(...problems(m, `${path}.${f.name}[${m.name ?? m.type}]`));
    if (f.fields) out.push(...problems(f, `${path}.${f.name}`));
  }
  return out;
}

describe('field groups', () => {
  it('every field that names a group is in a type that declares that group', () => {
    const all = (schemaTypes as any[]).flatMap((t) => problems(t, t.name));
    expect(all).toEqual([]);
  });
  it('page-builder blocks and other object types declare no groups and use none', () => {
    for (const t of (schemaTypes as any[]).filter((x) => x.type === 'object')) {
      expect(t.groups ?? [], t.name).toEqual([]);
      for (const f of t.fields) expect(f.group, `${t.name}.${f.name}`).toBeUndefined();
    }
  });
});

// v1.22.1 (D-086): writes changed numbers into a JSON file's text in place, so a content file keeps
// its layout, key order and comments-in-strings exactly (JSON.stringify would expand every inline
// object and array the way Prettier never collapses again). Pure; used by tools/sizes-apply.ts.

/** A parsed value and where its text is. */
type Node =
  | { kind: 'number'; start: number; end: number; value: number }
  | { kind: 'object'; entries: Map<string, Node> }
  | { kind: 'array'; items: Node[] }
  | { kind: 'other' };

function parse(text: string): Node {
  let i = 0;
  const ws = (): void => {
    while (i < text.length && /\s/.test(text[i] ?? '')) i++;
  };
  const str = (): string => {
    const start = i;
    i++;
    while (i < text.length && text[i] !== '"') i += text[i] === '\\' ? 2 : 1;
    i++;
    return JSON.parse(text.slice(start, i)) as string;
  };
  const value = (): Node => {
    ws();
    const c = text[i];
    if (c === '{') {
      i++;
      const entries = new Map<string, Node>();
      ws();
      if (text[i] === '}') {
        i++;
        return { kind: 'object', entries };
      }
      for (;;) {
        ws();
        const key = str();
        ws();
        i++; // ':'
        entries.set(key, value());
        ws();
        if (text[i++] === '}') return { kind: 'object', entries };
      }
    }
    if (c === '[') {
      i++;
      const items: Node[] = [];
      ws();
      if (text[i] === ']') {
        i++;
        return { kind: 'array', items };
      }
      for (;;) {
        items.push(value());
        ws();
        if (text[i++] === ']') return { kind: 'array', items };
      }
    }
    if (c === '"') {
      str();
      return { kind: 'other' };
    }
    const m = /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(text.slice(i));
    if (m !== null) {
      const start = i;
      i += m[0].length;
      return { kind: 'number', start, end: i, value: Number(m[0]) };
    }
    const lit = /^(true|false|null)/.exec(text.slice(i));
    if (lit === null) throw new Error(`not JSON at ${String(i)}`);
    i += lit[0].length;
    return { kind: 'other' };
  };
  return value();
}

/**
 * `text` (a JSON file) with every number that differs in `next` (the same document with some
 * numbers changed) written in place. Throws when `next` differs in anything but numbers.
 */
export function writeNumbers(text: string, next: unknown): string {
  const edits: { start: number; end: number; text: string }[] = [];
  const walk = (n: Node, v: unknown, at: string): void => {
    if (n.kind === 'number') {
      if (typeof v !== 'number') throw new Error(`${at}: not a number now`);
      if (v !== n.value) edits.push({ start: n.start, end: n.end, text: JSON.stringify(v) });
      return;
    }
    if (n.kind === 'object') {
      if (typeof v !== 'object' || v === null || Array.isArray(v))
        throw new Error(`${at}: not an object now`);
      const o = v as Record<string, unknown>;
      if (Object.keys(o).length !== n.entries.size) throw new Error(`${at}: keys changed`);
      for (const [k, c] of n.entries) walk(c, o[k], `${at}.${k}`);
      return;
    }
    if (n.kind === 'array') {
      if (!Array.isArray(v) || v.length !== n.items.length) throw new Error(`${at}: array changed`);
      n.items.forEach((c, j) => {
        walk(c, (v as unknown[])[j], `${at}[${String(j)}]`);
      });
    }
  };
  walk(parse(text), next, '$');
  let out = text;
  for (const e of edits.sort((a, b) => b.start - a.start))
    out = out.slice(0, e.start) + e.text + out.slice(e.end);
  return out;
}

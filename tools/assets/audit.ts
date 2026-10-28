// The asset audit (M10): every manifest key with its status (final or placeholder), size and
// where it is used, plus the problems that always fail — delivered files nothing uses, keys or
// files referenced but missing, placeholder keys nothing uses. `--strict` (the launch gate) also
// fails while any key is still a placeholder. Pure: the CLI (tools/asset-audit.ts) gathers the
// inputs from disk.
import { hdBaseOf, POTJIE_LID } from '../../src/game/assets/hdProps';
import { CAN_SHEET } from '../../src/game/view/cans/canSheet';
import { NUT_SHEET } from '../../src/game/view/palms/makalaniSheet';
import { PLATE_FRAME_TEX, PLATE_TEX, RANGE_SOUNDS } from '../../src/game/range/rangeAssets';
import type { AssetIndex, BirdClip } from '../../src/game/assets/assetIndex';
import { clipFor, resolveClip } from '../../src/game/assets/birdClips';
import type { BirdMotion, BirdPhase, PlaneId } from '../../src/sim/types';
import type { AssetKind, AssetStatus } from '../../src/game/assets/AssetManifest';
import type { Catalog } from './catalog';
import { MEERKAT_SHEET, MEERKAT_SOUNDS } from '../../src/game/assets/desertAssets';
import { HALLOWEEN_SHEET, SPOOK_SOUNDS } from '../../src/game/feesdae/feesdaeAssets';

export interface AuditRow {
  readonly key: string;
  readonly kind: AssetKind;
  readonly group: string;
  readonly status: AssetStatus;
  /** Final: bytes of its delivered files. Placeholder: its drawn size (textures) or a note. */
  readonly size: string;
  readonly usedIn: readonly string[];
}

export interface AuditReport {
  readonly rows: readonly AuditRow[];
  /** Problems that fail the audit in every mode. */
  readonly problems: readonly string[];
  readonly placeholders: number;
  /** D-029: delivered but code-drawn stand-in art (`origin: "interim"`): not launch art. */
  readonly interims: number;
  readonly finals: number;
}

export interface AuditInputs {
  readonly catalog: Catalog;
  /** The delivered index, or null when nothing has been delivered. */
  readonly index: AssetIndex | null;
  /** Files under public/assets/ (paths like `assets/common/…`), excluding the index itself. */
  readonly files: readonly string[];
  /** Source files to search for key references: path → text (src/ without tests, content/). */
  readonly sources: ReadonlyMap<string, string>;
  /** TEX constant name → key (src/game/assets/AssetManifest.ts). */
  readonly tex: Readonly<Record<string, string>>;
  /** Bytes of a delivered file, or null if it is missing. */
  readonly bytesOf: (path: string) => number | null;
}

/** Files that define placeholders or the key tables: a mention there is not a use. */
const DEFINITIONS = /^src\/game\/(placeholder\/|assets\/|range\/rangeAssets\.ts$)/;

function kb(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(2)} MB`
    : `${(bytes / 1024).toFixed(1)} KB`;
}

/** Where a key is used: files that name it (or its TEX constant, gun id, creature id, sound id). */
function usages(
  key: string,
  kind: AssetKind,
  i: AuditInputs,
  texName: string | undefined,
): string[] {
  const needles: RegExp[] = [];
  const quoted = (s: string): RegExp =>
    new RegExp(`['"\`]${s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}['"\`]`);
  if (texName !== undefined) needles.push(new RegExp(`\\bTEX\\.${texName}\\b`));
  // 24 Oct update (D-037): the Skietbaan's own keys (src/game/range/rangeAssets.ts), used when
  // the range draws PLATE_TEX or plays the sound by its name.
  const rangeSound = Object.entries(RANGE_SOUNDS).find(([, k]) => k === key)?.[0];
  if (rangeSound !== undefined) needles.push(new RegExp(`playRangeSound\\([^)]*'${rangeSound}'`));
  // v1.7 (D-044): the desert keys (src/game/assets/desertAssets.ts): the sheet by its constant,
  // a sound when it is played by name or queued as a view cue.
  if (key === MEERKAT_SHEET) needles.push(/\bMEERKAT_SHEET\b/);
  // D-048: the special days' sheet by its constant, a sound when played by name.
  if (key === HALLOWEEN_SHEET) needles.push(/\bHALLOWEEN_SHEET\b/);
  // v1.8 (D-050): the tin cans' sheet by its constant (CanView, the placeholder).
  if (key === CAN_SHEET) needles.push(/\bCAN_SHEET\b/);
  // 1.9.3 (D-056): the makalani nut sheet by its constant, and the palm textures
  // (okavango/makalani_<trunk|crown>_<plane>) wherever their key builders are called.
  if (key === NUT_SHEET) needles.push(/\bNUT_SHEET\b/);
  const palm = /^okavango\/makalani_(trunk|crown)_(near|mid)$/.exec(key);
  if (palm !== null) needles.push(palm[1] === 'trunk' ? /\bpalmTrunkKey\(/ : /\bpalmCrownKey\(/);
  const spookSound = Object.entries(SPOOK_SOUNDS).find(([, k]) => k === key)?.[0];
  if (spookSound !== undefined) needles.push(new RegExp(`playSpookSound\\([^)]*'${spookSound}'`));
  const meerkatSound = Object.entries(MEERKAT_SOUNDS).find(([, k]) => k === key)?.[0];
  if (meerkatSound !== undefined) {
    needles.push(new RegExp(`playMeerkatSound\\([^)]*'${meerkatSound}'`));
    needles.push(new RegExp(`cue = '${meerkatSound}'`));
  }
  // D-051: an HD stand-in is used when a view swaps its prop over to hdKeyOf(prop.asset); the
  // potjie's loose lid when PotjieView draws POTJIE_LID.
  if (hdBaseOf(key) !== undefined)
    needles.push(key === POTJIE_LID ? /\.image\([^)]*\bPOTJIE_LID\b/ : /\bhdKeyOf\(prop\.asset\)/);
  if (key === PLATE_TEX) needles.push(/\bPLATE_TEX\b/);
  if (key === PLATE_FRAME_TEX) needles.push(/\bPLATE_FRAME_TEX\b/);
  if (kind === 'texture' && key.startsWith('gun/')) {
    // gunKey(weaponId): used when the weapon exists in content and something draws gunKey().
    needles.push(new RegExp(`"id":\\s*"${key.slice(4)}"`));
  } else if (kind === 'bird') {
    needles.push(new RegExp(`"id":\\s*"${key.split('/')[1] ?? ''}"`));
  } else if (kind === 'sound') {
    const [type, id = ''] = key.split('/');
    if (type === 'sfx') {
      needles.push(new RegExp(`this\\.play\\('${id}'`));
      // v1.1 (D-032): a gun's own sounds are named in feel.json guns.weapons.<id>.sfx.
      needles.push(
        new RegExp(`"(shot|reloadStarted|shellLoaded|reloadFinished|afterShot)":\\s*"${id}"`),
      );
    } else if (type === 'voice') {
      // v1.5 (D-041): voice/<lang>/<bark key>.
      const line = key
        .split('/')
        .slice(2)
        .join('/')
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // A secret's bark (biome files), or a line of one of Oupa's triggers (feel.json barks,
      // v1.0.1 D-028 §3) — a "lines" array, not just any quote of the key (i18n files have those).
      needles.push(new RegExp(`"barkKey":\\s*"${line}"`));
      needles.push(new RegExp(`"lines":\\s*\\[[^\\]]*"${line}"`));
      // D-048: a special day's own lines (feesdae.json barks).
      needles.push(new RegExp(`"(start|bat|owl|lanternsOut|end)":\\s*"${line}"`));
    } else needles.push(quoted(key));
    // Music, ambience and voice keys are built at runtime: the player must call the key helper.
    const helper =
      type === 'music'
        ? 'musicKey'
        : type === 'amb'
          ? 'ambienceKey'
          : type === 'voice'
            ? 'voiceKey'
            : null;
    if (helper !== null) {
      const plays = [...i.sources].some(
        ([p, t]) => !DEFINITIONS.test(p) && new RegExp(`\\b${helper}\\(`).test(t),
      );
      if (!plays) return [];
      if (type !== 'voice') return ['src/game/audio/AudioDirector.ts'];
    }
  } else if (kind === 'texture' && key.startsWith('ui/ammo/')) {
    // v1.1 (D-032): ammo textures are named by their type in feel.json guns; used when a gun's
    // ammo display uses that type (the HUD builds the key with ammoKeys()).
    const type = key.slice('ui/ammo/'.length).replace(/_spent$/, '');
    needles.push(new RegExp(`"type":\\s*"${type}"`));
  } else if (kind === 'texture' && key.startsWith('fauna/')) {
    // D-054: far-animal herd sheets, placed by name from src/game/view/faunaHerds.ts.
    needles.push(quoted(key));
  } else if (kind === 'texture' && key.startsWith('fruit/')) {
    // v1.7c (D-047): a biome's fruit sheet, named from the biome id by FruitView.
    needles.push(/fruitSheetKey\(biome\.id\)/);
  } else if (texName === undefined) {
    // Props and layers are named by their asset id in the biome files.
    needles.push(new RegExp(`"asset":\\s*"${key}"`));
  }
  const out: string[] = [];
  for (const [path, text] of i.sources) {
    if (DEFINITIONS.test(path)) continue;
    if (needles.some((re) => re.test(text))) out.push(path);
  }
  if (kind === 'texture' && key.startsWith('gun/') && out.length > 0) {
    const draws = [...i.sources].some(([p, t]) => !DEFINITIONS.test(p) && /\bgunKey\(/.test(t));
    if (!draws) return [];
  }
  return out.sort();
}

/** The files a delivered key brings, or null if the index has no entry for it. */
function deliveredFiles(key: string, kind: AssetKind, index: AssetIndex | null): string[] | null {
  if (index === null) return null;
  if (kind === 'texture') {
    // An animated gun rig (D-029) delivers gun/<id> too, and wins over a single image.
    const gun = key.startsWith('gun/') ? index.guns[key.slice(4)] : undefined;
    if (gun !== undefined)
      return [gun.x1, gun.x2, gun.hd].flatMap((a) =>
        (a?.pages ?? []).flatMap((p) => [p.image.path, p.data.path]),
      );
    const e = index.images[key];
    // D-053: the HD twin (group `<group>-hd`) is delivered with the key too.
    return e === undefined ? null : [e.file.path, ...(e.hd === undefined ? [] : [e.hd.file.path])];
  }
  if (kind === 'layer') {
    const e = index.layers[key];
    return e === undefined ? null : [...e.tiles, ...(e.hd?.tiles ?? [])].map((t) => t.path);
  }
  if (kind === 'bird') {
    const [, creature = '', plane = ''] = key.split('/');
    const e = index.birds[creature]?.[plane as 'near' | 'mid' | 'far'];
    if (e === undefined) return null;
    return [e.x1, e.x2, e.hd].flatMap((a) =>
      (a?.pages ?? []).flatMap((p) => [p.image.path, p.data.path]),
    );
  }
  const e = index.audio[key];
  return e === undefined ? null : [e.ogg.path, e.mp3.path];
}

/** Who made a delivered key (D-029): `interim` art comes from tools/art/; absent = final. */
function deliveredOrigin(
  key: string,
  kind: AssetKind,
  index: AssetIndex | null,
): string | undefined {
  if (index === null) return undefined;
  if (kind === 'texture')
    return (
      (key.startsWith('gun/') ? index.guns[key.slice(4)] : undefined)?.origin ??
      index.images[key]?.origin
    );
  if (kind === 'layer') return index.layers[key]?.origin;
  if (kind === 'bird') {
    const [, creature = '', plane = ''] = key.split('/');
    return index.birds[creature]?.[plane as 'near' | 'mid' | 'far']?.origin;
  }
  return index.audio[key]?.origin;
}

const MOTIONS: readonly BirdMotion[] = ['flyover', 'popup', 'flock', 'perch', 'boss', 'hop'];
const PHASES: readonly BirdPhase[] = [
  'fly',
  'rise',
  'stare',
  'duck',
  'walk',
  'alert',
  'run',
  'launch',
  'flap',
  'glide',
  'land',
  'perch',
  'hidden',
  'peek',
  'hop',
];

/**
 * Every clip the game can ask a bird for on a plane: clipFor over every motion and phase (the
 * near plane holds only pop-ups). Both foraging spells (walk, peck) are covered.
 */
export function clipsNeeded(plane: PlaneId): BirdClip[] {
  const motions = plane === 'near' ? (['popup'] as const) : MOTIONS;
  const out = new Set<BirdClip>();
  for (const m of motions)
    for (const p of PHASES) for (const spell of [0, 1, 2]) out.add(clipFor(m, p, 0, spell, 1));
  return [...out].sort();
}

export function audit(i: AuditInputs): AuditReport {
  const problems: string[] = [];
  const texByKey = new Map(Object.entries(i.tex).map(([name, key]) => [key, name]));
  const rows: AuditRow[] = [];
  const claimed = new Set<string>();
  for (const e of [...i.catalog.entries.values()].sort((a, b) => (a.key < b.key ? -1 : 1))) {
    const files = deliveredFiles(e.key, e.kind, i.index);
    let status: AssetStatus = 'placeholder';
    let size: string;
    if (files !== null) {
      const sizes = files.map((f) => {
        claimed.add(f);
        const b = i.bytesOf(f);
        if (b === null)
          problems.push(`missing file: ${e.key} → ${f} is in the index but not on disk`);
        return b ?? 0;
      });
      const whole = sizes.every((_, n) => i.bytesOf(files[n] ?? '') !== null);
      status = !whole
        ? 'placeholder'
        : deliveredOrigin(e.key, e.kind, i.index) === 'interim'
          ? 'interim'
          : 'final';
      size = kb(sizes.reduce((a, b) => a + b, 0));
    } else if (e.width !== undefined && e.height !== undefined) {
      size = `${e.width}×${e.height} drawn`;
    } else {
      size = e.kind !== 'sound' ? 'drawn' : e.key.startsWith('sfx/') ? 'synth' : 'silent';
    }
    const usedIn = usages(e.key, e.kind, i, texByKey.get(e.key));
    if (usedIn.length === 0)
      problems.push(`unused key: ${e.key} (${e.kind}) — nothing in src/ or content/ uses it`);
    rows.push({ key: e.key, kind: e.kind, group: e.group, status, size, usedIn });
  }
  // Keys the code asks for that no manifest provides.
  for (const [name, key] of Object.entries(i.tex))
    if (!i.catalog.entries.has(key))
      problems.push(`missing key: TEX.${name} = "${key}" has no manifest entry`);
  // Delivered entries for keys the game doesn't have, and files nothing points at.
  if (i.index !== null) {
    const known = (kind: AssetKind, key: string): boolean =>
      i.catalog.entries.get(key)?.kind === kind;
    for (const key of Object.keys(i.index.images))
      if (!known('texture', key))
        problems.push(`unused delivery: image "${key}" is not a manifest key`);
    for (const key of Object.keys(i.index.layers))
      if (!known('layer', key))
        problems.push(`unused delivery: layer "${key}" is not a manifest key`);
    for (const [creature, planes] of Object.entries(i.index.birds))
      for (const plane of Object.keys(planes))
        if (!known('bird', `bird/${creature}/${plane}`))
          problems.push(`unused delivery: bird "${creature}" on plane ${plane}`);
    for (const key of Object.keys(i.index.audio))
      if (!known('sound', key))
        problems.push(`unused delivery: sound "${key}" is not played by the game`);
    for (const id of Object.keys(i.index.guns))
      if (!known('texture', `gun/${id}`))
        problems.push(`unused delivery: gun "${id}" is not a manifest key`);
  }
  // A delivered bird must cover every clip the game asks of it on that plane (directly or through
  // its fallback chain); otherwise that state would fall back to placeholder frames mid-hunt.
  for (const [creature, planes] of Object.entries(i.index?.birds ?? {}))
    for (const [plane, e] of Object.entries(planes) as [
      PlaneId,
      { clips: Partial<Record<BirdClip, unknown>> },
    ][]) {
      const missing = clipsNeeded(plane).filter(
        (c) => resolveClip(c, (x) => e.clips[x] !== undefined) === null,
      );
      if (missing.length > 0)
        problems.push(
          `incomplete bird: ${creature} ${plane} has no clip (or fallback) for ${missing.join(', ')}`,
        );
    }
  for (const f of i.files)
    if (!claimed.has(f))
      problems.push(`unused file: public/${f} is not referenced by the asset index`);
  const placeholders = rows.filter((r) => r.status === 'placeholder').length;
  const interims = rows.filter((r) => r.status === 'interim').length;
  return { rows, problems, placeholders, interims, finals: rows.length - placeholders - interims };
}

const LABEL: Readonly<Record<AssetStatus, string>> = {
  final: 'FINAL      ',
  interim: 'INTERIM    ',
  placeholder: 'PLACEHOLDER',
};

/** The report as text: three groups (final, interim, placeholder), a table per kind, problems. */
export function formatAudit(r: AuditReport, strict: boolean): string {
  const lines: string[] = [];
  const kinds: AssetKind[] = ['texture', 'layer', 'bird', 'sound'];
  const groups: [AssetStatus, string][] = [
    ['final', 'FINAL — delivered human art'],
    ['interim', 'INTERIM — code-drawn stand-ins (tools/art/), to be replaced (D-029)'],
    ['placeholder', 'PLACEHOLDER — drawn at runtime'],
  ];
  for (const [status, title] of groups) {
    const inGroup = r.rows.filter((x) => x.status === status);
    if (inGroup.length === 0) continue;
    lines.push(`\n== ${title}: ${inGroup.length}`);
    for (const kind of kinds) {
      const rows = inGroup.filter((x) => x.kind === kind);
      if (rows.length === 0) continue;
      lines.push(`\n${kind}s (${rows.length}):`);
      for (const x of rows)
        lines.push(
          `  ${LABEL[x.status]} ${x.key.padEnd(30)} ${x.group.padEnd(16)} ${x.size.padEnd(16)} ${x.usedIn.join(', ')}`,
        );
    }
  }
  lines.push(
    `\n${r.rows.length} keys: ${r.finals} final, ${r.interims} interim, ${r.placeholders} placeholder.`,
  );
  if (r.problems.length > 0) {
    lines.push(`\n${r.problems.length} problem(s):`);
    for (const p of r.problems) lines.push(`  ✗ ${p}`);
  }
  if (strict && r.interims > 0)
    lines.push(`\nstrict: ${r.interims} interim key(s) remain — launch needs human art.`);
  if (strict && r.placeholders > 0)
    lines.push(`\nstrict: ${r.placeholders} placeholder(s) remain — not ready to launch.`);
  return lines.join('\n');
}

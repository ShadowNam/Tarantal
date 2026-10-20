// Cross-file reference checks for a parsed ContentBundle (Tech §4, .claude/rules/content.md).
// Pure: returns errors and warnings. Warnings cover content that arrives in later milestones
// (docs/04-BUILD-PLAN.md M0); `strict` turns them into errors (CI uses --strict from M8 on).
import { coreWidth } from '../sim/world';
import type { Biome, Charm, ContentBundle, Creature } from './schemas';

export interface CrossRefIssue {
  readonly file: string;
  readonly message: string;
}

export interface CrossRefReport {
  readonly errors: readonly CrossRefIssue[];
  readonly warnings: readonly CrossRefIssue[];
}

export interface CrossRefOptions {
  /** i18n keys known to the base language file (en.json). Missing keys are warnings. */
  readonly i18nKeys: ReadonlySet<string>;
  /** Turn every warning into an error. */
  readonly strict?: boolean;
}

/** Milestone in which each kind of deferred content arrives — used in warning text. */
const LATER = {
  biome: 'M8',
  challenge: 'M5 (Notaboek)',
  spawnEvent: 'M6',
  script: 'M6 (charm registry)',
  i18n: 'when its screen is built',
} as const;

export function checkCrossRefs(bundle: ContentBundle, options: CrossRefOptions): CrossRefReport {
  const errors: CrossRefIssue[] = [];
  const warnings: CrossRefIssue[] = [];
  const err = (file: string, message: string): void => {
    errors.push({ file, message });
  };
  const warn = (file: string, message: string): void => {
    (options.strict === true ? errors : warnings).push({ file, message });
  };

  const { scoring, birds, weapons, powerups, charms, run, modes, biomes } = bundle;

  // --- unique ids --------------------------------------------------------------------------
  checkUnique('birds.json', 'creature', birds.creatures.map((c) => c.id), err);
  checkUnique('weapons.json', 'weapon/gadget', [
    ...weapons.weapons.map((w) => w.id),
    ...weapons.gadgets.map((g) => g.id),
  ], err);
  checkUnique('powerups.json', 'power-up', powerups.powerups.map((p) => p.id), err);
  checkUnique('charms.json', 'charm', charms.charms.map((c) => c.id), err);
  checkUnique('run.json', 'season', run.seasons.map((s) => s.id), err);
  checkUnique('scoring.json', 'rank', scoring.ranks.map((r) => r.id), err);

  // --- id sets -----------------------------------------------------------------------------
  const creatures = new Map<string, Creature>(birds.creatures.map((c) => [c.id, c]));
  const weaponIds = new Set(weapons.weapons.map((w) => w.id));
  const crateWeaponIds = new Set(weapons.weapons.filter((w) => w.kind === 'crate').map((w) => w.id));
  const gadgetIds = new Set(weapons.gadgets.map((g) => g.id));
  const powerupIds = new Set(powerups.powerups.map((p) => p.id));
  const rankIds = new Set(scoring.ranks.map((r) => r.id));
  const bossRuleIds = new Set(Object.keys(run.bossRules));
  const plannedBiomeIds = new Set(run.seasons.map((s) => s.biome));
  const omenIds = new Set(run.seasons.map((s) => s.omen));
  const loadedBiomes = new Map<string, Biome>(biomes.map((b) => [b.id, b]));
  const definedEventIds = new Set(biomes.flatMap((b) => b.events.map((e) => e.id)));
  const i18n = (file: string, key: string): void => {
    if (!options.i18nKeys.has(key)) warn(file, `i18n key "${key}" is not in en.json yet (${LATER.i18n})`);
  };

  // --- birds.json --------------------------------------------------------------------------
  for (const c of birds.creatures) {
    if (c.biomes) {
      for (const b of c.biomes) {
        if (!plannedBiomeIds.has(b)) err('birds.json', `creature "${c.id}" lists unknown biome "${b}"`);
      }
    }
    if (c.kind === 'boss' && !bossRuleIds.has(c.bossRule)) {
      err('birds.json', `boss "${c.id}" uses unknown bossRule "${c.bossRule}" (run.json bossRules)`);
    }
    if (c.kind === 'helper' && !powerupIds.has(c.grants)) {
      err('birds.json', `helper "${c.id}" grants unknown power-up "${c.grants}"`);
    }
  }

  // --- weapons.json ------------------------------------------------------------------------
  for (const w of weapons.weapons) {
    if (w.kind !== 'primary') continue;
    if (w.unlock.type === 'rank' && !rankIds.has(w.unlock.id)) {
      err('weapons.json', `weapon "${w.id}" unlocks at unknown rank "${w.unlock.id}"`);
    }
    if (w.unlock.type === 'challenge') {
      warn('weapons.json', `weapon "${w.id}" unlock challenge "${w.unlock.id}" is not defined yet (${LATER.challenge})`);
    }
  }

  // --- powerups.json -----------------------------------------------------------------------
  for (const entry of powerups.crates.table) {
    if (entry.type === 'weapon') {
      if (!crateWeaponIds.has(entry.id)) {
        err('powerups.json', `crate entry "${entry.id}" is not a crate weapon in weapons.json`);
      }
    } else if (!powerupIds.has(entry.id)) {
      err('powerups.json', `crate entry "${entry.id}" is not a power-up`);
    }
  }

  // --- run.json ----------------------------------------------------------------------------
  for (const [ruleId, rule] of Object.entries(run.bossRules)) {
    i18n('run.json', rule.descriptionKey);
    if (!birds.creatures.some((c) => c.kind === 'boss' && c.bossRule === ruleId)) {
      err('run.json', `bossRule "${ruleId}" is used by no boss`);
    }
  }
  for (const s of run.seasons) {
    const boss = creatures.get(s.boss);
    if (boss?.kind !== 'boss') err('run.json', `season "${s.id}" boss "${s.boss}" is not a boss creature`);
    const biome = loadedBiomes.get(s.biome);
    if (biome === undefined) {
      warn('run.json', `season "${s.id}" biome file biomes/${s.biome}.json does not exist yet (${LATER.biome})`);
    } else {
      if (biome.season !== s.id) {
        err(`biomes/${biome.id}.json`, `season "${biome.season}" does not match run.json season "${s.id}"`);
      }
      if (biome.omen.id !== s.omen) {
        err(`biomes/${biome.id}.json`, `omen "${biome.omen.id}" does not match run.json omen "${s.omen}"`);
      }
    }
  }

  // --- biomes ------------------------------------------------------------------------------
  for (const biome of biomes) {
    const file = `biomes/${biome.id}.json`;
    if (!plannedBiomeIds.has(biome.id)) err(file, `biome "${biome.id}" is not used by any run.json season`);
    i18n(file, biome.nameKey);
    checkUnique(file, 'layer', biome.layers.map((l) => l.id), err);
    checkUnique(file, 'prop', biome.props.map((p) => p.id), err);
    const layerIds = new Set(biome.layers.map((l) => l.id));

    for (const layer of biome.layers) {
      const merge = layer.lowTierMergeWith;
      if (typeof merge === 'string' && !layerIds.has(merge)) {
        err(file, `layer "${layer.id}" merges into unknown layer "${merge}"`);
      }
    }
    const layerPlane = new Map(biome.layers.map((l) => [l.id, l.plane]));
    const propById = new Map(biome.props.map((p) => [p.id, p]));
    for (const prop of biome.props) {
      if (!layerIds.has(prop.layer)) err(file, `prop "${prop.id}" is on unknown layer "${prop.layer}"`);
      const secret = prop.secret;
      if (secret === undefined) continue;
      const parts = secret.type === 'multiHit' ? secret.parts.map((x) => x.id) : [secret.part.id];
      checkUnique(file, `prop "${prop.id}" secret part`, parts, err);
      const reward = secret.reward;
      if (reward.powerup !== undefined && !powerupIds.has(reward.powerup)) {
        err(file, `prop "${prop.id}" secret grants unknown power-up "${reward.powerup}"`);
      }
      if (reward.barkKey !== undefined) i18n(file, reward.barkKey);
      if (reward.at !== undefined) {
        const at = propById.get(reward.at);
        if (at === undefined) {
          err(file, `prop "${prop.id}" secret reward is at unknown prop "${reward.at}"`);
        } else if (reward.flushBirds !== undefined) {
          const plane = layerPlane.get(at.layer);
          if (plane === undefined) {
            err(file, `prop "${prop.id}" flushes birds at "${at.id}", which is not on a plane layer`);
          } else if (biome.lanes[plane]?.groundY === undefined || biome.lanes[plane].skyY === undefined) {
            err(file, `prop "${prop.id}" flushes birds on plane "${plane}", which has no ground and sky lane`);
          }
        }
      }
    }
    for (const event of biome.events) {
      const where = `event "${event.id}"`;
      const c = event.creature === undefined ? undefined : creatures.get(event.creature);
      if (event.creature !== undefined) {
        if (c === undefined) err(file, `${where} uses unknown creature "${event.creature}"`);
        else if (c.biomes && !c.biomes.includes(biome.id)) {
          err(file, `${where} creature "${c.id}" is limited to other biomes`);
        }
      }
      for (const p of event.perchProps ?? []) {
        const prop = propById.get(p);
        if (prop === undefined) err(file, `${where} perches on unknown prop "${p}"`);
        else if (prop.perch === undefined) err(file, `${where} perches on prop "${p}", which has no perch point`);
        else {
          const plane = layerPlane.get(prop.layer);
          if (plane === undefined) err(file, `${where} perch prop "${p}" is not on a plane layer`);
          else if (c !== undefined && c.kind !== 'helper' && !c.planes.includes(plane)) {
            err(file, `${where} perch prop "${p}" is on plane "${plane}", which "${c.id}" can't use`);
          }
        }
      }
      checkEventShape(event, c, (m) => {
        err(file, `${where} ${m}`);
      });
    }
    for (const entry of biome.spawnTable) {
      const c = creatures.get(entry.creature);
      if (c === undefined) err(file, `spawnTable uses unknown creature "${entry.creature}"`);
      else if (c.kind !== 'target') err(file, `spawnTable creature "${c.id}" is not a target`);
      else if (c.biomes && !c.biomes.includes(biome.id)) {
        err(file, `spawnTable creature "${c.id}" is limited to other biomes`);
      }
    }
  }

  // --- modes.json --------------------------------------------------------------------------
  for (const modeId of ['classic', 'daily'] as const) {
    const setup = modes.modes[modeId];
    const weapon = weapons.weapons.find((w) => w.id === setup.weapon);
    if (weapon?.kind !== 'primary') {
      err('modes.json', `mode "${modeId}" weapon "${setup.weapon}" is not a primary weapon`);
    }
    if (!loadedBiomes.has(setup.biome)) {
      err('modes.json', `mode "${modeId}" biome "${setup.biome}" has no biome file`);
    }
  }

  // --- world geometry (Tech §3.3) ----------------------------------------------------------
  for (const biome of biomes) {
    const file = `biomes/${biome.id}.json`;
    for (const layer of biome.layers) {
      if (layer.plane === undefined) continue;
      const expected = scoring.planes[layer.plane].scrollFactor;
      if (layer.scrollFactor !== expected) {
        err(file, `layer "${layer.id}" scrollFactor ${layer.scrollFactor} must equal scoring.json planes.${layer.plane}.scrollFactor ${expected}`);
      }
    }
    const panorama = coreWidth(scoring.planes.mid.scrollFactor);
    if (biome.panoramaWidth !== panorama) {
      err(file, `panoramaWidth ${biome.panoramaWidth} must equal the mid-plane core width ${panorama}`);
    }
  }

  // --- charms.json -------------------------------------------------------------------------
  for (const charm of charms.charms) {
    checkCharm(charm, {
      creatures,
      weaponIds,
      gadgetIds,
      plannedBiomeIds,
      omenIds,
      definedEventIds,
      err: (m) => {
        err('charms.json', m);
      },
      warn: (m) => {
        warn('charms.json', m);
      },
    });
  }

  return { errors, warnings };
}

interface CharmCtx {
  readonly creatures: ReadonlyMap<string, Creature>;
  readonly weaponIds: ReadonlySet<string>;
  readonly gadgetIds: ReadonlySet<string>;
  readonly plannedBiomeIds: ReadonlySet<string>;
  readonly omenIds: ReadonlySet<string>;
  readonly definedEventIds: ReadonlySet<string>;
  readonly err: (message: string) => void;
  readonly warn: (message: string) => void;
}

function checkCharm(charm: Charm, ctx: CharmCtx): void {
  const where = `charm "${charm.id}"`;
  const hasGadgetTrigger = charm.effects.some((e) => e.on === 'gadget');
  if (charm.gadget !== undefined && !ctx.gadgetIds.has(charm.gadget.replaces)) {
    ctx.err(`${where} replaces unknown gadget "${charm.gadget.replaces}"`);
  }
  if (hasGadgetTrigger && charm.gadget === undefined) {
    ctx.err(`${where} has an "on: gadget" effect but no gadget block`);
  }
  if (charm.script !== undefined) {
    ctx.warn(`${where} script "${charm.script}" has no registry yet (${LATER.script})`);
  }
  for (const effect of charm.effects) {
    const cond = effect.if;
    for (const c of cond?.creature ?? []) {
      if (!ctx.creatures.has(c)) ctx.err(`${where} condition uses unknown creature "${c}"`);
    }
    for (const w of cond?.weapon ?? []) {
      if (!ctx.weaponIds.has(w)) ctx.err(`${where} condition uses unknown weapon "${w}"`);
    }
    for (const b of cond?.biome ?? []) {
      if (!ctx.plannedBiomeIds.has(b)) ctx.err(`${where} condition uses unknown biome "${b}"`);
    }
    for (const o of cond?.omen ?? []) {
      if (!ctx.omenIds.has(o)) ctx.err(`${where} condition uses unknown omen "${o}"`);
    }
    const act = effect.do;
    if (act.weaponBlastEvery && !ctx.weaponIds.has(act.weaponBlastEvery.weapon)) {
      ctx.err(`${where} fires unknown weapon "${act.weaponBlastEvery.weapon}"`);
    }
    if (act.penaltyOverride) {
      const c = ctx.creatures.get(act.penaltyOverride.creature);
      if (c?.kind !== 'nonTarget') {
        ctx.err(`${where} penaltyOverride creature "${act.penaltyOverride.creature}" is not a non-target`);
      }
    }
    if (act.spawnRateMul && !ctx.creatures.has(act.spawnRateMul.creature)) {
      ctx.err(`${where} spawnRateMul uses unknown creature "${act.spawnRateMul.creature}"`);
    }
    if (act.spawnEvent !== undefined && !ctx.definedEventIds.has(act.spawnEvent)) {
      ctx.warn(`${where} spawns event "${act.spawnEvent}" that no biome defines yet (${LATER.spawnEvent})`);
    }
  }
}

type BiomeEvent = Biome['events'][number];

/** What each world-event handler needs from its biome entry (Tech §3.6). */
function checkEventShape(
  event: BiomeEvent,
  c: Creature | undefined,
  err: (message: string) => void,
): void {
  const needs = (ok: boolean, what: string): void => {
    if (!ok) err(`needs ${what}`);
  };
  switch (event.id) {
    case 'hadeda':
    case 'cropSprayer':
      needs(c !== undefined && c.kind === 'nonTarget' && (c.speeds?.fly ?? 0) > 0, 'a non-target creature with speeds.fly');
      return;
    case 'kwevoel':
      needs(c !== undefined && c.kind !== 'helper' && c.behaviours.includes('perchHigh') && (c.speeds?.fly ?? 0) > 0,
        'a perchHigh creature with speeds.fly');
      needs(event.perchProps !== undefined, 'perchProps');
      needs(event.stayMs !== undefined, 'stayMs');
      return;
    case 'bossAppearance':
      needs(c?.kind === 'boss', 'a boss creature');
      needs(event.perchProps !== undefined, 'perchProps');
      needs(event.stayMs !== undefined, 'stayMs');
      return;
    case 'dustDevil':
      needs(
        event.plane !== undefined &&
          event.radiusPx !== undefined &&
          event.lifeSeconds !== undefined &&
          event.speedPxPerSec !== undefined,
        'plane, radiusPx, lifeSeconds and speedPxPerSec',
      );
      return;
    case 'carAlarm':
    case 'reservoirFlush':
      err('is set off by a secret reward, not scheduled');
      return;
    case 'crate':
      err('is scheduled from powerups.json crates, not the biome');
      return;
    case 'stampede':
      err('comes from scoring.json stampede, not the biome');
      return;
    case 'farmDog':
      return;
  }
}

function checkUnique(
  file: string,
  what: string,
  ids: readonly string[],
  err: (file: string, message: string) => void,
): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) err(file, `duplicate ${what} id "${id}"`);
    seen.add(id);
  }
}

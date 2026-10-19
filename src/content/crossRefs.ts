// Cross-file reference checks for a parsed ContentBundle (Tech §4, .claude/rules/content.md).
// Pure: returns errors and warnings. Warnings cover content that arrives in later milestones
// (docs/04-BUILD-PLAN.md M0); `strict` turns them into errors (CI uses --strict from M8 on).
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

  const { scoring, birds, weapons, powerups, charms, run, biomes } = bundle;

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
    const propIds = new Set(biome.props.map((p) => p.id));

    for (const layer of biome.layers) {
      const merge = layer.lowTierMergeWith;
      if (typeof merge === 'string' && !layerIds.has(merge)) {
        err(file, `layer "${layer.id}" merges into unknown layer "${merge}"`);
      }
    }
    for (const prop of biome.props) {
      if (!layerIds.has(prop.layer)) err(file, `prop "${prop.id}" is on unknown layer "${prop.layer}"`);
      const reward = prop.secret?.reward;
      if (reward?.powerup !== undefined && !powerupIds.has(reward.powerup)) {
        err(file, `prop "${prop.id}" secret grants unknown power-up "${reward.powerup}"`);
      }
      if (reward?.barkKey !== undefined) i18n(file, reward.barkKey);
    }
    for (const event of biome.events) {
      if (event.creature !== undefined) {
        const c = creatures.get(event.creature);
        if (c === undefined) err(file, `event "${event.id}" uses unknown creature "${event.creature}"`);
        else if (c.biomes && !c.biomes.includes(biome.id)) {
          err(file, `event "${event.id}" creature "${c.id}" is limited to other biomes`);
        }
      }
      for (const p of event.perchProps ?? []) {
        if (!propIds.has(p)) err(file, `event "${event.id}" perches on unknown prop "${p}"`);
      }
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

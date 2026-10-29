// Cross-file reference checks for a parsed ContentBundle (Tech §4, .claude/rules/content.md).
// Pure: returns errors and warnings. Warnings cover content that arrives in later milestones
// (docs/04-BUILD-PLAN.md M0); `strict` turns them into errors (CI uses --strict from M8 on).
import { coreWidth, DESIGN_HEIGHT } from '../sim/world';
import { mixedOverlaps } from './rangeFootprint';
import { colonyIssues } from './colonyChecks';
import { ostrichIssues } from './ostrichChecks';
import { fenceIssues } from './fenceChecks';
import { palmIssues } from './palmChecks';
import { WORLD_EVENT_HANDLERS } from '../sim/director/events';

/** Half the narrowest visible design width (4:3, 1440 px; Tech §3.3). */
const MIN_HALF_VIEW_WIDTH = 720;
import { CHARM_SCRIPTS } from '../sim/charms/registry';
import type { Biome, Charm, ContentBundle, Creature, DailyMeta, Notaboek } from './schemas';

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
  /** content/meta/notaboek.json (meta-only, not in the bundle). Without it challenge refs warn. */
  readonly notaboek?: Notaboek;
  /** content/meta/daily.json (meta-only, not in the bundle). */
  readonly daily?: DailyMeta;
}

/** Milestone in which each kind of deferred content arrives — used in warning text. */
const LATER = {
  biome: 'M8',
  challenge: 'M5 (Notaboek)',
  spawnEvent: 'M8',
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

  const { scoring, birds, weapons, powerups, charms, run, modes, biomes, feesdae } = bundle;

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
  // 1.9.3 (D-056): the guns that pop a makalani nut.
  for (const w of birds.makalani.popWeapons)
    if (!weaponIds.has(w)) err('birds.json', `makalani.popWeapons names unknown weapon "${w}"`);
  const powerupIds = new Set(powerups.powerups.map((p) => p.id));
  const rankIds = new Set(scoring.ranks.map((r) => r.id));
  const bossRuleIds = new Set(Object.keys(run.bossRules));
  // v1.4 B: area packs (biome.area) are playable without a season.
  const plannedBiomeIds = new Set([
    ...run.seasons.map((s) => s.biome),
    ...biomes.filter((b) => b.area !== undefined).map((b) => b.id),
  ]);
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

  // v1.7 (D-044): the meerkat colonies' alarm listens for real fly-over creatures.
  for (const id of birds.meerkats.alarm.creatures) {
    if (!creatures.has(id)) err('birds.json', `meerkats.alarm lists unknown creature "${id}"`);
  }
  i18n('birds.json', birds.meerkats.hit.barkKey);
  i18n('birds.json', birds.meerkats.familiefoto.barkKey);
  // v1.7d (D-059): the ostriches' bark.
  i18n('birds.json', birds.ostriches.hit.barkKey);
  for (const c of birds.creatures)
    if (c.kind === 'nonTarget' && c.drift !== undefined) i18n('birds.json', c.drift.barkKey);

  // --- weapons.json ------------------------------------------------------------------------
  // v1.3 (D-036): sights and the rifles that fit them.
  const sightIds = new Set(weapons.sights.map((x) => x.id));
  checkUnique('weapons.json', 'sight', weapons.sights.map((x) => x.id), err);
  for (const sight of weapons.sights) i18n('weapons.json', sight.nameKey);
  for (const w of weapons.weapons) {
    if (w.kind !== 'primary' || w.aim === undefined) continue;
    for (const id of w.aim.sights)
      if (!sightIds.has(id)) err('weapons.json', `weapon "${w.id}" fits unknown sight "${id}"`);
  }
  // A sight unlocks at a known rank, or by a Notaboek challenge that rewards that very sight.
  for (const sight of weapons.sights) {
    const u = sight.unlock;
    if (u.type === 'rank' && !rankIds.has(u.id))
      err('weapons.json', `sight "${sight.id}" unlocks at unknown rank "${u.id}"`);
    if (u.type === 'challenge' && options.notaboek !== undefined) {
      const ch = options.notaboek.challenges.find((c) => c.id === u.id);
      if (ch === undefined)
        err('weapons.json', `sight "${sight.id}" unlock challenge "${u.id}" is not in meta/notaboek.json`);
      else if (ch.reward.type !== 'sight' || ch.reward.id !== sight.id)
        err('meta/notaboek.json', `challenge "${u.id}" must reward sight "${sight.id}" (weapons.json unlock)`);
    }
  }
  const scopeFits = weapons.weapons.some(
    (w) =>
      w.kind === 'primary' &&
      w.aim?.sights.some((id) => weapons.sights.find((x) => x.id === id)?.picture.startsWith('scope') === true) === true,
  );
  for (const w of weapons.weapons) {
    if (w.kind !== 'primary') continue;
    if (w.unlock.type === 'rank' && !rankIds.has(w.unlock.id)) {
      err('weapons.json', `weapon "${w.id}" unlocks at unknown rank "${w.unlock.id}"`);
    }
    if (w.unlock.type === 'challenge') {
      const unlockId = w.unlock.id;
      const ch = options.notaboek?.challenges.find((c) => c.id === unlockId);
      if (options.notaboek === undefined) {
        warn('weapons.json', `weapon "${w.id}" unlock challenge "${unlockId}" is not defined yet (${LATER.challenge})`);
      } else if (ch === undefined) {
        err('weapons.json', `weapon "${w.id}" unlock challenge "${unlockId}" is not in meta/notaboek.json`);
      } else if (ch.reward.type !== 'weapon' || ch.reward.id !== w.id) {
        err('meta/notaboek.json', `challenge "${unlockId}" must reward weapon "${w.id}" (weapons.json unlock)`);
      }
    }
  }

  // --- meta/notaboek.json ------------------------------------------------------------------
  if (options.notaboek !== undefined) {
    const nb = 'meta/notaboek.json';
    checkUnique(nb, 'challenge', options.notaboek.challenges.map((c) => c.id), err);
    for (const c of options.notaboek.challenges) {
      i18n(nb, `notaboek.${c.id}`);
      if (c.reward.type === 'weapon') {
        const rewardId = c.reward.id;
        const w = weapons.weapons.find((x) => x.id === rewardId);
        if (w?.kind !== 'primary') err(nb, `challenge "${c.id}" rewards unknown primary weapon "${rewardId}"`);
        else if (w.unlock.type !== 'challenge' || w.unlock.id !== c.id) {
          err(nb, `challenge "${c.id}" rewards "${rewardId}" but weapons.json does not unlock it with this challenge`);
        }
      }
      if (c.reward.type === 'sight') {
        const rewardId = c.reward.id;
        const sight = weapons.sights.find((x) => x.id === rewardId);
        if (sight === undefined) err(nb, `challenge "${c.id}" rewards unknown sight "${rewardId}"`);
        else if (sight.unlock.type !== 'challenge' || sight.unlock.id !== c.id)
          err(nb, `challenge "${c.id}" rewards sight "${rewardId}" but weapons.json does not unlock it with this challenge`);
      }
      if (c.bonus !== undefined && c.metric !== 'bonusUnlocks')
        err(nb, `challenge "${c.id}": the bonus filter only counts for metric bonusUnlocks`);
      if (c.reward.type === 'birdBookPage' && !plannedBiomeIds.has(c.reward.biome)) {
        err(nb, `challenge "${c.id}" rewards the page of unknown biome "${c.reward.biome}"`);
      }
      if (c.biome !== undefined && !plannedBiomeIds.has(c.biome)) {
        err(nb, `challenge "${c.id}" counts unknown biome "${c.biome}"`);
      }
      if (c.metric === 'distinctSecrets') {
        const biome = c.biome === undefined ? undefined : loadedBiomes.get(c.biome);
        if (c.biome === undefined) err(nb, `challenge "${c.id}" (distinctSecrets) needs a biome`);
        else if (biome !== undefined) {
          const n = biome.props.filter((p) => p.secret !== undefined).length;
          if (c.target !== n) {
            err(nb, `challenge "${c.id}" target ${c.target} != ${n} secrets in biome "${biome.id}"`);
          }
        }
      }
      if (c.metric === 'score' && c.scope !== 'hunt') err(nb, `challenge "${c.id}": score only counts per hunt`);
      if (c.reward.type === 'charm') {
        const charmId = c.reward.id;
        if (!charms.charms.some((x) => x.id === charmId)) err(nb, `challenge "${c.id}" rewards unknown charm "${charmId}"`);
      }
    }
    checkUnique(nb, 'charm reward', options.notaboek.challenges.flatMap((c) => (c.reward.type === 'charm' ? [c.reward.id] : [])), err);
  }

  // --- meta/daily.json ---------------------------------------------------------------------
  if (options.daily !== undefined) {
    const df = 'meta/daily.json';
    for (const b of options.daily.biomeRotation) {
      if (!plannedBiomeIds.has(b)) err(df, `biomeRotation: unknown biome "${b}"`);
      else if (!loadedBiomes.has(b)) warn(df, `biomeRotation: biome "${b}" is not loaded yet (${LATER.biome}); its days play the fallback`);
    }
    checkUnique(df, 'streak milestone day', options.daily.streakMilestones.map((m) => String(m.days)), err);
    for (const m of options.daily.streakMilestones) i18n(df, `cosmetic.${m.cosmetic}`);
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
    i18n('run.json', `season.${s.id}`);
    const boss = creatures.get(s.boss);
    if (boss?.kind !== 'boss') err('run.json', `season "${s.id}" boss "${s.boss}" is not a boss creature`);
    const biome = loadedBiomes.get(s.biome);
    if (biome === undefined) {
      // M8: no stand-in any more — every season needs its own biome.
      err('run.json', `season "${s.id}" biome file biomes/${s.biome}.json is missing`);
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
    for (const z of biome.twist?.splash?.zones ?? []) {
      if (!layerIds.has(z.layer)) err(file, `twist.splash zone is on unknown layer "${z.layer}"`);
    }
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
    // v1.2 (D-033): weekday layouts and bonus maps move real props onto real lanes.
    const propIds = new Set(biome.props.map((p) => p.id));
    const maps = [
      ...biome.layouts.map((l) => ({ where: `layout "${l.id}"`, o: l })),
      ...biome.bonusMaps.map((b) => ({ where: `bonus map "${b.id}"`, o: b })),
    ];
    for (const { where, o } of maps) {
      for (const m of o.props ?? []) {
        if (!propIds.has(m.id)) err(file, `${where} moves unknown prop "${m.id}"`);
      }
      if (o.windMul !== undefined && biome.omen.wind === undefined)
        err(file, `${where} sets windMul but omen "${biome.omen.id}" has no wind`);
      const lanes = { ...biome.lanes };
      for (const plane of ['near', 'mid', 'far', 'ver'] as const)
        if (o.lanes?.[plane] !== undefined) lanes[plane] = { ...lanes[plane], ...o.lanes[plane] };
      // v1.3 (D-036): a map that opens the Ver plane needs the biome's ver layer and Ver lanes.
      if (o.ver === true) {
        if (!biome.layers.some((l) => l.plane === 'ver'))
          err(file, `${where} opens the Ver plane but the biome has no layer with plane "ver"`);
        if (lanes.ver?.groundY === undefined || lanes.ver.skyY === undefined)
          err(file, `${where} opens the Ver plane but lanes.ver has no ground and sky lane`);
      }
      const verOpen = o.ver === true;
      if ('needsScope' in o && o.needsScope === true && !scopeFits)
        err(file, `${where} needs a scope but no rifle in weapons.json fits a sight with picture "scope"`);
      for (const s of o.feedingSpots ?? []) {
        if (lanes[s.plane]?.groundY === undefined || lanes[s.plane]?.skyY === undefined)
          err(file, `${where} feeding spot on plane "${s.plane}", which has no ground and sky lane`);
        if (s.plane === 'ver' && !verOpen)
          err(file, `${where} has a Ver feeding spot but doesn't open the Ver plane (ver: true)`);
      }
      const w = o.flyovers?.planeWeights;
      if (w !== undefined && (['mid', 'far'] as const).every((p) => w[p] === 0 || lanes[p]?.skyY === undefined) && !((w.ver ?? 0) > 0 && verOpen && lanes.ver?.skyY !== undefined))
        err(file, `${where} fly-over weights pick no plane with a sky lane`);
      if (w !== undefined && (w.ver ?? 0) > 0 && (!verOpen || lanes.ver?.skyY === undefined))
        err(file, `${where} gives the Ver lane a fly-over weight but has no open Ver plane with a sky lane`);
      for (const plane of ['near', 'mid', 'far', 'ver'] as const) {
        const n = o.pacing?.flocks?.[plane];
        if (plane === 'ver' && n !== undefined && n > 0 && !verOpen)
          err(file, `${where} wants Ver flocks but doesn't open the Ver plane (ver: true)`);
        const lane = lanes[plane];
        if (n !== undefined && n > 0 && (lane?.groundY === undefined || lane.skyY === undefined))
          err(file, `${where} wants flocks on plane "${plane}", which has no ground and sky lane`);
      }
    }
    for (const b of biome.bonusMaps) i18n(file, b.nameKey);
    // v1.7 (D-044): meerkat colonies on every map of the biome.
    for (const m of colonyIssues(bundle, biome)) err(file, m);
    // v1.7d (D-059): the ostrich pairs (nothing hidden behind them, clear of the colonies).
    for (const m of ostrichIssues(bundle, biome)) err(file, m);
    // v1.8 (D-050): the Blikkies fences (a can stands on a post; nothing hidden behind them).
    for (const m of fenceIssues(bundle, biome)) err(file, m);
    // 1.9.3 (D-056): the makalani palms (art on their plane; nothing hidden behind the nuts).
    for (const m of palmIssues(bundle, biome)) err(file, m);
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

  // --- modes.json range (v1.3x Skietbaan, D-037) ---------------------------------------------
  const rangeSetup = modes.modes.range;
  {
    const file = 'modes.json';
    const weapon = weapons.weapons.find((w) => w.id === rangeSetup.weapon);
    if (weapon?.kind !== 'primary')
      err(file, `mode "range" weapon "${rangeSetup.weapon}" is not a primary weapon`);
    if (!loadedBiomes.has(rangeSetup.biome))
      err(file, `mode "range" biome "${rangeSetup.biome}" has no biome file`);
    const c = creatures.get(rangeSetup.creature);
    if (c?.kind !== 'target' || !(c.speeds.fly > 0))
      err(file, `range creature "${rangeSetup.creature}" must be a target bird that flies`);
    for (const plane of ['near', 'mid', 'far', 'ver'] as const) {
      const spot = rangeSetup.spots[plane];
      const r = rangeSetup.paperRadiusPx * scoring.planes[plane].scale;
      for (const p of spot.paper) {
        if (p.y - r < 0 || p.y + r > DESIGN_HEIGHT)
          err(file, `range ${plane} paper target at y ${p.y} (radius ${r}) leaves the screen`);
      }
      const pr = rangeSetup.plateRadiusPx * scoring.planes[plane].scale;
      for (const p of spot.plate) {
        if (p.y - pr < 0 || p.y + pr > DESIGN_HEIGHT)
          err(file, `range ${plane} steel plate at y ${p.y} (radius ${pr}) leaves the screen`);
      }
      // 24 Oct update: the mixed course's spots stay inside the narrowest screen (4:3).
      for (const dx of rangeSetup.mixed.planes[plane].dx) {
        if (Math.abs(dx) > MIN_HALF_VIEW_WIDTH - r)
          err(file, `range mixed ${plane} spot dx ${dx} leaves a 4:3 screen`);
      }
      if (
        rangeSetup.mixed.movers.flock.includes(plane) &&
        rangeSetup.mixed.planes[plane].count >= rangeSetup.mixed.planes[plane].dx.length
      )
        err(file, `range mixed ${plane}: a flock plane needs a dx spot the static targets leave free`);
      for (const [what, y] of [
        ['stand', spot.stand.y],
        ['flyY', spot.flyY],
      ] as const) {
        if (y > DESIGN_HEIGHT) err(file, `range ${plane} ${what} y ${y} is below the screen`);
      }
      if (c !== undefined && c.kind === 'target' && !c.planes.includes(plane))
        err(file, `range creature "${c.id}" never appears on the ${plane} plane`);
      for (const biome of biomes) {
        if (!biome.layers.some((l) => l.plane === plane))
          err(file, `range ${plane}: biomes/${biome.id}.json has no ${plane} layer`);
        const lane = biome.lanes[plane];
        if (spot.lane === undefined && (lane?.groundY === undefined || lane.skyY === undefined))
          err(file, `range ${plane}: biomes/${biome.id}.json has no flock lane; give spots.${plane}.lane`);
        if (rangeSetup.flockSize > biome.pacing.maxBirdsOnScreen)
          err(file, `range flockSize ${rangeSetup.flockSize} > biomes/${biome.id}.json maxBirdsOnScreen`);
      }
    }
  }

  {
    const m = rangeSetup.mixed;
    const total = (['near', 'mid', 'far', 'ver'] as const).reduce((n, p) => n + m.planes[p].count, 0);
    if (total < m.statics.length)
      err('modes.json', `range mixed: ${total} static targets can't show all ${m.statics.length} kinds`);
    if (new Set(m.statics).size !== m.statics.length)
      err('modes.json', 'range mixed statics: each kind once');
    // Review fix: no spot may hide (or take the shots of) a target on another plane.
    for (const o of mixedOverlaps(bundle)) err('modes.json', `range mixed: ${o}`);
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
    i18n('charms.json', `charm.${charm.id}`);
    i18n('charms.json', `charm.${charm.id}.desc`);
    checkCharm(charm, {
      creatures,
      weaponIds,
      gadgetIds,
      plannedBiomeIds,
      omenIds,
      definedEventIds,
      scriptIds: new Set(Object.keys(CHARM_SCRIPTS)),
      eventCreatures: new Set(biomes.flatMap((b) => b.events.flatMap((e) => (e.creature === undefined ? [] : [e.creature])))),
      err: (m) => {
        err('charms.json', m);
      },
      warn: (m) => {
        warn('charms.json', m);
      },
    });
  }

  // --- feesdae.json (D-048) ----------------------------------------------------------------
  checkUnique('feesdae.json', 'special', feesdae.specials.map((f) => f.id), err);
  const dates = new Set<string>();
  for (const f of feesdae.specials) {
    const d = f.date;
    const key = `${d.month}-${d.day}`;
    if (dates.has(key)) err('feesdae.json', `two specials on ${key}`);
    dates.add(key);
    // A fixed date must exist in a leap year at least (29 Feb is allowed).
    if (d.day > ([31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][d.month - 1] ?? 31))
      err('feesdae.json', `special "${f.id}": ${key} is not a date`);
    if (f.map !== 'daily' && !loadedBiomes.has(f.map.biome))
      err('feesdae.json', `special "${f.id}" plays unknown biome "${f.map.biome}"`);
    const b = f.barks;
    for (const k of [f.nameKey, f.badgeKey, b.start, b.bat, b.owl, b.lanternsOut, b.end])
      i18n('feesdae.json', k);
    const tw = f.twist;
    for (const [name, c] of [['bats', tw.bats], ['owls', tw.owls]] as const)
      if (!(c.window[1] <= 1 && c.perHunt[0] <= c.perHunt[1]))
        err('feesdae.json', `special "${f.id}": ${name} window/perHunt out of range`);
    if (tw.bats.points <= 0) err('feesdae.json', `special "${f.id}": bats are a bonus (points > 0)`);
    if (tw.owls.points >= 0) err('feesdae.json', `special "${f.id}": owls are protected (points < 0)`);
    const propIds = new Set(biomes.flatMap((b) => b.props.map((p) => p.id)));
    for (const s of tw.lanterns.spots)
      if ('prop' in s && !propIds.has(s.prop))
        err('feesdae.json', `special "${f.id}": lantern spot on unknown prop "${s.prop}"`);
    if (tw.lanterns.count[1] > tw.lanterns.spots.length)
      err('feesdae.json', `special "${f.id}": more lanterns than lantern spots`);
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
  readonly scriptIds: ReadonlySet<string>;
  /** Creatures some biome event brings in (spawnRateMul scales those events). */
  readonly eventCreatures: ReadonlySet<string>;
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
  if (charm.script !== undefined && !ctx.scriptIds.has(charm.script)) {
    ctx.err(`${where} script "${charm.script}" is not registered in src/sim/charms/registry.ts`);
  }
  for (const effect of charm.effects) {
    const cond = effect.if;
    const passive = effect.on === 'passive';
    for (const key of Object.keys(effect.do) as (keyof typeof effect.do)[]) {
      if (PASSIVE_ACTIONS.has(key) && !passive) ctx.err(`${where} action "${key}" only works on "passive"`);
      if (!PASSIVE_ACTIONS.has(key) && passive) ctx.err(`${where} action "${key}" needs a trigger, not "passive"`);
      if (BAG_ACTIONS.has(key) && effect.on !== 'bag') ctx.err(`${where} scoring action "${key}" only works on "bag"`);
    }
    if (passive && cond !== undefined) ctx.err(`${where} a passive effect cannot have conditions`);
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
    if (act.spawnRateMul && !ctx.eventCreatures.has(act.spawnRateMul.creature)) {
      ctx.err(`${where} spawnRateMul creature "${act.spawnRateMul.creature}" is brought in by no biome event`);
    }
    if (act.spawnEvent !== undefined) {
      const handler = WORLD_EVENT_HANDLERS[act.spawnEvent];
      if (!CHARM_SPAWNABLE.has(handler)) {
        ctx.err(`${where} cannot spawn event "${act.spawnEvent}" (handler "${handler}")`);
      } else if (handler !== 'farmDog' && !ctx.definedEventIds.has(act.spawnEvent)) {
        ctx.warn(`${where} spawns event "${act.spawnEvent}" that no biome defines yet (${LATER.spawnEvent})`);
      }
    }
  }
}

/** Stat actions a charm holds while equipped (Tech §3.8); every other action needs a trigger. */
const PASSIVE_ACTIONS: ReadonlySet<string> = new Set([
  'bonusMul', 'penaltyOverride', 'shellCapacity', 'reloadSpeedMul', 'weaponBlastEvery',
  'alertRadiusMul', 'spawnRateMul', 'windDriftMul', 'revealSecrets', 'enableStampede',
  'frenzyMissBehaviour', 'interestCap', 'shopSlots', 'rerollDiscount',
]);
/** Per-bag scoring actions (GDD §5.3 pipeline). */
const BAG_ACTIONS: ReadonlySet<string> = new Set(['addPoints', 'addMult', 'mulMult']);
/** World-event handlers a charm's spawnEvent can call (the biome entry supplies the details,
 *  except the farm dog, which needs none). */
const CHARM_SPAWNABLE: ReadonlySet<string> = new Set(['flyover', 'perch', 'dustDevil', 'farmDog']);

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
    case 'fishEagle':
    case 'balloons':
      needs(c !== undefined && c.kind === 'nonTarget' && (c.speeds?.fly ?? 0) > 0, 'a non-target creature with speeds.fly');
      return;
    case 'kwevoel':
      needs(c !== undefined && c.kind !== 'helper' && c.behaviours.includes('perchHigh') && (c.speeds?.fly ?? 0) > 0,
        'a perchHigh creature with speeds.fly');
      needs(event.perchProps !== undefined, 'perchProps');
      needs(event.stayMs !== undefined, 'stayMs');
      return;
    case 'bossAppearance': {
      needs(c?.kind === 'boss', 'a boss creature');
      // M8: a lightningOnly boss (Die Stormvoël) crosses the sky in `passes`, nothing else.
      if (c !== undefined && c.kind === 'boss' && c.behaviours.includes('lightningOnly')) {
        needs(event.passes !== undefined, 'passes (the planes it crosses)');
        return;
      }
      if (event.passes !== undefined) err('passes are only for a lightningOnly boss');
      needs(event.roamPx !== undefined, 'roamPx');
      needs(event.perchProps !== undefined, 'perchProps');
      needs(event.stayMs !== undefined, 'stayMs');
      // M8: a boss that peeks from cover moves between at least two cover props; one that hops
      // (Kuifkop Koning) also needs its hop.
      const peeks = c !== undefined && c.kind === 'boss' && c.behaviours.includes('peekFromCover');
      const hops = c !== undefined && c.kind === 'boss' && c.behaviours.includes('hop');
      if (peeks || hops) {
        needs(event.peekMs !== undefined && event.hideMs !== undefined, 'peekMs and hideMs');
        needs((event.perchProps?.length ?? 0) >= 2, 'two or more perchProps (cover)');
      } else if (event.peekMs !== undefined || event.hideMs !== undefined) {
        err('peekMs/hideMs are only for a peekFromCover or hopping boss');
      }
      if (hops)
        needs(
          event.hopMs !== undefined && event.hopPx !== undefined && event.hopPxPerSec !== undefined,
          'hopMs, hopPx and hopPxPerSec',
        );
      else if (event.hopMs !== undefined || event.hopPx !== undefined || event.hopPxPerSec !== undefined)
        err('hopMs/hopPx are only for a hopping bird');
      return;
    }
    case 'kuifkopHop':
      needs(
        c !== undefined && c.kind === 'target' && c.behaviours.includes('hop'),
        'a target creature with the hop behaviour',
      );
      needs((event.perchProps?.length ?? 0) >= 2, 'two or more perchProps (cover)');
      needs(event.stayMs !== undefined, 'stayMs');
      needs(
        event.peekMs !== undefined &&
          event.hideMs !== undefined &&
          event.hopMs !== undefined &&
          event.hopPx !== undefined &&
          event.hopPxPerSec !== undefined,
        'peekMs, hideMs, hopMs, hopPx and hopPxPerSec',
      );
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

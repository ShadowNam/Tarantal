// R1–R6: the shed journal. Reuses existing art; optional pictures never block its controls.
import type * as Phaser from 'phaser';
import { JOURNAL } from '../../content/journal';
import { fill, getLanguage, t, tOr, isI18nKey } from '../../i18n/i18n';
import { decodeChallenge } from '../../meta/challenge';
import { bonusSlug } from '../../meta/bonusMaps';
import { equipPlaque, personalGoals, plaqueProgress, sightingKey } from '../../meta/journal';
import type { GameContext } from '../GameContext';
import type { Rect } from '../ui/hudLayout';
import { drawButton, fitText, textStyle, UI, type MenuItem } from '../ui/menu';
import { guideString, guideLoaded } from '../ui/guideI18n';
import { oupaShows } from '../audio/oupaMode';
import { fetchAssetIndex, loadImage } from '../assets/finalLoader';
import { residentFrames, RESIDENT_SHEET_W } from '../view/tree/residentSheet';
import { colonyFrames, COLONY_SHEET_W } from '../view/tree/colonySheet';
import { CAMEO_SHEET_SIZE, type CameoSheetArea } from '../cameos/cameoKeys';

/** A portrait's frame rect on its 1× sheet and that sheet's 1× width (null: unknown frame). A
 *  cameo's frame table is loaded with the portrait (lazily: it stays out of the first download,
 *  in the cameos' chunk). */
async function portraitRect(
  sheet: string,
  frame: string,
  habitat: string,
): Promise<{ x: number; y: number; w: number; h: number; sheetW: number } | null> {
  // v1.13 (D-075): a cameo's sheet (cameos/<area>), its frames at half size on the sheet.
  if (sheet.startsWith('cameos/')) {
    const area = sheet.slice('cameos/'.length) as CameoSheetArea;
    const size = CAMEO_SHEET_SIZE[area] as (typeof CAMEO_SHEET_SIZE)[CameoSheetArea] | undefined;
    if (size === undefined) return null;
    const { cameoFrames, sheetRect } = await import('../cameos/cameoSheet');
    const f = cameoFrames(area).find((x) => x.name === frame);
    return f === undefined ? null : { ...sheetRect(f), sheetW: size.w };
  }
  const baobab = habitat === 'baobab';
  const f = (baobab ? residentFrames() : colonyFrames()).find((x) => x.name === frame);
  return f === undefined
    ? null
    : { x: f.x, y: f.y, w: f.w, h: f.h, sheetW: baobab ? RESIDENT_SHEET_W : COLONY_SHEET_W };
}

export type JournalSection = 'field' | 'goals' | 'coach' | 'rivals' | 'plaques';
const SECTIONS: readonly JournalSection[] = ['field', 'goals', 'coach', 'rivals', 'plaques'];
export const journalText = (key: string): string => {
  const id = `journal.${key}`;
  return guideString(getLanguage(), `guide.${id}`) ?? (isI18nKey(id) ? t(id) : '');
};

export function renderJournal(
  scene: Phaser.Scene,
  ctx: GameContext,
  body: Rect,
  items: MenuItem[],
  section: JournalSection,
  requestedPage: number,
  rebuild: (section: JournalSection, page: number, focus?: string) => void,
): void {
  let alive = true;
  if (ctx.hook) ctx.hook.journalPortraits = 0;
  const textures = new Set<string>();
  scene.events.once('shutdown', () => {
    alive = false;
    if (ctx.hook) {
      delete ctx.hook.journal;
      delete ctx.hook.journalGoals;
      ctx.hook.journalPortraits = 0;
    }
    for (const key of textures) if (scene.textures.exists(key)) scene.textures.remove(key);
  });
  const tr = journalText;
  const text = (x: number, y: number, value: string, size = 28, color = '#F3EAD3', wrap?: number) =>
    scene.add.text(x, y, value, {
      ...textStyle(size, color),
      ...(wrap === undefined ? {} : { wordWrap: { width: wrap }, lineSpacing: 5 }),
    });
  const button = (
    id: string,
    rect: Rect,
    label: string,
    press: () => void,
    selected = false,
    enabled = true,
  ) => {
    drawButton(scene, rect, label, !enabled ? 'locked' : selected ? 'selected' : 'secondary', 27);
    items.push({ id, rect: () => rect, press, enabled: () => enabled });
  };
  const navW = (body.w - 4 * 12) / 5;
  SECTIONS.forEach((id, i) => {
    button(
      `journal.${id}`,
      { x: body.x + i * (navW + 12), y: body.y, w: navW, h: 58 },
      tr(`section.${id}`),
      () => {
        rebuild(id, 0, `journal.${id}`);
      },
      section === id,
    );
  });
  if (!guideLoaded()) {
    text(body.x + 20, body.y + 104, t('journal.loading'), 30, '#F3EAD3', body.w - 40);
    return;
  }

  const save = ctx.save.data;
  const plaques = plaqueProgress(save);
  const seen = JOURNAL.species.filter((s) => save.birdBook.creatures.includes(sightingKey(s.id)));
  const records = Object.entries(save.journal.records).reverse();
  const latest =
    save.journal.latest === null ? undefined : save.journal.records[save.journal.latest];
  const top = body.y + 82;
  const areaH = body.h - 154;
  const pagerY = body.y + body.h - 54;
  let pages = 1;
  let page = 0;
  const paginate = (count: number, perPage: number): number => {
    pages = Math.max(1, Math.ceil(count / perPage));
    page = Math.max(0, Math.min(pages - 1, requestedPage));
    return page * perPage;
  };
  const card = (i: number, perPage: number): Rect => {
    const h = (areaH - (perPage - 1) * 16) / perPage;
    const r = { x: body.x, y: top + i * (h + 16), w: body.w, h };
    scene.add.graphics().fillStyle(UI.ink, 0.8).fillRoundedRect(r.x, r.y, r.w, r.h, 14);
    return r;
  };
  const setup = (r: {
    biome: string;
    weapon: string;
    mode?: string;
    layout?: string | null;
    bonus?: string | null;
    sight?: string | null;
  }): string =>
    [
      r.mode === undefined ? '' : tr(`mode.${r.mode}`),
      tOr(`share.biome.${r.biome.replace(/-/g, '_')}`, r.biome),
      tOr(`weapon.${r.weapon}`, r.weapon),
      r.layout == null ? '' : tOr(`map.day.${r.layout}`, r.layout),
      r.bonus == null ? '' : tOr(`map.${bonusSlug(r.bonus)}`, r.bonus),
      r.sight == null ? '' : tOr(`sight.${r.sight}`, r.sight),
    ]
      .filter(Boolean)
      .join(' · ');

  if (section === 'field') {
    const start = paginate(JOURNAL.species.length, 2);
    JOURNAL.species.slice(start, start + 2).forEach((species, i) => {
      const r = card(i, 2);
      const found = save.birdBook.creatures.includes(sightingKey(species.id));
      const name = text(
        r.x + 160,
        r.y + 16,
        found ? tr(`species.${species.id}.name`) : tr('unknown'),
        32,
        '#FFD25A',
      );
      fitText(name, r.w - 184);
      text(
        r.x + 160,
        r.y + 66,
        tr(found ? `species.${species.id}.fact` : `habitat.${species.habitat}`),
        26,
        '#F3EAD3',
        r.w - 184,
      );
      if (found && oupaShows(ctx.prefs.oupa))
        text(r.x + 160, r.y + r.h - 60, tr(`species.${species.id}.note`), 23, '#D6C29C', r.w - 184);
      const mark = text(
        r.x + 66,
        r.y + r.h / 2 - 16,
        found ? '★' : '?',
        44,
        found ? '#FFD25A' : '#9A9A8A',
      );
      if (!found) return;
      const sheet = species.sheet;
      const frameName = species.frame;
      if (sheet === undefined || frameName === undefined) return;
      // Unique journal keys prevent a portrait from retaining or removing a hunt's shared sheet.
      void fetchAssetIndex(JOURNAL.fileTimeoutMs)
        .then(async ({ index }) => {
          const entry = index?.images[sheet];
          if (entry === undefined) return;
          const img = await loadImage(entry.file.path, JOURNAL.fileTimeoutMs);
          if (!alive || img === null) return;
          const key = `journal-portrait:${sheet}`;
          if (!scene.textures.exists(key)) scene.textures.addImage(key, img);
          textures.add(key);
          const frame = await portraitRect(sheet, frameName, species.habitat);
          if (frame === null) return;
          const k = img.width / frame.sheetW;
          const texture = scene.textures.get(key);
          if (!texture.has(frameName))
            texture.add(frameName, 0, frame.x * k, frame.y * k, frame.w * k, frame.h * k);
          const portrait = scene.add.image(r.x + 78, r.y + r.h / 2, key, frameName);
          portrait.setScale(Math.min(116 / (frame.w * k), 136 / (frame.h * k)));
          mark.setVisible(false);
          if (ctx.hook) ctx.hook.journalPortraits = (ctx.hook.journalPortraits ?? 0) + 1;
        })
        .catch(() => {
          /* Text and controls remain usable offline. */
        });
    });
  } else if (section === 'goals') {
    const start = paginate(records.length, 1);
    const pair = records[start];
    if (pair === undefined)
      text(body.x + 20, top + 26, tr('goals.empty'), 30, '#F3EAD3', body.w - 40);
    else {
      const r = pair[1];
      fitText(text(body.x + 18, top, setup(r), 29, '#FFD25A'), body.w - 36);
      const goals = r.rules === ctx.contentHash.slice(0, 8) ? personalGoals(r) : [];
      if (goals.length === 0)
        text(body.x + 20, top + 70, tr('goals.updated'), 30, '#F3EAD3', body.w - 40);
      const h = (areaH - 55) / Math.max(1, goals.length);
      goals.forEach((g, i) => {
        const y = top + 55 + i * h;
        const format = (n: number) => (g.id === 'accuracy' ? `${Math.round(n * 100)}%` : String(n));
        text(body.x + 20, y, fill(tr(`goal.${g.id}`), { n: JOURNAL.minAccuracyShots }), 29);
        const label = g.complete
          ? tr('goal.mastered')
          : fill(tr('goal.target'), { best: format(g.best), target: format(g.target) });
        fitText(text(body.x + body.w * 0.45, y, label, 27, '#FFD25A'), body.w * 0.52);
      });
      if (ctx.hook) ctx.hook.journalGoals = goals.map((g) => ({ ...g }));
    }
  } else if (section === 'coach') {
    const tips = ['steady', 'reload', 'flock', 'distance', 'weapon'];
    const start = paginate(tips.length, 1);
    text(body.x + 24, top + 4, tr('coach.intro'), 30, '#FFD25A', body.w - 48);
    text(body.x + 24, top + 90, tr(`tip.${tips[start] ?? 'steady'}`), 34, '#F3EAD3', body.w - 48);
    if (latest !== undefined && oupaShows(ctx.prefs.oupa))
      text(
        body.x + 24,
        top + 260,
        `${tr('coach.personal')} ${tr(`tip.${latest.tip}`)}`,
        27,
        '#D6C29C',
        body.w - 48,
      );
  } else if (section === 'rivals') {
    const rivals = [...save.journal.rivals].reverse();
    const start = paginate(rivals.length, 2);
    if (rivals.length === 0)
      text(body.x + 20, top + 20, tr('rivals.empty'), 30, '#F3EAD3', body.w - 40);
    rivals.slice(start, start + 2).forEach((rival, i) => {
      const r = card(i, 2);
      fitText(text(r.x + 20, r.y + 14, rival.by ?? tr('rivals.friend'), 32, '#FFD25A'), r.w - 40);
      fitText(text(r.x + 20, r.y + 62, setup(rival), 25), r.w - 40);
      text(
        r.x + 20,
        r.y + 106,
        fill(tr('rivals.scores'), { target: rival.target, best: rival.best }),
        28,
      );
      text(
        r.x + 20,
        r.y + r.h - 46,
        tr(
          rival.best > rival.target
            ? 'rivals.win'
            : rival.best === rival.target
              ? 'rivals.draw'
              : 'rivals.chase',
        ),
        25,
        '#FFD25A',
      );
      const decoded = decodeChallenge(rival.link, {
        content: ctx.content,
        playableBiomes: ctx.playableBiomes,
        contentHash: ctx.contentHash,
        limits: ctx.dailyMeta.challenge,
      });
      button(
        `journal.rematch.${i}`,
        { x: r.x + r.w - 320, y: r.y + r.h - 64, w: 300, h: 52 },
        tr('rivals.rematch'),
        () => {
          if (!decoded.ok) return;
          ctx.pendingChallenge = decoded;
          scene.scene.stop('Title');
          scene.scene.get('Hunt').scene.restart({});
          scene.scene.stop();
        },
        false,
        decoded.ok && !ctx.daily.unranked,
      );
    });
  } else {
    const start = paginate(plaques.length, 2);
    plaques.slice(start, start + 2).forEach((p, i) => {
      const r = card(i, 2);
      fitText(
        text(
          r.x + 24,
          r.y + 20,
          `${p.earned ? '★ ' : ''}${tr(`plaque.${p.id}`)}`,
          34,
          p.earned ? '#FFD25A' : '#9A9A8A',
        ),
        r.w - 48,
      );
      text(
        r.x + 24,
        r.y + 80,
        fill(tr(`require.${p.id}`), {
          n: p.target,
          shots: JOURNAL.minAccuracyShots,
          accuracy: `${Math.round(p.target * 100)}%`,
        }),
        28,
        '#F3EAD3',
        r.w - 48,
      );
      const equipped = save.journal.plaque === p.id;
      button(
        `journal.equip.${p.id}`,
        { x: r.x + 24, y: r.y + r.h - 72, w: 360, h: 56 },
        tr(equipped ? 'plaque.equipped' : p.earned ? 'plaque.equip' : 'plaque.locked'),
        () => {
          ctx.save.update((d) => equipPlaque(d, equipped ? null : p.id));
          rebuild(section, page, `journal.equip.${p.id}`);
        },
        equipped,
        p.earned,
      );
    });
  }
  if (pages > 1) {
    button(
      'journal.previous',
      { x: body.x, y: pagerY, w: 260, h: 50 },
      tr('previous'),
      () => {
        rebuild(section, page - 1, 'journal.previous');
      },
      false,
      page > 0,
    );
    const label = text(
      body.x + body.w / 2,
      pagerY + 8,
      fill(tr('page'), { n: page + 1, total: pages }),
      25,
      '#D6C29C',
    );
    label.setOrigin(0.5, 0);
    button(
      'journal.next',
      { x: body.x + body.w - 260, y: pagerY, w: 260, h: 50 },
      tr('next'),
      () => {
        rebuild(section, page + 1, 'journal.next');
      },
      false,
      page < pages - 1,
    );
  }
  if (ctx.hook)
    ctx.hook.journal = {
      section,
      page,
      seen: seen.map((s) => s.id),
      earned: plaques.filter((p) => p.earned).map((p) => p.id),
      equipped: save.journal.plaque,
      records: records.length,
      rivals: save.journal.rivals.length,
    };
}

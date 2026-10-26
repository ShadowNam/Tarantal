// v1.6 (D-042 review): the far animals' sprites (src/game/view/faunaSprites.ts), drawn at 3× so
// they stay crisp through a scope. Each draws one herd or group round (0, 0) = its feet's centre.
// Haze: half the layer's (they still sit in the distance, but read as solid animals, never
// pale ghosts); no alpha anywhere on the animals.
import { farAnimal, herd, type AnimalKind, type Pose } from './fauna';
import type { PaintCtx } from './landscape';
import { mix } from './scenery';
import { g } from './svg';

/** D-049: a sheet's drawing, and the animals in it (kind and drawn height `h`, design px) for
 *  tools/perspective-audit.ts. */
type Draw = ((ctx: PaintCtx) => string) & {
  readonly animals: readonly { readonly kind: AnimalKind; readonly h: number }[];
};

/** Half the plane's haze: a solid animal, a little softened by distance. */
const halfTint =
  (ctx: PaintCtx) =>
  (hex: string): string =>
    mix(hex, ctx.tint(hex), 0.5);

const group = (kind: AnimalKind, h: number, n: number, spread: number): Draw =>
  Object.assign((ctx: PaintCtx) => herd(ctx.rnd, kind, 0, 0, h, n, spread, halfTint(ctx)), {
    animals: Array.from({ length: n }, () => ({ kind, h })),
  });

/** Named animals at fixed spots: [kind, pose, x, dy, h, facing]. */
const placed = (
  list: readonly (readonly [AnimalKind, Pose, number, number, number, 1 | -1])[],
): Draw =>
  Object.assign(
    (ctx: PaintCtx) => {
      const tint = halfTint(ctx);
      const items = [...list].sort((a, b) => a[3] - b[3]);
      return g(
        {},
        ...items.map(([kind, pose, x, dy, h, facing], i) =>
          farAnimal({ kind, pose, x, foot: dy, h, facing, tint, phase: (i * 0.37) % 1 }),
        ),
      );
    },
    { animals: list.map(([kind, , , , h]) => ({ kind, h })) },
  );

/** D-049: the Ver waterhole's animals are drawn this many times their v1.6 heights. */
export const WATERHOLE_HEIGHT_MUL = 5;
const W = WATERHOLE_HEIGHT_MUL;

export const FAUNA_DRAW: Readonly<Record<string, Draw>> = {
  'fauna/karoo_springbok_a': group('springbok', 12, 8, 170),
  'fauna/karoo_springbok_b': group('springbok', 12, 4, 90),
  'fauna/karoo_ostrich': group('ostrich', 24, 3, 70),
  'fauna/bushveld_giraffes_a': placed([
    ['giraffe', 'alert', -26, 0, 58, 1],
    ['giraffe', 'graze', 12, 1, 52, 1],
    ['giraffe', 'walk', 34, 3, 33, 1],
  ]),
  'fauna/bushveld_giraffes_b': placed([
    ['giraffe', 'walk', -8, 0, 56, 1],
    ['giraffe', 'alert', 22, 2, 31, -1],
  ]),
  'fauna/bushveld_zebra': group('zebra', 15, 5, 130),
  'fauna/bushveld_wildebeest': group('wildebeest', 15, 4, 100),
  'fauna/bushveld_elephants': group('elephant', 24, 3, 120),
  'fauna/okavango_elephants': group('elephant', 24, 3, 140),
  'fauna/okavango_lechwe': group('lechwe', 12, 8, 170),
  'fauna/okavango_zebra': group('zebra', 15, 4, 110),
  'fauna/okavango_wildebeest': group('wildebeest', 15, 3, 90),
  'fauna/kalahari_springbok': group('springbok', 12, 7, 150),
  'fauna/kalahari_ostrich': group('ostrich', 24, 2, 50),
  'fauna/kalahari_wildebeest': group('wildebeest', 15, 4, 110),
  // The waterhole on the Ver strip (its water is in the layer, centred on u 0.5). D-049: the
  // animals stand 5× their v1.6 heights (and depth offsets) at the same spots, in proportion to
  // the Ver birds (0.07); scaling the sprite instead would spread them off the water.
  'fauna/namibie_waterhole': placed([
    ['giraffe', 'alert', -165, -0.5 * W, 8 * W, 1],
    ['giraffe', 'drink', -152, 0 * W, 13 * W, 1],
    ['springbok', 'graze', -126, 0.2 * W, 3.8 * W, 1],
    ['zebra', 'walk', -105, -0.7 * W, 4.2 * W, 1],
    ['springbok', 'alert', -95, -0.6 * W, 3.8 * W, 1],
    ['zebra', 'graze', -79, 0.6 * W, 4.2 * W, 1],
    ['springbok', 'graze', -58, 0.5 * W, 3.8 * W, 1],
    ['gemsbok', 'graze', 47, 0.4 * W, 4.4 * W, -1],
    ['gemsbok', 'alert', 87, -0.4 * W, 4.4 * W, -1],
    ['springbok', 'graze', 121, 0.3 * W, 3.8 * W, -1],
    ['ostrich', 'walk', 163, -0.5 * W, 7 * W, -1],
    ['ostrich', 'alert', 178, -0.2 * W, 7 * W, -1],
  ]),
  'fauna/namibie_gemsbok': group('gemsbok', 15, 4, 120),
  'fauna/namibie_ostrich': group('ostrich', 24, 2, 60),
  'fauna/namibie_zebra': group('zebra', 15, 4, 110),
};

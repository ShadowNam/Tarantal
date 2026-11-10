// v1.18 perf (D-081): the Harvest view's per-frame lookups as constant tables, so the update loop
// neither scans lists nor builds strings: which texture a frame is cut on (the Harvest sheet, the
// Phase 2 sheet or the baboon sheet's borrowed raider frames) and a farm worker's frame name.
import { BABOON_SHEET } from '../baboon/baboonKeys';
import { HARVEST2_FRAME_NAMES, HARVEST2_SHEET, type Harvest2Frame } from './harvest2Sheet';
import { HARVEST_SHEET, type HarvestFrame } from './harvestSheet';

/** v1.18 (D-081): the baboon sheet's raider frames Phase 2's baboons borrow (BaboonView cuts
 *  them on the baboon sheet; drawn at BABOON2_H like the raiders). */
export const BABOON_BORROWED = [
  'run_a',
  'run_b',
  'mielie_a',
  'mielie_b',
  'tumble',
  'down',
] as const;
export type BorrowedFrame = (typeof BABOON_BORROWED)[number];
/** Any frame a Harvest slot draws: the Harvest sheet's, the Phase 2 sheet's, a borrowed one. */
export type AnyFrame = HarvestFrame | Harvest2Frame | BorrowedFrame;

/** The Phase 2 and borrowed frames' textures (texOf: any other frame is on the Harvest sheet). */
export const FRAME_TEX: ReadonlyMap<string, string> = new Map<string, string>([
  ...HARVEST2_FRAME_NAMES.map((f): [string, string] => [f, HARVEST2_SHEET]),
  ...BABOON_BORROWED.map((f): [string, string] => [f, BABOON_SHEET]),
]);

/** The texture a frame is cut on (the Harvest sheet unless it is a Phase 2 or borrowed frame). */
export function texOf(f: AnyFrame): string {
  return FRAME_TEX.get(f) ?? HARVEST_SHEET;
}

const alt = (t: number, every: number): boolean => Math.floor(t / every) % 2 === 0;

/** A worker's frames per look (0..2), in the order duck, run a/b, work a/b. */
const WORKER_FRAMES: readonly HarvestFrame[] = [0, 1, 2].flatMap((look) =>
  ['duck', 'run_a', 'run_b', 'work_a', 'work_b'].map(
    (p) => `wk${String(look)}_${p}` as HarvestFrame,
  ),
);

/** A farm worker's frame: ducking, running (or leaving), else working; two-frame cycles of
 *  `runTicks` and `workTicks` sim ticks. */
export function workerFrame(
  look: number,
  phase: string,
  t: number,
  runTicks: number,
  workTicks: number,
): HarvestFrame {
  const i =
    phase === 'duck'
      ? 0
      : phase === 'run' || phase === 'leave'
        ? alt(t, runTicks)
          ? 1
          : 2
        : alt(t, workTicks)
          ? 3
          : 4;
  return WORKER_FRAMES[(look % 3) * 5 + i] ?? 'wk0_work_a';
}

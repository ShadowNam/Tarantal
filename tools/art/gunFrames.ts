// Renders interim gun masters (D-029): weapon × clip × frame → RGBA at masterScale × the box.
import type { GunClip } from '../../src/game/assets/assetIndex';
import type { Rgba } from '../assets/image';
import type { ArtConfig, GunId } from './config';
import { gunFrameSvg } from './guns';
import { renderSvg } from './raster';

export function renderGunFrame(cfg: ArtConfig, id: GunId, clip: GunClip, frame: number): Rgba {
  return renderSvg(gunFrameSvg(cfg, id, clip, frame));
}

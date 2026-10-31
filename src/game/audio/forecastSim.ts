// v1.9 (D-066): the sim's pure schedule functions the soundscape's warning forecast re-runs
// (warningForecast.ts). HuntScene hands this to the lazy soundscape chunk: the chunk importing
// these sim modules itself split them out of the first download's chunks (~0.6 KB gzip).
import { passivesOf } from '../../sim/charms';
import { secondsToTicks } from '../../sim/clock';
import {
  mergeSchedules,
  scheduleExtraEvents,
  scheduleWorldEvents,
} from '../../sim/director/events';
import { mapOmen, resolveMap } from '../../sim/maps';
import { createRng } from '../../sim/rng';

export const FORECAST_SIM = {
  passivesOf,
  secondsToTicks,
  mergeSchedules,
  scheduleExtraEvents,
  scheduleWorldEvents,
  mapOmen,
  resolveMap,
  createRng,
};
export type ForecastSim = typeof FORECAST_SIM;

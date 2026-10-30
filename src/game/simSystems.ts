// v1.8b (D-062): the lazy sim systems' chunk (src/sim/lazySystemsRegister.ts: the baboon troops
// and Namibië's ostriches). The title starts loading it; a hunt on a map that has them waits for
// it (a hunt never leaves them out: it would replay differently).
import { registeredLazySystems } from '../sim/lazySystems';

let loading: Promise<boolean> | null = null;

export function simSystemsReady(): boolean {
  return registeredLazySystems() !== null;
}

/** Starts (or joins) loading the chunk; false when it didn't come (offline): try again later. */
export function loadSimSystems(): Promise<boolean> {
  loading ??= import('../sim/lazySystemsRegister').then(
    () => true,
    () => {
      loading = null;
      return false;
    },
  );
  return loading;
}

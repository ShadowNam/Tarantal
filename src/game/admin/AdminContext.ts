// v1.2x (D-034): what the playtest admin page shares with the scenes (built in main.ts when
// `?admin=1` is on a build whose PlatformAdapter allows it).
import type { AdminEntry, AdminSave } from '../../meta/admin';
import type { AdminHuntSetup } from './adminPlay';

export interface AdminContext {
  /** Every playable map, in list order. */
  readonly entries: readonly AdminEntry[];
  /** The hunt this page was reloaded into ([Play]), or null on the list page. */
  readonly setup: AdminHuntSetup | null;
  /** Short commit SHA of this build (or "dev"). */
  readonly build: string;
  /** The admin save (reviews, options, the pending play): read and write. */
  load(): AdminSave;
  store(s: AdminSave): void;
  /** Reloads the page into the admin list (`?admin=1`). */
  back(): void;
  /** Reloads the page into the stored play (`?admin=1&play=1`). */
  playStored(): void;
  /** The play hunt started: remembers its seed and gun for the entry's report. */
  played(seed: number, gun: string): void;
}

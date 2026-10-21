// Sharing (GDD §15, Tech §12): the native share sheet where there is one, else the clipboard,
// else a hidden-textarea copy. Pure decision logic over injected browser calls, so it is unit
// tested; web.ts passes the real navigator/document functions. Must be called from inside a
// user gesture (a pointerup or key handler) — browsers refuse both APIs otherwise.

export interface SharePayload {
  readonly text: string;
  /** Link to the same hunt (empty = none). */
  readonly url: string;
}

/** shared: the share sheet completed · copied: on the clipboard · cancelled: the player closed
 *  the sheet (no fallback, no error) · failed: nothing worked. */
export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'failed';

export interface ShareDeps {
  readonly share?: (data: { text: string; url?: string }) => Promise<void>;
  readonly canShare?: (data: { text: string; url?: string }) => boolean;
  readonly writeClipboard?: (text: string) => Promise<void>;
  /** Last resort (old browsers, clipboard permission denied): true if the copy worked. */
  readonly copyFallback?: (text: string) => boolean;
}

/** The clipboard text: the message, then the link. */
export function clipboardText(p: SharePayload): string {
  return p.url === '' ? p.text : `${p.text} ${p.url}`;
}

function isAbort(e: unknown): boolean {
  return typeof e === 'object' && e !== null && 'name' in e && e.name === 'AbortError';
}

export async function shareWith(deps: ShareDeps, p: SharePayload): Promise<ShareOutcome> {
  const data = p.url === '' ? { text: p.text } : { text: p.text, url: p.url };
  if (deps.share !== undefined && (deps.canShare?.(data) ?? true)) {
    try {
      await deps.share(data);
      return 'shared';
    } catch (e) {
      if (isAbort(e)) return 'cancelled';
      // NotAllowedError (no gesture, policy) or a missing share target: try the clipboard.
    }
  }
  const text = clipboardText(p);
  if (deps.writeClipboard !== undefined) {
    try {
      await deps.writeClipboard(text);
      return 'copied';
    } catch {
      // Permission denied or insecure context: fall through.
    }
  }
  try {
    if (deps.copyFallback?.(text) === true) return 'copied';
  } catch {
    // Nothing else to try.
  }
  return 'failed';
}

import { describe, expect, it, vi } from 'vitest';
import { clipboardText, shareWith, type ShareDeps } from './share';

const msg = { text: 'Tarantal Madness · Daily #1 · 2 840', url: 'https://x.test/?c=abc' };
const abort = Object.assign(new Error('closed'), { name: 'AbortError' });
const denied = Object.assign(new Error('no gesture'), { name: 'NotAllowedError' });

describe('shareWith', () => {
  it('uses the share sheet with text and url apart', async () => {
    const share = vi.fn(() => Promise.resolve());
    const writeClipboard = vi.fn(() => Promise.resolve());
    expect(await shareWith({ share, writeClipboard }, msg)).toBe('shared');
    expect(share).toHaveBeenCalledWith({ text: msg.text, url: msg.url });
    expect(writeClipboard).not.toHaveBeenCalled();
  });

  it('a closed share sheet is "cancelled", with no clipboard fallback', async () => {
    const writeClipboard = vi.fn(() => Promise.resolve());
    const deps: ShareDeps = { share: () => Promise.reject(abort), writeClipboard };
    expect(await shareWith(deps, msg)).toBe('cancelled');
    expect(writeClipboard).not.toHaveBeenCalled();
  });

  it('falls back to the clipboard when there is no sheet, canShare says no, or share is refused', async () => {
    for (const deps of [
      {},
      { canShare: () => false, share: () => Promise.resolve() },
      { share: () => Promise.reject(denied) },
    ] as ShareDeps[]) {
      const writeClipboard = vi.fn(() => Promise.resolve());
      expect(await shareWith({ ...deps, writeClipboard }, msg)).toBe('copied');
      expect(writeClipboard).toHaveBeenCalledWith(`${msg.text} ${msg.url}`);
    }
  });

  it('then to the textarea copy, then fails cleanly', async () => {
    const writeClipboard = (): Promise<void> => Promise.reject(denied);
    const copyFallback = vi.fn(() => true);
    expect(await shareWith({ writeClipboard, copyFallback }, msg)).toBe('copied');
    expect(copyFallback).toHaveBeenCalledWith(`${msg.text} ${msg.url}`);
    expect(await shareWith({ writeClipboard, copyFallback: () => false }, msg)).toBe('failed');
    const throws = (): boolean => {
      throw new Error('x');
    };
    expect(await shareWith({ copyFallback: throws }, msg)).toBe('failed');
  });

  it('without a link shares the text alone', async () => {
    const share = vi.fn(() => Promise.resolve());
    await shareWith({ share }, { text: 'hi', url: '' });
    expect(share).toHaveBeenCalledWith({ text: 'hi' });
    expect(clipboardText({ text: 'hi', url: '' })).toBe('hi');
  });
});

import { describe, expect, it } from 'vitest';
import {
  canShowFullscreenButton,
  isIOS,
  isIPhone,
  shouldShowInstallBanner,
  type DeviceInfo,
} from './capabilities';

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
const IPAD =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';
const PIXEL =
  'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36';
const dev = (userAgent: string, o: Partial<DeviceInfo> = {}): DeviceInfo => ({
  userAgent,
  maxTouchPoints: 0,
  fullscreenApi: true,
  standalone: false,
  ...o,
});

describe('platform capabilities', () => {
  it('never shows a fullscreen button on iPhone, even if the API is reported', () => {
    expect(canShowFullscreenButton(dev(IPHONE, { fullscreenApi: false, maxTouchPoints: 5 }))).toBe(
      false,
    );
    expect(canShowFullscreenButton(dev(IPHONE, { fullscreenApi: true, maxTouchPoints: 5 }))).toBe(
      false,
    );
  });

  it('shows it on Android and desktop with the API, but not once installed', () => {
    expect(canShowFullscreenButton(dev(PIXEL, { maxTouchPoints: 5 }))).toBe(true);
    expect(canShowFullscreenButton(dev(PIXEL, { standalone: true }))).toBe(false);
    expect(canShowFullscreenButton(dev(PIXEL, { fullscreenApi: false }))).toBe(false);
  });

  it('offers Add to Home Screen on iPhone only, once, when not installed', () => {
    expect(shouldShowInstallBanner(dev(IPHONE), false)).toBe(true);
    expect(shouldShowInstallBanner(dev(IPHONE), true)).toBe(false);
    expect(shouldShowInstallBanner(dev(IPHONE, { standalone: true }), false)).toBe(false);
    expect(shouldShowInstallBanner(dev(PIXEL), false)).toBe(false);
    expect(shouldShowInstallBanner(dev(IPAD, { maxTouchPoints: 5 }), false)).toBe(false);
  });

  it('detects iPadOS by its touch points', () => {
    expect(isIOS(dev(IPAD, { maxTouchPoints: 5 }))).toBe(true);
    expect(isIOS(dev(IPAD))).toBe(false);
    expect(isIPhone(dev(IPHONE))).toBe(true);
  });
});

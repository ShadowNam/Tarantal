// v1.6 (D-042): the boot-time art gate's message. When the home biome's delivered art still
// fails after the bounded retries, a plain DOM panel says so and offers Retry: the game never
// starts on placeholders (dev and test builds can ask for them with ?art=placeholder). DOM, not
// Phaser: it shows before the game is created. Text comes in through i18n from the caller.

/** Shows the message with a Retry button; resolves when Retry is pressed (the panel goes). */
export function showArtError(message: string, retry: string): Promise<void> {
  return new Promise((resolve) => {
    const panel = document.createElement('div');
    panel.id = 'tm-art-error';
    panel.setAttribute('role', 'alertdialog');
    panel.style.cssText =
      'position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;' +
      'justify-content:center;gap:24px;padding:24px;background:#1B1410;color:#F3EAD3;' +
      'font:600 20px/1.4 system-ui,sans-serif;text-align:center;z-index:1000';
    const text = document.createElement('p');
    text.textContent = message;
    text.style.maxWidth = '36em';
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = retry;
    button.style.cssText =
      'font:800 22px system-ui,sans-serif;padding:14px 40px;border-radius:14px;' +
      'border:4px solid #1B1410;background:#D8A73A;color:#1B1410;cursor:pointer;min-height:56px';
    button.addEventListener('click', () => {
      panel.remove();
      resolve();
    });
    panel.append(text, button);
    document.body.append(panel);
    button.focus();
  });
}

/**
 * v1.6 (D-042): a small bar offering a reload when a new deploy took over the page. Bottom centre
 * above the safe-area inset (clear of the HUD's pause and skip buttons at the top), with × to
 * dismiss it. The caller never shows it in capture mode.
 */
export function showUpdateBar(message: string, reload: string, dismiss: string): void {
  if (document.getElementById('tm-update') !== null) return;
  const bar = document.createElement('div');
  bar.id = 'tm-update';
  bar.setAttribute('role', 'status');
  bar.style.cssText =
    'position:fixed;left:50%;bottom:calc(12px + env(safe-area-inset-bottom));' +
    'transform:translateX(-50%);display:flex;gap:12px;align-items:center;' +
    'max-width:calc(100vw - 32px);box-sizing:border-box;padding:8px 8px 8px 16px;' +
    'border-radius:14px;background:#1B1410;color:#F3EAD3;' +
    'font:600 18px system-ui,sans-serif;z-index:1000;box-shadow:0 4px 12px #0006';
  const text = document.createElement('span');
  text.textContent = message;
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = reload;
  button.style.cssText =
    'font:800 18px system-ui,sans-serif;padding:8px 20px;border-radius:10px;border:0;' +
    'background:#D8A73A;color:#1B1410;cursor:pointer;min-height:44px';
  button.addEventListener('click', () => {
    window.location.reload();
  });
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = '\u00D7';
  close.setAttribute('aria-label', dismiss);
  close.title = dismiss;
  close.style.cssText =
    'font:800 24px/1 system-ui,sans-serif;border:0;border-radius:10px;background:transparent;' +
    'color:#F3EAD3;cursor:pointer;min-width:44px;min-height:44px';
  close.addEventListener('click', () => {
    bar.remove();
  });
  bar.append(text, button, close);
  document.body.append(bar);
}

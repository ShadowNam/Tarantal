/** Small accessible player help panels; native modal focus keeps keys out of the canvas. */
export function playerDialog(options: {
  title: string;
  textScale?: number;
  lines: readonly string[];
  close: string;
  action?: { label: string; run: () => void };
  onClose: () => void;
}): () => void {
  const dialog = document.createElement('dialog');
  dialog.id = 'tm-player-help';
  dialog.style.cssText =
    'box-sizing:border-box;width:min(680px,94vw);max-height:88dvh;overflow:auto;border:2px solid #D8A73A;border-radius:16px;padding:24px;background:#F3EAD3;color:#1B1410;font:600 18px/1.5 system-ui;touch-action:pan-y';
  dialog.style.fontSize = `${18 * (options.textScale ?? 1)}px`;
  const heading = document.createElement('h2');
  heading.id = 'tm-player-help-title';
  heading.tabIndex = -1;
  heading.autofocus = true;
  heading.textContent = options.title;
  dialog.setAttribute('aria-labelledby', heading.id);
  dialog.append(heading);
  for (const line of options.lines) {
    const p = document.createElement('p');
    p.textContent = line;
    dialog.append(p);
  }
  let closed = false;
  const close = (): void => {
    if (closed) return;
    closed = true;
    dialog.close();
    dialog.remove();
    options.onClose();
  };
  const button = (label: string, run: () => void, confirm = false): void => {
    const b = document.createElement('button');
    b.textContent = label;
    b.dataset['action'] = confirm ? 'confirm' : 'back';
    b.style.cssText =
      'font:inherit;max-width:100%;white-space:normal;min-height:48px;padding:10px 18px;margin:8px;border-radius:8px;border:2px solid #483520;background:#D8A73A;color:#1B1410;cursor:pointer';
    b.onclick = run;
    dialog.append(b);
  };
  if (options.action) {
    const action = options.action;
    button(
      action.label,
      () => {
        close();
        action.run();
      },
      true,
    );
  }
  button(options.close, close);
  dialog.addEventListener('keydown', (event) => {
    event.stopPropagation();
  });
  dialog.addEventListener('keyup', (event) => {
    event.stopPropagation();
  });
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    close();
  });
  document.body.append(dialog);
  dialog.showModal();
  heading.focus({ preventScroll: true });
  dialog.scrollTop = 0;
  return close;
}

// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import { CopyModal } from '../src/ui';

// Obsidian's small DOM helpers, backed by a real DOM for modal interaction tests.
Object.assign(HTMLElement.prototype, {
  addClass(this: HTMLElement, cls: string) { this.classList.add(cls); },
  empty(this: HTMLElement) { this.replaceChildren(); },
  setText(this: HTMLElement, text: string) { this.textContent = text; },
  createEl(this: HTMLElement, tag: string, options: any = {}) {
    const el = document.createElement(tag);
    if (options.text) el.textContent = options.text;
    if (options.cls) el.className = options.cls;
    for (const [key, value] of Object.entries(options.attr ?? {})) el.setAttribute(key, String(value));
    this.append(el); return el;
  },
  createDiv(this: HTMLElement, options: any) { return this.createEl('div', options); },
  createSpan(this: HTMLElement, options: any) { return this.createEl('span', options); },
});
beforeEach(() => { document.body.innerHTML = ''; });
function fixture(vaults = [{ name: 'Research', path: '/Research', destination: '' }, { name: 'Archive', path: '/Archive', destination: 'Notes' }]) {
  const plugin = {
    settings: { lastTarget: '/Archive', targets: [] },
    targets: vi.fn().mockResolvedValue({ vaults }),
    request: vi.fn((selections, target, destination) => ({ selections, target, destination })),
    transfer: vi.fn().mockResolvedValue({ notes: 1, attachments: 0, renamed: [], warnings: [] }),
    saveSettings: vi.fn().mockResolvedValue(undefined),
  };
  const modal = new CopyModal({} as any, plugin as any, ['中文笔记.md']); modal.open();
  return { plugin, modal };
}
it('auto-selects the last vault and copies with one click without requiring preview', async () => {
  const { plugin } = fixture();
  await vi.waitFor(() => expect(document.body.textContent).toContain('复制到 Archive'));
  expect(document.querySelector('details')?.open).toBe(false);
  expect(document.body.textContent).toContain('放入：Notes');
  const copy = [...document.querySelectorAll('button')].find(b => b.textContent === '复制到 Archive')!;
  copy.click();
  await vi.waitFor(() => expect(plugin.saveSettings).toHaveBeenCalledOnce());
  expect(plugin.request).toHaveBeenCalledWith(['中文笔记.md'], expect.objectContaining({ path: '/Archive' }), 'Notes');
  expect(plugin.transfer).toHaveBeenCalledOnce();
  expect(document.body.children).toHaveLength(0);
});
it('switches the destination by clicking a vault and keeps manual entry collapsed', async () => {
  fixture();
  await vi.waitFor(() => expect(document.querySelectorAll('.vault-bridge-choice')).toHaveLength(2));
  (document.querySelector('.vault-bridge-choice') as HTMLButtonElement).click();
  expect(document.body.textContent).toContain('复制到 Research');
  expect(document.body.textContent).toContain('放入：库根目录');
  expect(document.querySelector('details')?.open).toBe(false);
});
it('disables copying when no vault was found', async () => {
  fixture([]);
  await vi.waitFor(() => expect(document.body.textContent).toContain('尚未发现其他 Vault'));
  expect((document.querySelector('.mod-cta') as HTMLButtonElement).disabled).toBe(true);
});

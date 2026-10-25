// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import { CopyModal } from '../src/ui';
import { createTranslator, LocalizedError, type Language } from '../src/i18n';
import NoteParcel from '../src/main';
import { FileSystemAdapter } from './mocks/obsidian';

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
function fixture(vaults = [{ name: 'Research', path: '/Research', destination: '' }, { name: 'Archive', path: '/Archive', destination: 'Notes' }], language: Language = 'zh-CN') {
  const plugin = {
    t: createTranslator(language),
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

it('uses English throughout the copy dialog and preserves user filenames', async () => {
  const { plugin } = fixture(undefined, 'en');
  await vi.waitFor(() => expect(document.body.textContent).toContain('Copy to Archive'));
  expect(document.body.textContent).toContain('Destination: Notes');
  expect(document.body.textContent).toContain('中文笔记.md');
  expect(document.body.textContent).toContain('View details');
  expect(document.body.textContent).toContain('Vault not listed? Add it manually');
  expect(document.querySelector('input')?.placeholder).toBe('Paste the destination vault path');
  plugin.transfer.mockRejectedValueOnce(new LocalizedError('路径无效或越界：{0}', '中文路径'));
  [...document.querySelectorAll('button')].find(b => b.textContent === 'Copy to Archive')!.click();
  await vi.waitFor(() => expect(document.body.textContent).toContain('Copy failed: Invalid path or path outside the vault: 中文路径'));
  expect(document.body.textContent).not.toContain('复制失败');
});

it('shows English empty-vault guidance', async () => {
  fixture([], 'en');
  await vi.waitFor(() => expect(document.body.textContent).toContain('No other vaults found.'));
  expect((document.querySelector('.mod-cta') as HTMLButtonElement).disabled).toBe(true);
});

it('switches the rendered settings and restores the saved language on reload', async () => {
  const app = { workspace: { on: () => {}, iterateAllLeaves: () => {} }, vault: { adapter: new FileSystemAdapter('/source') } };
  const plugin = new NoteParcel(app as any, {} as any);
  vi.spyOn(plugin, 'loadData').mockResolvedValue({ language: 'zh-CN', lastTarget: '/Archive', autoConvert: false });
  await plugin.onload();
  const tab = (plugin as any).settingTabs[0]; tab.display();
  expect(tab.containerEl.textContent).toContain('界面语言');
  expect(tab.containerEl.querySelector('select').value).toBe('zh-CN');
  const save = vi.spyOn(plugin, 'saveData');
  const select = tab.containerEl.querySelector('select'); select.value = 'en'; select.dispatchEvent(new Event('change'));
  await vi.waitFor(() => expect(tab.containerEl.textContent).toContain('Interface language'));
  expect(tab.containerEl.textContent).toContain('Automatically convert pasted math and tables');
  expect(tab.containerEl.querySelector('select').value).toBe('en');
  expect(plugin.settings.autoConvert).toBe(false);
  expect(plugin.settings.lastTarget).toBe('/Archive');
  const restored = new NoteParcel(app as any, {} as any);
  vi.spyOn(restored, 'loadData').mockResolvedValue(save.mock.lastCall![0]);
  await restored.onload();
  expect(restored.locale).toBe('en');
  expect((restored as any).commands).toHaveLength(4);
  expect((restored as any).commands[0].name).toBe("Copy current file's local path");
});


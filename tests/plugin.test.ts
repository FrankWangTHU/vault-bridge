// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import VaultBridge from '../src/main';
import { FileSystemAdapter } from './mocks/obsidian';
import * as path from 'node:path';
import { DRAG_MIME, parseDragPayload, sourceType } from '../src/drag';

let plugin: VaultBridge, handlers: Map<string, (...args: any[]) => void>;
beforeEach(async () => {
  handlers = new Map();
  const app = { workspace: { on: (event: string, callback: (...args: any[]) => void) => handlers.set(event, callback), iterateAllLeaves: () => {}, getActiveFile: () => ({ path: '中文 name.md' }) }, vault: { adapter: new FileSystemAdapter(path.resolve('vault')), configDir: '.obsidian', getMarkdownFiles: () => [] } };
  plugin = new VaultBridge(app as any, {} as any);
  await plugin.onload();
});
function paste(text: string, { position = 0, document = '', files = 0, handled = false } = {}) {
  const event = { defaultPrevented: handled, clipboardData: { files: { length: files }, getData: (type: string) => type === 'text/plain' ? text : '' }, preventDefault: vi.fn() };
  const editor = { getValue: () => document, posToOffset: () => position, getCursor: () => ({ line: 0, ch: position }), replaceSelection: vi.fn() };
  handlers.get('editor-paste')!(event, editor);
  return { event, editor };
}
describe('plugin events', () => {
  it('repairs the current note with one undoable edit and preserves code', () => {
    const text = '[ \\boxed{P(D)} ]\n\n- (P(\\theta))\n\n`(P(D))`';
    const editor = { getValue: () => text, offsetToPos: vi.fn(() => ({ line: 4, ch: 8 })), replaceRange: vi.fn() };
    (plugin as any).commands.find((c: any) => c.id === 'repair-current-note').editorCallback(editor);
    expect(editor.replaceRange).toHaveBeenCalledExactlyOnceWith('$$\n\\boxed{P(D)}\n$$\n\n- $P(\\theta)$\n\n`(P(D))`', { line: 0, ch: 0 }, { line: 4, ch: 8 });
  });
  it('carries selected files and resolved attachments across a sidebar drop', () => {
    document.body.innerHTML = '<div class="nav-files-container"><div class="nav-file-title is-selected" data-path="A.md"></div><div class="nav-file-title is-selected" data-path="B.md"></div><div class="nav-folder-title" data-path="Destination"></div></div>';
    const app = plugin.app as any;
    app.vault.getMarkdownFiles = () => [{ path: 'A.md' }, { path: 'B.md' }, { path: 'Unselected.md' }];
    app.metadataCache = { getFileCache: () => ({ embeds: [{ link: '图.png' }] }), getFirstLinkpathDest: () => ({ path: 'assets/图.png' }) };
    const data = new Map<string, string>();
    const dataTransfer = { setData: (k: string, v: string) => data.set(k, v), getData: (k: string) => data.get(k), get types() { return [...data.keys()]; }, effectAllowed: '', dropEffect: '' };
    const events = (plugin as any).domEvents;
    events.get('dragstart')({ target: document.querySelector('.nav-file-title'), dataTransfer });
    const payload = parseDragPayload(data.get(DRAG_MIME)!);
    expect(payload.selections).toEqual(['A.md', 'B.md']);
    expect(payload.resolved['A.md']['图.png']).toBe('assets/图.png');
    expect(payload.resolved).not.toHaveProperty('Unselected.md');
    const event = { target: document.querySelector('.nav-folder-title'), dataTransfer, preventDefault: vi.fn(), stopImmediatePropagation: vi.fn() };
    const receive = vi.spyOn(plugin, 'receiveDrag').mockResolvedValue();
    events.get('drop')(event);
    expect(receive).not.toHaveBeenCalled(); expect(event.preventDefault).not.toHaveBeenCalled();
    data.delete(sourceType(plugin.sourceRoot)); data.set(sourceType(path.resolve('other-vault')), '1');
    events.get('dragover')(event);
    expect(dataTransfer.dropEffect).toBe('copy');
    events.get('drop')(event);
    expect(receive).toHaveBeenCalledExactlyOnceWith(data.get(DRAG_MIME), 'Destination');
    expect(event.stopImmediatePropagation).toHaveBeenCalledTimes(2);
    receive.mockClear(); event.preventDefault.mockClear();
    plugin.settings.crossVaultDrag = false;
    events.get('drop')(event);
    expect(receive).not.toHaveBeenCalled(); expect(event.preventDefault).not.toHaveBeenCalled();
  });
  it('uses exactly one editor change for a converted paste', () => {
    const { event, editor } = paste('Text \\(x\\)');
    expect(event.preventDefault).toHaveBeenCalledOnce(); expect(editor.replaceSelection).toHaveBeenCalledExactlyOnceWith('Text $x$');
  });
  it('leaves ordinary, file, already handled and disabled pastes alone', () => {
    for (const result of [paste('ordinary'), paste('\\(x\\)', { files: 1 }), paste('\\(x\\)', { handled: true })]) {
      expect(result.event.preventDefault).not.toHaveBeenCalled(); expect(result.editor.replaceSelection).not.toHaveBeenCalled();
    }
    plugin.settings.autoConvert = false;
    expect(paste('\\(x\\)').event.preventDefault).not.toHaveBeenCalled();
  });
  it('does not intercept pastes in an existing code block or property block', () => {
    expect(paste('\\(x\\)', { document: '```md\ncode\n```', position: 7 }).event.preventDefault).not.toHaveBeenCalled();
    expect(paste('\\(x\\)', { document: '---\ntitle: here\n---', position: 9 }).event.preventDefault).not.toHaveBeenCalled();
  });
  it('copies native absolute paths with spaces and Chinese characters', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    await plugin.copyPath({ path: '目录/中文 name.md' } as any);
    expect(writeText).toHaveBeenCalledWith(path.resolve('vault', '目录/中文 name.md'));
  });
  it('registers file context menu entries and current-file commands', () => {
    const titles: string[] = [];
    handlers.get('file-menu')!({ addItem: (callback: (item: any) => void) => {
      const item = { setTitle: (title: string) => { titles.push(title); return item; }, setIcon: () => item, onClick: () => item }; callback(item);
    } }, { path: 'file.md' });
    expect(titles).toEqual(['复制本地绝对路径', '复制到其他 Vault…']);
    expect((plugin as any).commands.map((c: any) => c.id)).toEqual(['copy-current-local-path', 'copy-current-to-vault', 'convert-selection', 'repair-current-note']);
  });
});

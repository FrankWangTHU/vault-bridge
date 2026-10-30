// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import NoteParcel from '../src/main';
import { FileSystemAdapter } from './mocks/obsidian';
import * as path from 'node:path';
import { DRAG_MIME, parseDragPayload, sourceType } from '../src/drag';
import * as vaults from '../src/vaults';

let plugin: NoteParcel, handlers: Map<string, (...args: any[]) => void>;
beforeEach(async () => {
  handlers = new Map();
  const app = { workspace: { on: (event: string, callback: (...args: any[]) => void) => handlers.set(event, callback), iterateAllLeaves: () => {}, getActiveFile: () => ({ path: '中文 name.md' }) }, vault: { adapter: new FileSystemAdapter(path.resolve('vault')), configDir: '.obsidian', getMarkdownFiles: () => [] } };
  plugin = new NoteParcel(app as any, {} as any);
  await plugin.onload();
  await plugin.setLanguage('zh-CN');
});
function paste(text: string, { position = 0, document = '', files = 0, handled = false } = {}) {
  const event = { defaultPrevented: handled, clipboardData: { files: { length: files }, getData: (type: string) => type === 'text/plain' ? text : '' }, preventDefault: vi.fn() };
  const editor = { getValue: () => document, posToOffset: () => position, getCursor: () => ({ line: 0, ch: position }), replaceSelection: vi.fn() };
  handlers.get('editor-paste')!(event, editor);
  return { event, editor };
}
describe('plugin events', () => {
  it('defaults to per-note attachment folders for missing or invalid saved preferences', async () => {
    expect(plugin.settings.attachmentFolderMode).toBe('note');
    for (const saved of [{ autoConvert: false }, { attachmentFolderMode: 'invalid' }]) {
      const restored = new NoteParcel(plugin.app, {} as any);
      vi.spyOn(restored, 'loadData').mockResolvedValue(saved);
      await restored.onload();
      expect(restored.settings.attachmentFolderMode).toBe('note');
    }
  });
  it('passes the chosen attachment layout to context-menu copy requests', () => {
    plugin.settings.attachmentFolderMode = 'note';
    const request = plugin.request(['项目.md'], { name: 'Research', path: path.resolve('Research'), destination: '' }, 'Imported');
    expect(request.attachmentFolderMode).toBe('note');
    expect(request.selection).toEqual(['项目.md']);
    expect(request.destination).toBe('Imported');
  });
  it('uses the receiving vault attachment preference for drag-and-drop copies', async () => {
    const other = path.resolve('other-vault');
    const canonical = vi.spyOn(vaults, 'canonicalPath').mockResolvedValue(other);
    const targets = vi.spyOn(plugin, 'targets').mockResolvedValue({ vaults: [{ name: 'Other', path: other, destination: '' }] });
    const transfer = vi.spyOn(plugin, 'transfer').mockResolvedValue({ sourceRoot: other, targetRoot: plugin.sourceRoot, entries: [], directories: [], notes: 0, attachments: 0, warnings: [], renamed: [] });
    try {
      plugin.settings.attachmentFolderMode = 'note';
      await plugin.receiveDrag(JSON.stringify({ version: 1, sourceRoot: other, configDir: '.obsidian', selections: ['项目.md'], resolved: {} }), 'Imported');
      expect(transfer).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ attachmentFolderMode: 'note', sourceRoot: other, destination: 'Imported' }));
    } finally { canonical.mockRestore(); targets.mockRestore(); transfer.mockRestore(); }
  });
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
  it('collects linked Excalidraw dependencies in drag data without following ordinary notes', () => {
    document.body.innerHTML = '<div class="nav-files-container"><div class="nav-file-title" data-path="A.md"></div></div>';
    const app = plugin.app as any;
    const drawing = { path: 'assets/Plan.excalidraw.md' };
    app.vault.getMarkdownFiles = () => [{ path: 'A.md' }, drawing, { path: 'Ordinary.md' }];
    app.metadataCache = {
      getFileCache: (file: { path: string }) => file.path === 'A.md'
        ? { embeds: [{ link: 'assets/Plan.excalidraw#^frame=abc' }], links: [{ link: 'Ordinary' }] }
        : { embeds: [{ link: 'image.png' }, { link: 'assets/Plan.excalidraw' }] },
      getFirstLinkpathDest: vi.fn((link: string) => link === 'assets/Plan.excalidraw.md' ? drawing
        : link === 'Ordinary' ? { path: 'Ordinary.md' } : link === 'image.png' ? { path: 'assets/image.png' } : null),
    };
    const data = new Map<string, string>();
    (plugin as any).domEvents.get('dragstart')({ target: document.querySelector('.nav-file-title'), dataTransfer: {
      setData: (key: string, value: string) => data.set(key, value), effectAllowed: '',
    } });
    const payload = parseDragPayload(data.get(DRAG_MIME)!);
    expect(payload.resolved['A.md']['assets/Plan.excalidraw']).toBe(drawing.path);
    expect(payload.resolved[drawing.path]['image.png']).toBe('assets/image.png');
    expect(payload.resolved).not.toHaveProperty('Ordinary.md');
    expect(Object.keys(payload.resolved)).toHaveLength(2);
    const request = plugin.request(['A.md'], { name: 'Other', path: '/other', destination: '' }, '');
    expect(request.resolve('assets/Plan.excalidraw', 'A.md')).toBe(drawing.path);
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
  it('switches menus and commands immediately without changing command IDs or preferences', async () => {
    const ids = (plugin as any).commands.map((c: any) => c.id);
    plugin.settings.lastTarget = '/研究';
    const save = vi.spyOn(plugin, 'saveData');
    await plugin.setLanguage('en');
    const titles: string[] = [];
    handlers.get('file-menu')!({ addItem: (callback: (item: any) => void) => {
      const item = { setTitle: (title: string) => { titles.push(title); return item; }, setIcon: () => item, onClick: () => item }; callback(item);
    } }, { path: '中文.md' });
    expect(titles).toEqual(['Copy local absolute path', 'Copy to another vault…']);
    expect((plugin as any).commands.map((c: any) => c.name)).toEqual(["Copy current file's local path", 'Copy current note to another vault', 'Repair selected math and tables', 'Repair math in current note']);
    expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ language: 'en', lastTarget: '/研究' }));
    await plugin.setLanguage('zh-CN');
    expect((plugin as any).commands.map((c: any) => c.id)).toEqual(ids);
    expect((plugin as any).commands[0].name).toBe('复制当前文件本地路径');
  });
});


// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import VaultBridge from '../src/main';
import { FileSystemAdapter } from './mocks/obsidian';
import * as path from 'node:path';

let plugin: VaultBridge, handlers: Map<string, (...args: any[]) => void>;
beforeEach(async () => {
  handlers = new Map();
  const app = { workspace: { on: (event: string, callback: (...args: any[]) => void) => handlers.set(event, callback), getActiveFile: () => ({ path: '中文 name.md' }) }, vault: { adapter: new FileSystemAdapter(path.resolve('vault')) } };
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
    expect((plugin as any).commands.map((c: any) => c.id)).toEqual(['copy-current-local-path', 'copy-current-to-vault', 'convert-selection']);
  });
});

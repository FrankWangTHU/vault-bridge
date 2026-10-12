// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { DRAG_MIME, dropFolder, isCrossVaultDrag, parseDragPayload, resolveDraggedLink, sourceType } from '../src/drag';
it('only recognizes another vault, leaving same-vault and external drops alone', () => {
  expect(isCrossVaultDrag([DRAG_MIME, sourceType('/A')], '/A')).toBe(false);
  expect(isCrossVaultDrag([DRAG_MIME, sourceType('/A')], '/B')).toBe(true);
  expect(isCrossVaultDrag(['Files', 'text/uri-list'], '/B')).toBe(false);
});
it('validates payloads and refuses traversal', () => {
  const payload = { version: 1, sourceRoot: '/A', configDir: '.obsidian', selections: ['a.md'], resolved: { 'a.md': { 'picture.png': 'assets/picture.png' } } };
  const parsed = parseDragPayload(JSON.stringify(payload));
  expect(resolveDraggedLink(parsed, 'picture.png', 'a.md')).toBe('assets/picture.png');
  expect(resolveDraggedLink(parsed, 'toString', 'a.md')).toBeNull();
  expect(() => parseDragPayload(JSON.stringify({ ...payload, selections: ['../secret'] }))).toThrow();
  expect(() => parseDragPayload('{"version":2}')).toThrow();
});
it('resolves folder, file-parent, child-container and background drop positions', () => {
  document.body.innerHTML = '<div class="nav-files-container"><div id="root"></div><div class="nav-folder"><div class="nav-folder-title" data-path="Notes"><span id="folder">Notes</span></div><div class="nav-folder-children"><div id="children"></div><div class="nav-file-title" data-path="Notes/a.md"><span id="file">a</span></div></div></div></div><div id="editor"></div>';
  expect(dropFolder(document.getElementById('folder'))).toBe('Notes');
  expect(dropFolder(document.getElementById('file'))).toBe('Notes');
  expect(dropFolder(document.getElementById('children'))).toBe('Notes');
  expect(dropFolder(document.getElementById('root'))).toBe('');
  expect(dropFolder(document.getElementById('editor'))).toBeNull();
});

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { executeCopy, planCopy, type CopyRequest } from '../src/copy';

let temp: string, source: string, target: string;
async function put(root: string, relative: string, content = 'attachment bytes') {
  await fs.mkdir(path.dirname(path.join(root, relative)), { recursive: true });
  await fs.writeFile(path.join(root, relative), content);
}
const read = (root: string, relative: string) => fs.readFile(path.join(root, relative), 'utf8');
const request = (selection: string | string[], overrides: Partial<CopyRequest> = {}): CopyRequest => ({
  sourceRoot: source, targetRoot: target, selection, destination: 'Imported', resolve: link => link, ...overrides,
});

beforeEach(async () => {
  temp = await fs.mkdtemp(path.join(os.tmpdir(), 'noteparcel-issue1-'));
  source = path.join(temp, 'source'); target = path.join(temp, 'target');
  await fs.mkdir(path.join(source, '.obsidian'), { recursive: true });
  await fs.mkdir(path.join(target, '.obsidian'), { recursive: true });
});
afterEach(async () => {
  // Remove only the exact temporary root created by this test.
  if (path.dirname(temp) === os.tmpdir() && path.basename(temp).startsWith('noteparcel-issue1-')) await fs.rm(temp, { recursive: true, force: true });
});

describe('issue #1 attachment layout and drawing migration', () => {
  it('defaults to a separate attachment directory for each final note name', async () => {
    const original = '![[shared.png|300]] ![again](shared.png)';
    await put(source, 'one/同名.md', original); await put(source, 'two/同名.md', original); await put(source, 'shared.png');
    const plan = await planCopy(request(['one/同名.md', 'two/同名.md']));
    expect(plan.notes).toBe(2); expect(plan.attachments).toBe(2);
    await executeCopy(plan);
    expect(await read(target, 'Imported/同名.md')).toContain('![[Imported/assets/同名/shared.png|300]]');
    expect(await read(target, 'Imported/同名 (1).md')).toContain('![[Imported/assets/同名 (1)/shared.png|300]]');
    expect(await read(target, 'Imported/assets/同名/shared.png')).toBe('attachment bytes');
    expect(await read(target, 'Imported/assets/同名 (1)/shared.png')).toBe('attachment bytes');
    expect(await read(source, 'one/同名.md')).toBe(original);
    expect(await read(source, 'two/同名.md')).toBe(original);
  });

  it('keeps selected-folder internal attachments and places external ones beside the nested note', async () => {
    await put(source, 'Project/sub/Note.md', '![[Project/sub/local.pdf#page=2]] ![[external.png]]');
    await put(source, 'Project/sub/local.pdf'); await put(source, 'external.png');
    const plan = await planCopy(request('Project'));
    await executeCopy(plan);
    const note = await read(target, 'Imported/Project/sub/Note.md');
    expect(note).toContain('![[Imported/Project/sub/local.pdf#page=2]]');
    expect(note).toContain('![[Imported/Project/sub/assets/Note/external.png]]');
    expect(await read(target, 'Imported/Project/sub/local.pdf')).toBe('attachment bytes');
  });

  it('uses a renamed note basename, resolves attachment collisions and preserves existing files', async () => {
    await put(source, 'Note.md', '![[first/image.png|wide]] ![second](second/image.png "caption")');
    await put(source, 'first/image.png', 'first'); await put(source, 'second/image.png', 'second');
    await put(target, 'Imported/Note.md', 'existing note');
    await put(target, 'Imported/assets/Note (1)/image.png', 'existing image');
    const plan = await planCopy(request('Note.md'));
    await executeCopy(plan);
    const note = await read(target, 'Imported/Note (1).md');
    expect(note).toContain('![[Imported/assets/Note (1)/image (1).png|wide]]');
    expect(note).toContain('![second](<assets/Note%20(1)/image%20(2).png> "caption")');
    expect(await read(target, 'Imported/Note.md')).toBe('existing note');
    expect(await read(target, 'Imported/assets/Note (1)/image.png')).toBe('existing image');
    expect(await read(target, 'Imported/assets/Note (1)/image (1).png')).toBe('first');
    expect(await read(target, 'Imported/assets/Note (1)/image (2).png')).toBe('second');
  });

  it.each(['note', 'shared'] as const)('copies modern drawings in %s mode and retains frame selectors, widths and scene bytes', async mode => {
    const stem = 'assets/00-memo-of-PS9038/PS9038-floorplan.excalidraw';
    const scene = '```compressed-json\nUNCHANGED + scene / bytes ==\n```';
    const drawing = `---\nexcalidraw-plugin: parsed\n---\n%%\n# Excalidraw Data\n## Embedded Files\nimage-id: [[diagram.png]]\n\n## Drawing\n${scene}\n%%\n`;
    await put(source, 'Memo.md', `![[${stem}#^frame=cQC5sSvs|100%]]\n![[${stem}#^frame=OmAW3qW]]\n![preview](${stem}#^area=selected "drawing")`);
    await put(source, `${stem}.md`, drawing); await put(source, 'diagram.png', 'diagram');
    const folder = mode === 'note' ? 'Imported/assets/Memo' : 'Imported/_attachments/vault-bridge';
    await put(target, `${folder}/PS9038-floorplan.excalidraw.md`, 'existing drawing');
    const plan = await planCopy(request('Memo.md', { attachmentFolderMode: mode }));
    expect(plan.entries.filter(entry => entry.source === `${stem}.md`)).toHaveLength(1);
    await executeCopy(plan);
    const note = await read(target, 'Imported/Memo.md');
    expect(note).toContain(`![[${folder}/PS9038-floorplan.excalidraw (1).md#^frame=cQC5sSvs|100%]]`);
    expect(note).toContain(`![[${folder}/PS9038-floorplan.excalidraw (1).md#^frame=OmAW3qW]]`);
    expect(note).toContain('#^area=selected> "drawing")');
    const copiedDrawing = await read(target, `${folder}/PS9038-floorplan.excalidraw (1).md`);
    expect(copiedDrawing).toContain(`image-id: [[${folder}/diagram.png]]`);
    expect(copiedDrawing).toContain(scene);
    expect(await read(source, `${stem}.md`)).toBe(drawing);
    expect(await read(target, `${folder}/PS9038-floorplan.excalidraw.md`)).toBe('existing drawing');
  });

  it('imports nested drawing dependencies once despite cycles and excludes ordinary linked notes', async () => {
    await put(source, 'A.md', '![[Drawing.excalidraw.md]]');
    await put(source, 'Drawing.excalidraw.md', '## Embedded Files\n1: [[Nested.excalidraw.md]]\n2: [[photo.png]]\n[[Ordinary.md]]');
    await put(source, 'Nested.excalidraw.md', '## Embedded Files\n3: [[Drawing.excalidraw.md]]\n4: [[paper.pdf#page=4]]');
    await put(source, 'photo.png'); await put(source, 'paper.pdf'); await put(source, 'Ordinary.md', '![[must-not-copy.png]]');
    await put(source, 'must-not-copy.png');
    const plan = await planCopy(request('A.md'));
    expect(plan.entries.map(entry => entry.source).sort()).toEqual(['A.md', 'Drawing.excalidraw.md', 'Nested.excalidraw.md', 'paper.pdf', 'photo.png']);
    expect(plan.warnings.join('\n')).toContain('关联笔记未复制');
    await executeCopy(plan);
    expect(await read(target, 'Imported/assets/A/Nested.excalidraw.md')).toContain('[[Imported/assets/A/Drawing.excalidraw.md]]');
    expect(await read(target, 'Imported/assets/A/Nested.excalidraw.md')).toContain('[[Imported/assets/A/paper.pdf#page=4]]');
    expect(await read(target, 'Imported/assets/A/Drawing.excalidraw.md')).toContain('[[Ordinary.md]]');
  });

  it('keeps the shared-folder option deduplicated across notes, while note mode isolates their drawing dependencies', async () => {
    await put(source, 'A.md', '![[Drawing.excalidraw.md]]'); await put(source, 'B.md', '![[Drawing.excalidraw.md]]');
    await put(source, 'Drawing.excalidraw.md', '## Embedded Files\nid: [[photo.png]]'); await put(source, 'photo.png');
    const shared = await planCopy(request(['A.md', 'B.md'], { attachmentFolderMode: 'shared' }));
    expect(shared.entries.filter(entry => entry.source === 'Drawing.excalidraw.md')).toHaveLength(1);
    expect(shared.entries.filter(entry => entry.source === 'photo.png')).toHaveLength(1);
    const isolated = await planCopy(request(['A.md', 'B.md']));
    expect(isolated.entries.filter(entry => entry.source === 'Drawing.excalidraw.md')).toHaveLength(2);
    expect(isolated.entries.filter(entry => entry.source === 'photo.png')).toHaveLength(2);
    await executeCopy(isolated);
    expect(await read(target, 'Imported/assets/A/Drawing.excalidraw.md')).toContain('[[Imported/assets/A/photo.png]]');
    expect(await read(target, 'Imported/assets/B/Drawing.excalidraw.md')).toContain('[[Imported/assets/B/photo.png]]');
  });

  it('copies legacy JSON drawings as opaque attachments without parsing their contents', async () => {
    const original = '{"type":"excalidraw","text":"[[do-not-follow.png]]"}';
    await put(source, 'A.md', '![[legacy.excalidraw#^frame=old|100%]]'); await put(source, 'legacy.excalidraw', original);
    await put(source, 'do-not-follow.png');
    const plan = await planCopy(request('A.md'));
    expect(plan.entries.map(entry => entry.source)).toEqual(['A.md', 'legacy.excalidraw']);
    expect(plan.warnings.join('\n')).toContain('不解析内部依赖');
    await executeCopy(plan);
    expect(await read(target, 'Imported/assets/A/legacy.excalidraw')).toBe(original);
    expect(await read(target, 'Imported/A.md')).toContain('#^frame=old|100%]]');
  });

  it('excludes configuration files and unsafe links found inside a referenced drawing', async () => {
    await put(source, 'A.md', '![[Drawing.excalidraw.md]]');
    await put(source, 'Drawing.excalidraw.md', '## Embedded Files\n1: [[.obsidian/secret.png]]\n2: [[../outside.png]]\n3: [[safe.png]]');
    await put(source, '.obsidian/secret.png', 'private'); await put(temp, 'outside.png', 'outside'); await put(source, 'safe.png');
    const plan = await planCopy(request('A.md'));
    expect(plan.entries.map(entry => entry.source).sort()).toEqual(['A.md', 'Drawing.excalidraw.md', 'safe.png']);
    expect(plan.warnings.join('\n')).toContain('配置文件');
    expect(plan.warnings.join('\n')).toContain('无法复制');
    await executeCopy(plan);
    expect(await read(temp, 'outside.png')).toBe('outside');
  });

  it('rejects symlink drawing dependencies and symlink destinations for generated asset folders', async () => {
    await put(source, 'A.md', '![[linked/Drawing.excalidraw.md]]');
    await put(temp, 'outside/Drawing.excalidraw.md', 'outside drawing');
    await fs.symlink(path.join(temp, 'outside'), path.join(source, 'linked'), 'junction');
    const blocked = await planCopy(request('A.md'));
    expect(blocked.entries.map(entry => entry.source)).toEqual(['A.md']);
    expect(blocked.warnings.join('\n')).toContain('无法复制');
    await put(source, 'A.md', '![[photo.png]]'); await put(source, 'photo.png');
    await fs.mkdir(path.join(target, 'Imported'));
    await fs.symlink(path.join(temp, 'outside'), path.join(target, 'Imported/assets'), 'junction');
    await expect(planCopy(request('A.md'))).rejects.toThrow('符号链接');
    expect(await read(temp, 'outside/Drawing.excalidraw.md')).toBe('outside drawing');
  });

  it('refuses a changed drawing after planning and rolls back newly written notes', async () => {
    await put(source, 'A.md', '![[Drawing.excalidraw.md]]'); await put(source, 'Drawing.excalidraw.md', 'original drawing');
    const plan = await planCopy(request('A.md'));
    await put(source, 'Drawing.excalidraw.md', 'drawing changed after preview');
    await expect(executeCopy(plan)).rejects.toThrow('源文件已变化');
    await expect(fs.stat(path.join(target, 'Imported/A.md'))).rejects.toThrow();
    expect(await read(source, 'Drawing.excalidraw.md')).toBe('drawing changed after preview');
    expect((await fs.stat(path.join(target, '.obsidian'))).isDirectory()).toBe(true);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { executeCopy, planCopy, safeRelative, type CopyRequest } from '../src/copy';
vi.mock('node:fs/promises', async importOriginal => ({ ...await importOriginal<typeof fs>() }));

let temp: string, source: string, target: string;
async function put(root: string, file: string, text = 'bytes') {
  await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true });
  await fs.writeFile(path.join(root, file), text);
}
function request(selection: string, overrides: Partial<CopyRequest> = {}): CopyRequest {
  return { sourceRoot: source, targetRoot: target, selection, destination: '导入', resolve: link => link, ...overrides };
}
beforeEach(async () => {
  temp = await fs.mkdtemp(path.join(os.tmpdir(), 'vault-bridge-test-'));
  source = path.join(temp, 'source'); target = path.join(temp, 'target');
  await fs.mkdir(path.join(source, '.obsidian'), { recursive: true });
  await fs.mkdir(path.join(target, '.obsidian'), { recursive: true });
});
afterEach(async () => {
  vi.restoreAllMocks();
  // Only the exact mkdtemp root owned by this test is removed.
  if (path.dirname(temp) === os.tmpdir() && path.basename(temp).startsWith('vault-bridge-test-')) await fs.rm(temp, { recursive: true, force: true });
});

describe('cross-vault copies', () => {
  it('copies shared attachments once, rewrites aliases/anchors, preserves originals and auto-renames', async () => {
    const original = '![[assets/图 片.png|300]]\n![alt](assets/图%20片.png)\n[[elsewhere.md#Section|other]]\n![[missing.png]]';
    await put(source, '笔记.md', original); await put(source, 'assets/图 片.png', 'image'); await put(source, 'elsewhere.md', 'other note');
    await put(target, '导入/笔记.md', 'existing note'); await put(target, '导入/_attachments/vault-bridge/图 片.png', 'existing image');
    const plan = await planCopy(request('笔记.md', { resolve: link => link === 'missing.png' ? null : link }));
    expect(plan.notes).toBe(1); expect(plan.attachments).toBe(1); expect(plan.renamed).toHaveLength(2);
    expect(plan.warnings.join('\n')).toContain('关联笔记未复制'); expect(plan.warnings.join('\n')).toContain('missing.png');
    await executeCopy(plan);
    const imported = await fs.readFile(path.join(target, '导入/笔记 (1).md'), 'utf8');
    expect(imported).toContain('![[导入/_attachments/vault-bridge/图 片 (1).png|300]]');
    expect(imported).toContain('![alt](<_attachments/vault-bridge/%E5%9B%BE%20%E7%89%87%20(1).png>)');
    expect(imported).toContain('[[elsewhere.md#Section|other]]');
    expect(await fs.readFile(path.join(source, '笔记.md'), 'utf8')).toBe(original);
    expect(await fs.readFile(path.join(target, '导入/笔记.md'), 'utf8')).toBe('existing note');
    expect(await fs.readFile(path.join(target, '导入/_attachments/vault-bridge/图 片.png'), 'utf8')).toBe('existing image');
  });
  it('preserves nested/empty folders, internal links, distinct same-name attachments and remote links', async () => {
    await put(source, 'Folder/A.md', '[[Folder/sub/B.md#Header|B]] ![[one/p.png]] ![[two/p.png]] [web](https://example.com)');
    await put(source, 'Folder/sub/B.md', '![[Folder/sub/local.pdf#page=2]]');
    await put(source, 'Folder/sub/local.pdf'); await put(source, 'one/p.png', 'one'); await put(source, 'two/p.png', 'two');
    await fs.mkdir(path.join(source, 'Folder/empty'));
    await put(target, '导入/Folder/sub/B.md', 'existing');
    const plan = await planCopy(request('Folder'));
    await executeCopy(plan);
    expect(plan.entries).toHaveLength(5);
    expect(await fs.readFile(path.join(target, '导入/Folder/A.md'), 'utf8')).toContain('[[导入/Folder/sub/B (1).md#Header|B]]');
    expect(await fs.readFile(path.join(target, '导入/Folder/sub/B (1).md'), 'utf8')).toContain('[[导入/Folder/sub/local.pdf#page=2]]');
    expect(await fs.readFile(path.join(target, '导入/_attachments/vault-bridge/p (1).png'), 'utf8')).toBe('two');
    expect((await fs.stat(path.join(target, '导入/Folder/empty'))).isDirectory()).toBe(true);
  });
  it('rejects unsafe paths, same/nested vaults, invalid targets and config directories', async () => {
    for (const value of ['../escape', '/absolute', 'C:\\absolute', 'a/../../b', '.obsidian/config', 'a/NUL.txt']) expect(() => safeRelative(value)).toThrow();
    await put(source, 'a.md');
    await expect(planCopy(request('a.md', { targetRoot: source }))).rejects.toThrow('独立');
    await fs.mkdir(path.join(source, 'nested'));
    await expect(planCopy(request('a.md', { targetRoot: path.join(source, 'nested') }))).rejects.toThrow('独立');
    await expect(planCopy(request('a.md', { destination: '../outside' }))).rejects.toThrow('越界');
    await expect(planCopy(request('.obsidian/config'))).rejects.toThrow('配置');
    const invalid = path.join(temp, 'not-a-vault'); await fs.mkdir(invalid);
    await expect(planCopy(request('a.md', { targetRoot: invalid }))).rejects.toThrow('.obsidian');
  });
  it('refuses a source or destination directory symlink', async () => {
    await put(source, 'a.md', '![[linked/secret.png]]'); await put(source, 'assets/secret.png');
    await fs.symlink(path.join(source, 'assets'), path.join(source, 'linked'), 'junction');
    const plan = await planCopy(request('a.md'));
    expect(plan.attachments).toBe(0); expect(plan.warnings.join()).toContain('无法复制');
    await fs.symlink(path.join(source, 'assets'), path.join(target, 'unsafe'), 'junction');
    await expect(planCopy(request('a.md', { destination: 'unsafe' }))).rejects.toThrow('符号链接');
  });
  it('rolls back earlier files when a late target collision appears and preserves the new target', async () => {
    await put(source, 'Folder/a.md', 'a'); await put(source, 'Folder/b.md', 'b');
    const plan = await planCopy(request('Folder'));
    await put(target, plan.entries[1].destination, 'created after preview');
    await expect(executeCopy(plan)).rejects.toThrow('重新预览');
    await expect(fs.stat(path.join(target, plan.entries[0].destination))).rejects.toThrow();
    expect(await fs.readFile(path.join(target, plan.entries[1].destination), 'utf8')).toBe('created after preview');
  });
  it('rejects vaults reached through an ancestor directory junction', async () => {
    await put(source, 'a.md');
    await fs.mkdir(path.join(target, 'nested/.obsidian'), { recursive: true });
    const alias = path.join(temp, 'target-alias');
    await fs.symlink(target, alias, 'junction');
    await expect(planCopy(request('a.md', { targetRoot: path.join(alias, 'nested') }))).rejects.toThrow('符号链接');
  });
  it('rejects changed source content and removes only newly created empty folders', async () => {
    await put(source, 'a.md', 'old'); const plan = await planCopy(request('a.md'));
    await put(source, 'a.md', 'new content');
    await expect(executeCopy(plan)).rejects.toThrow('源文件已变化');
    await expect(fs.stat(path.join(target, '导入'))).rejects.toThrow();
    expect((await fs.stat(path.join(target, '.obsidian'))).isDirectory()).toBe(true);
  });
  it('rolls back on a mid-copy failure', async () => {
    await put(source, 'Folder/a.md'); await put(source, 'Folder/b.md');
    const plan = await planCopy(request('Folder'));
    await expect(executeCopy(plan, () => { throw new Error('simulated disk failure'); })).rejects.toThrow('回滚');
    await expect(fs.stat(path.join(target, '导入'))).rejects.toThrow();
  });
  it('detects case-insensitive filename collisions even on Linux', async () => {
    await put(source, 'Note.md'); await put(target, '导入/note.md', 'existing');
    const plan = await planCopy(request('Note.md'));
    expect(plan.entries[0].destination).toBe('导入/Note (1).md');
  });
  it('encodes filename characters that would otherwise become wiki anchors', async () => {
    await put(source, 'note.md', '![[image%23part.png]] ![image](image%23part.png)');
    await put(source, 'image#part.png');
    const plan = await planCopy(request('note.md'));
    expect(plan.entries[0].content).toContain('![[导入/_attachments/vault-bridge/image%23part.png]]');
    expect(plan.entries[0].content).toContain('![image](<_attachments/vault-bridge/image%23part.png>)');
  });
  it('handles a destination with insufficient write permission without changing existing files', async () => {
    await put(source, 'a.md');
    await put(target, '导入/keep.txt', 'keep');
    const plan = await planCopy(request('a.md'));
    vi.spyOn(fs, 'open').mockRejectedValueOnce(Object.assign(new Error('permission denied'), { code: 'EACCES' }));
    await expect(executeCopy(plan)).rejects.toThrow('permission denied');
    expect(await fs.readFile(path.join(target, '导入/keep.txt'), 'utf8')).toBe('keep');
  });
});

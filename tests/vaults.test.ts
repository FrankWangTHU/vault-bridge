import { afterEach, beforeEach, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { discoverVaults, listTargetFolders } from '../src/vaults';
let temp: string, current: string, other: string, registry: string;
beforeEach(async () => {
  temp = await fs.mkdtemp(path.join(os.tmpdir(), 'vault-bridge-registry-'));
  current = path.join(temp, 'Current'); other = path.join(temp, 'Other'); registry = path.join(temp, 'obsidian.json');
  await fs.mkdir(path.join(current, '.obsidian'), { recursive: true }); await fs.mkdir(path.join(other, '.obsidian'), { recursive: true });
  await fs.writeFile(registry, JSON.stringify({ vaults: { a: { path: current }, b: { path: other, open: true }, c: { path: other }, d: { path: path.join(temp, 'missing') } } }));
});
afterEach(async () => {
  if (path.dirname(temp) === os.tmpdir() && path.basename(temp).startsWith('vault-bridge-registry-')) await fs.rm(temp, { recursive: true, force: true });
});
it('detects real registered vaults, deduplicates, hides current and stale entries, preserves preferences', async () => {
  const result = await discoverVaults(current, [{ name: 'My library', path: other, destination: 'Notes' }], registry);
  expect(result.vaults).toHaveLength(1);
  expect(result.vaults[0]).toMatchObject({ name: 'My library', destination: 'Notes', open: true });
});
it('falls back to saved vaults when the registry is missing or corrupt', async () => {
  await fs.writeFile(registry, 'broken');
  const result = await discoverVaults(current, [{ name: 'Other', path: other, destination: '' }], registry);
  expect(result.warning).toBeTruthy(); expect(result.vaults).toHaveLength(1);
});
it('browses one level at a time and excludes config folders and junctions', async () => {
  await fs.mkdir(path.join(other, 'Notes/sub'), { recursive: true });
  await fs.symlink(current, path.join(other, 'alias'), 'junction');
  expect(await listTargetFolders(other)).toEqual(['Notes']);
  expect(await listTargetFolders(other, 'Notes')).toEqual(['Notes/sub']);
  await expect(listTargetFolders(other, 'alias')).rejects.toThrow('符号链接');
  await expect(listTargetFolders(other, '../Current')).rejects.toThrow();
});

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { safeRelative } from './copy';

export interface TargetVault { name: string; path: string; destination: string; open?: boolean }
export function registryPath(): string {
  // Obsidian has no public API for the vault switcher's registry.
  // Prefer Electron's actual profile location, with documented OS locations as fallback.
  try {
    const electron = require('electron');
    const app = electron.app ?? electron.remote?.app;
    if (app?.getPath) return path.join(app.getPath('userData'), 'obsidian.json');
  } catch { /* Non-Electron environments, including tests. */ }
  const base = process.platform === 'win32' ? process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming')
    : process.platform === 'darwin' ? path.join(os.homedir(), 'Library', 'Application Support')
      : process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config');
  return path.join(base, 'obsidian', 'obsidian.json');
}
export async function canonicalPath(value: string): Promise<string> {
  return path.resolve(await fs.realpath(value));
}
export function samePath(left: string, right: string): boolean {
  return process.platform === 'win32' ? path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase() : path.resolve(left) === path.resolve(right);
}
export async function discoverVaults(current: string, saved: TargetVault[] = [], registry = registryPath()): Promise<{ vaults: TargetVault[]; warning?: string }> {
  const candidates: TargetVault[] = [];
  let warning: string | undefined;
  try {
    const json = JSON.parse(await fs.readFile(registry, 'utf8'));
    if (!json.vaults || typeof json.vaults !== 'object') throw new Error('Vault 列表格式未知');
    for (const value of Object.values(json.vaults) as any[]) {
      if (typeof value?.path === 'string' && path.isAbsolute(value.path)) candidates.push({ name: path.basename(value.path), path: value.path, destination: '', open: value.open === true });
    }
  } catch { warning = '未能读取 Obsidian 的库列表，可手动添加目标库。'; }
  candidates.push(...saved);
  let own = current;
  try { own = await canonicalPath(current); } catch { /* Current adapter can be unavailable during startup. */ }
  const vaults: TargetVault[] = [];
  for (const candidate of candidates) {
    try {
      if (!path.isAbsolute(candidate.path)) continue;
      const real = await canonicalPath(candidate.path);
      if (samePath(real, own) || !(await fs.stat(path.join(real, '.obsidian'))).isDirectory()) continue;
      const existing = vaults.find(v => samePath(v.path, real));
      const preference = saved.find(v => samePath(v.path, candidate.path));
      if (existing) { if (preference) Object.assign(existing, { name: preference.name, destination: preference.destination }); continue; }
      vaults.push({ ...candidate, path: real, name: preference?.name || candidate.name, destination: preference?.destination ?? '' });
    } catch { /* Stale registry entries, disconnected drives and unavailable vaults are omitted. */ }
  }
  return { vaults: vaults.sort((a, b) => Number(!!b.open) - Number(!!a.open) || a.name.localeCompare(b.name)), warning };
}
export async function listTargetFolders(root: string, current = ''): Promise<string[]> {
  const relative = safeRelative(current, true);
  let probe = root;
  for (const part of relative.split('/').filter(Boolean)) {
    probe = path.join(probe, part);
    if ((await fs.lstat(probe)).isSymbolicLink()) throw new Error('不能选择符号链接文件夹。');
  }
  return (await fs.readdir(probe, { withFileTypes: true }))
    .filter(entry => entry.isDirectory() && !entry.isSymbolicLink() && !entry.name.startsWith('.'))
    .map(entry => relative ? `${relative}/${entry.name}` : entry.name).sort((a, b) => a.localeCompare(b));
}

import { createHash } from 'node:crypto';
import { safeRelative } from './copy';
export const DRAG_MIME = 'application/x-vault-bridge+json';
export interface DragPayload {
  version: 1;
  sourceRoot: string;
  configDir: string;
  selections: string[];
  resolved: Record<string, Record<string, string>>;
}
export function sourceType(root: string): string {
  const normalized = root.replace(/\\/g, '/').replace(/\/$/, '');
  return `application/x-vault-bridge-source-${createHash('sha256').update(process.platform === 'win32' ? normalized.toLowerCase() : normalized).digest('hex')}`;
}
export function isCrossVaultDrag(types: readonly string[], ownRoot: string): boolean {
  return types.includes(DRAG_MIME) && !types.includes(sourceType(ownRoot));
}
export function parseDragPayload(raw: string): DragPayload {
  if (!raw || raw.length > 8_000_000) throw new Error('拖拽数据为空或过大，请使用右键复制。');
  const data = JSON.parse(raw);
  if (data?.version !== 1 || typeof data.sourceRoot !== 'string' || typeof data.configDir !== 'string'
    || !Array.isArray(data.selections) || !data.selections.length || data.selections.length > 10000
    || !data.resolved || typeof data.resolved !== 'object' || Array.isArray(data.resolved)) throw new Error('无法识别拖拽数据，请确认两边启用了新版 NoteParcel。');
  data.selections.forEach((p: unknown) => { if (typeof p !== 'string') throw new Error('文件路径无效'); safeRelative(p); });
  return data as DragPayload;
}
export function resolveDraggedLink(data: DragPayload, link: string, source: string): string | null {
  if (!Object.prototype.hasOwnProperty.call(data.resolved, source)) return null;
  const entries = data.resolved[source];
  if (!entries || !Object.prototype.hasOwnProperty.call(entries, link)) return null;
  return typeof entries[link] === 'string' ? entries[link] : null;
}
export function explorerItem(target: EventTarget | null): HTMLElement | null {
  // Use nodeType instead of instanceof so detached Obsidian windows also work.
  const element = target as HTMLElement | null;
  return element?.nodeType === 1 ? element.closest<HTMLElement>('.nav-file-title[data-path], .nav-folder-title[data-path]') : null;
}
export function dropFolder(target: EventTarget | null): string | null {
  const element = target as HTMLElement | null;
  if (element?.nodeType !== 1 || !element.closest('.nav-files-container')) return null;
  const item = explorerItem(target);
  if (item?.classList.contains('nav-folder-title')) return item.dataset.path === '/' ? '' : item.dataset.path ?? '';
  if (item?.classList.contains('nav-file-title')) {
    const value = item.dataset.path ?? '';
    return value.includes('/') ? value.slice(0, value.lastIndexOf('/')) : '';
  }
  // A folder's children area is a folder target; only explorer background means vault root.
  const folder = element.closest('.nav-folder')?.querySelector<HTMLElement>(':scope > .nav-folder-title[data-path]');
  return folder && folder.dataset.path !== '/' ? folder.dataset.path ?? '' : '';
}

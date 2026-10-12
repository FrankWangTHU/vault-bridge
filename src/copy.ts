import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { extractLinks, isExternal, splitTarget, type NoteLink } from './markdown';

export interface CopyRequest {
  sourceRoot: string;
  targetRoot: string;
  selection: string | string[];
  destination: string;
  configDir?: string;
  resolve: (link: string, source: string) => string | null;
}
export interface CopyEntry {
  source: string;
  destination: string;
  size: number;
  mtime: number;
  digest?: string;
  content?: string;
}
export interface CopyPlan {
  sourceRoot: string;
  targetRoot: string;
  entries: CopyEntry[];
  directories: string[];
  warnings: string[];
  renamed: { from: string; to: string }[];
  notes: number;
  attachments: number;
}
const excluded = new Set(['.obsidian', '.git', '.trash']);
const key = (value: string) => value.normalize('NFC').toLocaleLowerCase('en-US');
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

export function safeRelative(value: string, allowEmpty = false): string {
  const normalized = value.replace(/\\/g, '/').replace(/\/$/, '');
  if (allowEmpty && !normalized) return '';
  if (!normalized || normalized.startsWith('/') || normalized.split('/').some(p =>
    !p || p === '.' || p === '..' || /[<>:"|?*\x00-\x1f]/.test(p) || /[. ]$/.test(p) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p))) {
    throw new Error(`路径无效或越界：${value}`);
  }
  if (normalized.split('/').some(p => excluded.has(p.toLowerCase()))) throw new Error(`不能复制到或读取配置目录：${value}`);
  return normalized;
}
async function statOrNull(file: string) {
  try { return await fs.lstat(file); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
}
async function checkPath(root: string, relative: string): Promise<void> {
  // Walk every component: following an intermediate symlink can escape the vault.
  let current = root;
  const rootStat = await fs.lstat(root);
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) throw new Error('Vault 根目录必须是普通目录，不能是符号链接。');
  let ancestor = path.dirname(path.resolve(root));
  while (true) {
    if ((await fs.lstat(ancestor)).isSymbolicLink()) throw new Error('Vault 路径包含符号链接，请使用真实路径。');
    const parent = path.dirname(ancestor);
    if (parent === ancestor) break;
    ancestor = parent;
  }
  const pieces = relative ? safeRelative(relative).split('/') : [];
  for (let i = 0; i < pieces.length; i++) {
    current = path.join(current, pieces[i]);
    const stat = await statOrNull(current);
    if (!stat) break;
    if (stat.isSymbolicLink()) throw new Error(`不能使用符号链接：${current}`);
    if (i < pieces.length - 1 && !stat.isDirectory()) throw new Error(`父路径不是文件夹：${current}`);
  }
}
function isWithin(parent: string, child: string): boolean {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith(`..${path.sep}`) && rel !== '..' && !path.isAbsolute(rel));
}
async function existingCaseInsensitive(root: string, relative: string): Promise<boolean> {
  let current = root;
  const pieces = relative.split('/');
  for (const [index, piece] of pieces.entries()) {
    const stat = await statOrNull(current);
    if (!stat) return false;
    if (!stat.isDirectory() || stat.isSymbolicLink()) return true;
    const match = (await fs.readdir(current)).find(name => key(name) === key(piece));
    if (!match) return false;
    // Don't silently merge differently-cased directory names on Unix.
    if (match !== piece && index < pieces.length - 1) throw new Error(`目标目录大小写冲突：${relative}`);
    current = path.join(current, match);
  }
  return true;
}

export async function planCopy(request: CopyRequest): Promise<CopyPlan> {
  if (!path.isAbsolute(request.sourceRoot) || !path.isAbsolute(request.targetRoot)) throw new Error('请填写 Vault 的绝对路径。');
  let sourceRoot = path.resolve(request.sourceRoot), targetRoot = path.resolve(request.targetRoot);
  const selections = [...new Set((Array.isArray(request.selection) ? request.selection : [request.selection]).map(p => safeRelative(p)))];
  if (!selections.length) throw new Error('请先选择文件或文件夹。');
  const roots = selections.filter(p => !selections.some(other => p !== other && p.startsWith(`${other}/`)));
  const destination = safeRelative(request.destination.trim(), true);
  const configDir = request.configDir ?? '.obsidian';
  const isConfig = (relative: string) => relative === configDir || relative.startsWith(`${configDir}/`) || relative.split('/').some(p => excluded.has(p.toLowerCase()));
  if (roots.some(isConfig)) throw new Error('不能复制 Vault 配置目录。');
  for (const selection of roots) await checkPath(sourceRoot, selection);
  await checkPath(targetRoot, destination);
  // Windows short (8.3) names are legitimate aliases, not symbolic links.
  // Canonicalize only after checking actual link types, then compare vault roots.
  sourceRoot = await fs.realpath(sourceRoot);
  targetRoot = await fs.realpath(targetRoot);
  if (isWithin(sourceRoot, targetRoot) || isWithin(targetRoot, sourceRoot)) throw new Error('目标必须是独立的其他 Vault，不能与源 Vault 相同或相互嵌套。');
  const marker = await statOrNull(path.join(targetRoot, '.obsidian'));
  if (!marker?.isDirectory() || marker.isSymbolicLink()) throw new Error('目标目录不是可识别的 Vault：需包含普通 .obsidian 文件夹。');
  const files: string[] = [], folders: string[] = [], warnings: string[] = [];
  const baseByRoot = new Map<string, string>();
  async function collect(relative: string) {
    if (isConfig(relative)) { warnings.push(`已跳过配置目录：${relative}`); return; }
    safeRelative(relative);
    const stat = await fs.lstat(path.join(sourceRoot, relative));
    if (stat.isSymbolicLink()) { warnings.push(`已跳过符号链接：${relative}`); return; }
    if (stat.isDirectory()) {
      folders.push(relative);
      for (const name of (await fs.readdir(path.join(sourceRoot, relative))).sort()) await collect(`${relative}/${name}`);
    } else if (stat.isFile()) files.push(relative);
    else warnings.push(`已跳过特殊文件：${relative}`);
  }
  for (const selection of roots) {
    baseByRoot.set(selection, (await fs.lstat(path.join(sourceRoot, selection))).isDirectory() ? path.posix.dirname(selection) : '');
    await collect(selection);
  }
  const selected = new Set(files), allFiles = new Set(files);
  const documents = new Map<string, { text: string; links: { ref: NoteLink; resolved: string | null }[] }>();
  for (const file of files.filter(p => p.toLowerCase().endsWith('.md'))) {
    const text = await fs.readFile(path.join(sourceRoot, file), 'utf8');
    const links: { ref: NoteLink; resolved: string | null }[] = [];
    for (const ref of extractLinks(text)) {
      if (isExternal(ref.target)) continue;
      const { path: linkpath } = splitTarget(ref.target);
      if (!linkpath) continue;
      const resolved = request.resolve(linkpath, file);
      if (!resolved) { warnings.push(`${file}：找不到链接 ${ref.target}`); links.push({ ref, resolved: null }); continue; }
      if (isConfig(resolved)) { warnings.push(`${file}：已跳过配置文件 ${resolved}`); continue; }
      try {
        safeRelative(resolved);
        await checkPath(sourceRoot, resolved);
        const stat = await fs.lstat(path.join(sourceRoot, resolved));
        if (!stat.isFile()) throw new Error('不是普通文件');
      } catch { warnings.push(`${file}：无法复制附件或链接目标 ${resolved}`); continue; }
      if (!resolved.toLowerCase().endsWith('.md')) allFiles.add(resolved);
      else if (!selected.has(resolved)) warnings.push(`${file}：关联笔记未复制 ${resolved}（原链接保留，目标库可能存在同名笔记）`);
      links.push({ ref, resolved });
    }
    if (/^---\r?\n/.test(text)) warnings.push(`${file}：属性区链接不参与附件收集，请核对需要的附件。`);
    if (/<(?:img|a)\s/i.test(text)) warnings.push(`${file}：HTML 标签中的附件链接不参与复制。`);
    documents.set(file, { text, links });
  }
  const mapping = new Map<string, string>(), reserved = new Set<string>(), renamed: CopyPlan['renamed'] = [];
  const join = (...parts: string[]) => parts.filter(Boolean).join('/');
  const candidateFor = (source: string) => {
    if (!selected.has(source) && !folders.includes(source)) return join(destination, '_attachments', 'vault-bridge', path.posix.basename(source));
    const owner = roots.find(root => source === root || source.startsWith(`${root}/`))!;
    const base = baseByRoot.get(owner)!;
    return join(destination, base ? path.posix.relative(base, source) : path.posix.basename(source));
  };
  // Check directory structure first so files cannot be mapped beneath a file or symlink.
  const directories = new Set(folders.map(candidateFor));
  for (const source of allFiles) {
    let parent = path.posix.dirname(candidateFor(source));
    while (parent !== '.') { directories.add(parent); parent = path.posix.dirname(parent); }
  }
  const directoryKeys = new Set([...directories].map(key));
  for (const source of allFiles) {
    const desired = safeRelative(candidateFor(source));
    let candidate = desired, counter = 1;
    const ext = path.posix.extname(desired), stem = desired.slice(0, desired.length - ext.length);
    while (reserved.has(key(candidate)) || directoryKeys.has(key(candidate)) || await existingCaseInsensitive(targetRoot, candidate)) {
      candidate = `${stem} (${counter++})${ext}`;
    }
    await checkPath(targetRoot, candidate);
    reserved.add(key(candidate)); mapping.set(source, candidate);
    if (desired !== candidate) renamed.push({ from: desired, to: candidate });
    const parent = path.posix.dirname(candidate);
    if (parent !== '.') directories.add(parent);
  }
  for (const directory of directories) {
    await checkPath(targetRoot, directory);
    const stat = await statOrNull(path.join(targetRoot, directory));
    if (stat && !stat.isDirectory()) throw new Error(`目标位置有同名文件，不能作为文件夹：${directory}`);
    await existingCaseInsensitive(targetRoot, directory);
  }
  const entries: CopyEntry[] = [];
  for (const [source, dest] of mapping) {
    const stat = await fs.stat(path.join(sourceRoot, source));
    const entry: CopyEntry = { source, destination: dest, size: stat.size, mtime: stat.mtimeMs };
    const document = documents.get(source);
    if (document) {
      entry.digest = hash(document.text);
      let content = document.text;
      for (const { ref, resolved } of [...document.links].reverse()) {
        const newTarget = resolved && mapping.get(resolved);
        if (!newTarget) continue;
        const suffix = splitTarget(ref.target).suffix;
        let replacement: string;
        if (ref.kind === 'wiki') {
          const wikiTarget = newTarget.replace(/[%#^\[\]|]/g, char => encodeURIComponent(char));
          replacement = `${ref.embed ? '!' : ''}[[${wikiTarget}${suffix}${ref.label ? `|${ref.label}` : ''}]]`;
        }
        else {
          const relative = path.posix.relative(path.posix.dirname(dest), newTarget);
          const encoded = relative.split('/').map(encodeURIComponent).join('/');
          const title = ref.title ? ` "${ref.title.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"` : '';
          replacement = `${ref.embed ? '!' : ''}[${ref.label}](<${encoded}${suffix}>${title})`;
        }
        content = content.slice(0, ref.start) + replacement + content.slice(ref.end);
      }
      entry.content = content;
    }
    entries.push(entry);
  }
  for (const file of files) if (/\.(canvas|excalidraw)$/i.test(file)) warnings.push(`${file}：作为普通文件复制，不解析内部依赖。`);
  return { sourceRoot, targetRoot, entries, directories: [...directories], warnings: [...new Set(warnings)], renamed, notes: documents.size, attachments: entries.length - documents.size };
}

export async function executeCopy(plan: CopyPlan, progress?: (done: number, total: number) => void): Promise<void> {
  const createdFiles: { absolute: string; dev: number; ino: number }[] = [], createdDirs: string[] = [];
  async function ensureDir(relative: string) {
    let current = '';
    for (const part of safeRelative(relative).split('/')) {
      current = current ? `${current}/${part}` : part;
      await checkPath(plan.targetRoot, current);
      const absolute = path.join(plan.targetRoot, current);
      try { await fs.mkdir(absolute); createdDirs.push(absolute); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST' || !(await fs.lstat(absolute)).isDirectory()) throw error;
      }
    }
  }
  try {
    await checkPath(plan.targetRoot, '');
    for (const dir of plan.directories) await ensureDir(dir);
    for (const [index, entry] of plan.entries.entries()) {
      await checkPath(plan.sourceRoot, entry.source);
      await checkPath(plan.targetRoot, entry.destination);
      const source = path.join(plan.sourceRoot, entry.source), target = path.join(plan.targetRoot, entry.destination);
      const stat = await fs.stat(source);
      if (stat.size !== entry.size || stat.mtimeMs !== entry.mtime) throw new Error(`源文件已变化，请重新预览：${entry.source}`);
      const bytes = await fs.readFile(source);
      if (entry.digest && hash(bytes.toString('utf8')) !== entry.digest) throw new Error(`笔记已变化，请重新预览：${entry.source}`);
      if (await existingCaseInsensitive(plan.targetRoot, entry.destination)) throw new Error(`目标已出现同名文件，请重新预览：${entry.destination}`);
      // Exclusive creation prevents overwriting a file created after the preview.
      const handle = await fs.open(target, 'wx');
      try {
        const own = await handle.stat();
        createdFiles.push({ absolute: target, dev: own.dev, ino: own.ino });
        await handle.writeFile(entry.content ?? bytes);
      } finally { await handle.close(); }
      progress?.(index + 1, plan.entries.length);
    }
  } catch (error) {
    const cleanupErrors: string[] = [];
    for (const file of createdFiles.reverse()) {
      try {
        await checkPath(plan.targetRoot, path.relative(plan.targetRoot, file.absolute));
        const current = await statOrNull(file.absolute);
        if (current?.dev === file.dev && current.ino === file.ino) await fs.unlink(file.absolute);
      } catch { cleanupErrors.push(file.absolute); }
    }
    for (const dir of createdDirs.reverse()) {
      try { await checkPath(plan.targetRoot, path.relative(plan.targetRoot, dir)); await fs.rmdir(dir); }
      catch { /* Never recursively remove a directory: other files may have appeared. */ }
    }
    throw new Error(`${error instanceof Error ? error.message : String(error)}${cleanupErrors.length ? `；部分新文件未能清理，请检查：${cleanupErrors.join('、')}` : '；本次已写入文件已回滚。'}`);
  }
}

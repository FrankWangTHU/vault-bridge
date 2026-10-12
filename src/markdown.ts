import { fromMarkdown } from 'mdast-util-from-markdown';
import type { RootContent, Root } from 'mdast';

export interface Range { start: number; end: number }
export interface NoteLink extends Range {
  target: string;
  kind: 'wiki' | 'markdown';
  embed: boolean;
  label: string;
  title?: string | null;
}
type Node = Root | RootContent;
function walk(node: Node, fn: (node: Node) => void) {
  fn(node);
  if ('children' in node) for (const child of node.children) walk(child as Node, fn);
}
export function frontmatterRange(text: string): Range | undefined {
  const match = /^(?:\uFEFF)?---\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)(?:\r?\n|$)/.exec(text);
  return match ? { start: 0, end: match[0].length } : undefined;
}
export function protectedRanges(text: string): Range[] {
  const ranges: Range[] = [];
  const fm = frontmatterRange(text);
  if (fm) ranges.push(fm);
  else if (/^(?:\uFEFF)?---\r?\n/.test(text)) ranges.push({ start: 0, end: text.length });
  walk(fromMarkdown(text), node => {
    if (node.type === 'code' || node.type === 'inlineCode' || node.type === 'html') {
      ranges.push({ start: node.position!.start.offset!, end: node.position!.end.offset! });
    }
  });
  // Existing dollar-delimited math must remain byte-for-byte unchanged.
  const dollars = /(?<![\\$])\$\$(?!\$)[\s\S]*?(?<!\\)\$\$|(?<![\\$])\$(?!\$)[^\n]*?(?<![\\$])\$(?!\$)/g;
  for (const m of text.matchAll(dollars)) ranges.push({ start: m.index!, end: m.index! + m[0].length });
  return ranges.sort((a, b) => a.start - b.start);
}
export function isProtectedPosition(text: string, start: number, end = start): boolean {
  if (protectedRanges(text).some(r => start < r.end && end >= r.start)) return true;
  // At EOF a still-open fence ends at the cursor; insertion is nevertheless inside it.
  let fence: { char: string; size: number } | undefined;
  for (const line of text.slice(0, start).split('\n')) {
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (!marker) continue;
    if (!fence) fence = { char: marker[1][0], size: marker[1].length };
    else if (marker[1][0] === fence.char && marker[1].length >= fence.size && !marker[2].trim()) fence = undefined;
  }
  if (fence) return true;
  // An unfinished frontmatter block is also a protected editor context.
  return /^(?:\uFEFF)?---\r?\n/.test(text) && !frontmatterRange(text);
}
export function extractLinks(text: string): NoteLink[] {
  const links: NoteLink[] = [];
  const ranges = protectedRanges(text);
  const tree = fromMarkdown(text);
  const definitions = new Map<string, { url: string; title?: string | null }>();
  walk(tree, n => { if (n.type === 'definition') definitions.set(n.identifier.toLowerCase(), n); });
  walk(tree, n => {
    if (!['link', 'image', 'linkReference', 'imageReference'].includes(n.type)) return;
    const start = n.position!.start.offset!, end = n.position!.end.offset!;
    if (ranges.some(r => start < r.end && end > r.start)) return;
    if (n.type === 'link' || n.type === 'image' || n.type === 'linkReference' || n.type === 'imageReference') {
      const resource = 'url' in n ? n : definitions.get(n.identifier.toLowerCase());
      if (!resource) return;
      const raw = text.slice(start, end);
      const labelEnd = raw.lastIndexOf(n.type.endsWith('Reference') ? '][' : '](');
      const label = labelEnd >= 0 ? raw.slice(n.type.startsWith('image') ? 2 : 1, labelEnd) : ('alt' in n ? n.alt ?? '' : raw.slice(1, -1));
      links.push({ start, end, kind: 'markdown', target: resource.url, embed: n.type.startsWith('image'), label, title: resource.title });
    }
  });
  for (const m of text.matchAll(/(!?)\[\[([^\]\n]+)\]\]/g)) {
    const start = m.index!, end = start + m[0].length;
    if (ranges.some(r => start < r.end && end > r.start) || links.some(r => start < r.end && end > r.start)) continue;
    const separator = m[2].indexOf('|');
    links.push({ start, end, kind: 'wiki', target: separator < 0 ? m[2] : m[2].slice(0, separator), embed: !!m[1], label: separator < 0 ? '' : m[2].slice(separator + 1) });
  }
  return links.sort((a, b) => a.start - b.start);
}
export function splitTarget(target: string): { path: string; suffix: string } {
  const index = target.indexOf('#');
  const raw = index < 0 ? target : target.slice(0, index);
  let decoded = raw;
  try { decoded = decodeURIComponent(raw); } catch { /* Keep malformed percent sequences literal. */ }
  return { path: decoded, suffix: index < 0 ? '' : target.slice(index) };
}
export function isExternal(target: string): boolean {
  return /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(target);
}

import TurndownService from 'turndown';
import { extractLinks, protectedRanges } from './markdown';

export interface Conversion { text: string; changed: boolean; warnings: string[] }

function displayMath(text: string, start: number, end: number, body: string): string {
  const before = text.slice(0, start), after = text.slice(end);
  return `${before && !before.endsWith('\n\n') ? (before.endsWith('\n') ? '\n' : '\n\n') : ''}$$\n${body}\n$$${after && !after.startsWith('\n\n') ? (after.startsWith('\n') ? '\n' : '\n\n') : ''}`;
}

// Rich-text copying can strip only the slashes from \[...\] and \(...\).
// Recover balanced delimiters only when their contents have strong math evidence.
export function repairMathDelimiters(text: string, tableCell = false): string {
  const ranges = [...protectedRanges(text), ...extractLinks(text)];
  const changes: { start: number; end: number; value: string }[] = [];
  const latex = /\\(?:frac|dfrac|tfrac|boxed|sqrt|sum|prod|int|lim|log|ln|exp|sin|cos|tan|theta|alpha|beta|gamma|delta|epsilon|varepsilon|lambda|mu|sigma|phi|varphi|pi|omega|tau|rho|eta|nu|xi|psi|zeta|mid|cdot|times|div|pm|mp|leq|geq|neq|approx|infty|partial|nabla|mathbb|mathcal|mathbf|mathrm|text|begin|overline|vec|hat|bar|left|right)\b/i;
  for (let i = 0; i < text.length; i++) {
    const open = text[i];
    if (!['[', '('].includes(open) || /[\\[!\w]/.test(text[i - 1] ?? '') || text[i + 1] === '[') continue;
    if (ranges.some(r => i >= r.start && i < r.end)) continue;
    const close = open === '[' ? ']' : ')';
    let depth = 1, end = i + 1;
    for (; end < text.length && end - i < 10000; end++) {
      if (text[end - 1] === '\\') continue;
      if (text[end] === open) depth++;
      if (text[end] === close) { depth--; if (depth === 0) break; }
    }
    if (depth !== 0) continue;
    if (open === '[' && ['(', '[', ':'].includes(text[end + 1])) { i = end; continue; }
    const body = text.slice(i + 1, end).trim().replace(/\u00a0/g, ' ');
    const strongMath = latex.test(body) || /^(?:[A-Za-z]_[A-Za-z0-9]+|[A-Za-z])\([^()\n]+\)$/.test(body);
    if (!strongMath || /[\u3400-\u9fff]/.test(body.replace(/\\text\{[^}]*\}/g, '')) || ranges.some(r => i < r.end && end + 1 > r.start)) continue;
    let braces = 0;
    for (let j = 0; j < body.length; j++) {
      if (body[j - 1] === '\\') continue;
      if (body[j] === '{') braces++;
      if (body[j] === '}' && --braces < 0) break;
    }
    if (braces !== 0) continue;
    const inline = body.replace(/\r?\n/g, ' ');
    const value = open === '[' && !tableCell ? displayMath(text, i, end + 1, body)
      : `$${tableCell ? inline.replace(/(?<!\\)\|/g, '\\|') : inline}$`;
    changes.push({ start: i, end: end + 1, value }); i = end;
  }
  for (const change of changes.reverse()) text = text.slice(0, change.start) + change.value + text.slice(change.end);
  return text;
}

export function convertMath(text: string, tableCell = false): string {
  const protectedSpans = protectedRanges(text);
  const converted = text.replace(/(?<!\\)\\\(([\s\S]*?)(?<!\\)\\\)|(?<!\\)\\\[([\s\S]*?)(?<!\\)\\\]/g,
    (whole, inline: string | undefined, display: string | undefined, offset: number) => {
      if (protectedSpans.some(r => offset < r.end && offset + whole.length > r.start)) return whole;
      const body = (inline ?? display ?? '').trim();
      if (!body) return whole;
      if (inline !== undefined || tableCell) {
        const singleLine = body.replace(/\r?\n/g, ' ');
        return `$${tableCell ? singleLine.replace(/(?<!\\)\|/g, '\\|') : singleLine}$`;
      }
      const before = text.slice(0, offset), after = text.slice(offset + whole.length);
      return `${before && !before.endsWith('\n\n') ? (before.endsWith('\n') ? '\n' : '\n\n') : ''}$$\n${body}\n$$${after && !after.startsWith('\n\n') ? (after.startsWith('\n') ? '\n' : '\n\n') : ''}`;
    });
  return repairMathDelimiters(converted, tableCell);
}

function markdownMath(text: string): string {
  // Handle math delimiters in existing pipe tables without splitting their rows.
  const lines = text.split('\n');
  const ranges = protectedRanges(text);
  let offset = 0, inTable = false;
  return lines.map((line, i) => {
    const separator = (value: string) => /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(value);
    if (separator(lines[i + 1] ?? '')) inTable = true;
    if (!line.trim() || !line.includes('|')) inTable = false;
    const protectedLine = ranges.some(r => offset < r.end && offset + line.length > r.start);
    offset += line.length + 1;
    return inTable && !protectedLine ? convertMath(line, true) : line;
  }).join('\n');
}

export function convertClipboard(text: string, html = ''): Conversion {
  const warnings: string[] = [];
  const plain = () => {
    const converted = convertMath(markdownMath(text));
    return { text: converted, changed: converted !== text, warnings };
  };
  if (!html || typeof DOMParser === 'undefined') return plain();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script,style,iframe,object').forEach(n => n.remove());
  const tables = [...doc.querySelectorAll('table')].filter(n => !n.closest('pre,code'));
  const math = [...doc.querySelectorAll('.katex, mjx-container, .MathJax, math, [data-tex]')]
    .filter(n => !n.closest('pre,code') && !n.parentElement?.closest('.katex, mjx-container, .MathJax, math, [data-tex]'));
  if (!tables.length && !math.length) return plain();
  if (tables.some(t => t.querySelector('table') || [...t.querySelectorAll('th,td')].some(c =>
    Number(c.getAttribute('colspan') ?? 1) !== 1 || Number(c.getAttribute('rowspan') ?? 1) !== 1))) {
    warnings.push('检测到合并单元格或嵌套表格，已保留原粘贴内容。');
    return { text, changed: false, warnings };
  }
  if (math.some(n => !n.getAttribute('data-tex') && !n.querySelector('annotation[encoding="application/x-tex"]')?.textContent)) {
    warnings.push('部分公式没有 LaTeX 源码，已保留原粘贴内容。');
    return { text, changed: false, warnings };
  }
  const replacements = new Map<string, string>();
  const prefix = `VB${Date.now()}${Math.random().toString(36).slice(2)}TOKEN`;
  const token = (value: string) => { const key = `${prefix}${replacements.size}END`; replacements.set(key, value); return key; };
  for (const node of math) {
    const tex = (node.getAttribute('data-tex') ?? node.querySelector('annotation[encoding="application/x-tex"]')!.textContent!).trim();
    const displayParent = node.closest('.katex-display');
    const display = !!displayParent || node.getAttribute('display') === 'block' || node.getAttribute('display') === 'true';
    const value = display && !node.closest('td,th') ? `\n\n$$\n${tex}\n$$\n\n` : `$${tex.replace(/\r?\n/g, ' ')}$`;
    (displayParent ?? node).replaceWith(doc.createTextNode(token(value)));
  }
  const restore = (value: string) => {
    for (const [key, replacement] of replacements) value = value.split(key).join(replacement);
    return value;
  };
  const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-' });
  // Keep math delimiter backslashes through HTML-to-Markdown escaping.
  for (const node of [...doc.querySelectorAll('p,li,td,th,div,span')].reverse()) {
    for (const child of [...node.childNodes]) {
      if (child.nodeType !== 3 || node.closest('pre,code')) continue;
      child.textContent = convertMath(child.textContent ?? '', !!node.closest('td,th'))
        .replace(/\$\$[\s\S]*?\$\$|\$[^\n]+?\$/g, match => token(match));
    }
  }
  for (const table of tables) {
    const rows = [...table.querySelectorAll('tr')].map(row => [...row.querySelectorAll(':scope > th, :scope > td')].map(cell => {
      const clone = cell.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('br').forEach(n => n.replaceWith(doc.createTextNode('VBLINEBREAK')));
      return restore(turndown.turndown(clone.innerHTML)).trim().replace(/(?<!\\)\|/g, '\\|')
        .replace(/VBLINEBREAK|\r?\n/g, '<br>');
    })).filter(row => row.length);
    if (!rows.length) { table.remove(); continue; }
    const width = Math.max(...rows.map(r => r.length));
    const render = (row: string[]) => `| ${Array.from({ length: width }, (_, i) => row[i] ?? '').join(' | ')} |`;
    const markdown = [render(rows[0]), render(Array(width).fill('---')), ...rows.slice(1).map(render)].join('\n');
    const p = doc.createElement('p');
    p.textContent = token(markdown);
    table.replaceWith(p);
  }
  const converted = restore(turndown.turndown(doc.body.innerHTML)).trim();
  return { text: converted, changed: converted !== text, warnings };
}

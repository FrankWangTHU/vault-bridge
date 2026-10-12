// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { convertClipboard, convertMath } from '../src/format';
import { extractLinks, isProtectedPosition } from '../src/markdown';

describe('math conversion', () => {
  it('converts inline and display math without swallowing surrounding text', () => {
    expect(convertMath('中文 \\(x^2\\) 文本')).toBe('中文 $x^2$ 文本');
    expect(convertMath('before\\[a+b\\]after')).toBe('before\n\n$$\na+b\n$$\n\nafter');
    expect(convertMath('\\[a\nb\\]')).toBe('$$\na\nb\n$$');
  });
  it('protects code, YAML and existing dollar math and is idempotent', () => {
    const input = '---\nformula: \\(a\\)\n---\n`\\(b\\)`\n```latex\n\\[c\\]\n```\n$x \\(d\\)$\n\\(e\\)';
    const result = convertMath(input);
    expect(result).toBe(input.replace('\\(e\\)', '$e$'));
    expect(convertMath(result)).toBe(result);
    expect(convertMath('\\\\(escaped\\)')).toBe('\\\\(escaped\\)');
  });
  it('does not mutate unfinished delimiters', () => expect(convertMath('\\(open')).toBe('\\(open'));
  it('recognizes editor positions inside fences, inline code and frontmatter', () => {
    expect(isProtectedPosition('```\ntext\n```', 5)).toBe(true);
    expect(isProtectedPosition('---\nfield: value', 10)).toBe(true);
    expect(isProtectedPosition('text `code`', 8)).toBe(true);
    expect(isProtectedPosition('ordinary text', 3)).toBe(false);
    expect(isProtectedPosition('```\ncode', 8)).toBe(true);
    expect(isProtectedPosition('```\ncode\n```\n', 13)).toBe(false);
  });
  it('keeps Markdown table formulas on one line', () => {
    expect(convertClipboard('| A | B |\n| --- | --- |\n| \\[x\\] | \\(y\\) |').text).toBe('| A | B |\n| --- | --- |\n| $x$ | $y$ |');
    expect(convertClipboard('| A | B |\n| --- | --- |\n| \\(|x|\\) | 2 |').text).toContain('$\\|x\\|$');
  });
});

describe('HTML clipboard', () => {
  it('extracts LaTeX once from duplicate KaTeX render layers', () => {
    const html = '<p>公式 <span class="katex"><span class="katex-mathml"><math><semantics><annotation encoding="application/x-tex">x^2</annotation></semantics></math></span><span class="katex-html">x2</span></span></p>';
    const result = convertClipboard('公式 x2x2', html);
    expect(result.text).toBe('公式 $x^2$');
    expect(result.changed).toBe(true);
  });
  it('extracts a display formula and surrounding paragraphs', () => {
    const html = '<p>前</p><span class="katex-display"><span class="katex"><annotation encoding="application/x-tex">a+b</annotation><span>duplicated</span></span></span><p>后</p>';
    const result = convertClipboard('前 a+b 后', html);
    expect(result.text).toContain('$$\na+b\n$$');
    expect(result.text).toContain('前'); expect(result.text).toContain('后');
    expect(result.text).not.toContain('duplicated');
  });
  it('converts table cells, pipes, newlines, inline formatting and math', () => {
    const html = '<p>说明</p><table><tr><th>名称</th><th>内容</th></tr><tr><td><strong>A</strong></td><td>\\(x\\)<br>a|b</td></tr></table><p>结尾</p>';
    const result = convertClipboard('', html);
    expect(result.text).toContain('| 名称 | 内容 |\n| --- | --- |');
    expect(result.text).toContain('| **A** | $x$<br>a\\|b |');
    expect(result.text).toContain('说明'); expect(result.text).toContain('结尾');
    expect(convertClipboard(result.text).text).toBe(result.text);
  });
  it('protects preformatted HTML and handles a source formula inside a table', () => {
    const html = '<pre><code>\\(code\\)</code></pre><table><tr><td>Formula</td></tr><tr><td><span class="katex"><annotation encoding="application/x-tex">|x|</annotation><span>visual</span></span></td></tr></table>';
    const result = convertClipboard('', html);
    expect(result.text).toContain('\\(code\\)');
    expect(result.text).toContain('$\\|x\\|$'); expect(result.text).not.toContain('visual');
  });
  it('falls back without intercepting merged tables and unrecoverable formula HTML', () => {
    for (const html of ['<table><tr><td colspan="2">a</td></tr></table>', '<span class="katex">visual only</span>']) {
      const result = convertClipboard('original', html);
      expect(result.text).toBe('original'); expect(result.changed).toBe(false); expect(result.warnings).toHaveLength(1);
    }
  });
  it('does not change ordinary pasted text or a valid Markdown table', () => {
    expect(convertClipboard('plain', '<p>plain</p>').changed).toBe(false);
    expect(convertClipboard('| A | B |\n| --- | --- |\n| 1 | 2 |').changed).toBe(false);
  });
});

describe('link parsing', () => {
  it('parses wiki aliases, image dimensions, Markdown titles and references, ignoring code', () => {
    const source = '![[assets/图.png|200]] [[A#Heading|别名]] [label](<asset name.pdf#page=2> "Title")\n![alt][image]\n\n[image]: images/p.png\n\n`![[ignored.png]]`\n```md\n![[ignored2.png]]\n```';
    const refs = extractLinks(source);
    expect(refs.map(r => r.target)).toEqual(['assets/图.png', 'A#Heading', 'asset name.pdf#page=2', 'images/p.png']);
    expect(refs[0].label).toBe('200'); expect(refs[2].title).toBe('Title'); expect(refs[3].label).toBe('alt');
  });
});

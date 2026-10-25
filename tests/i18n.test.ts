import { describe, expect, it } from 'vitest';
import { createTranslator, formatError, LocalizedError, resolveLanguage, RollbackError } from '../src/i18n';

describe('language selection and diagnostics', () => {
  it('follows Chinese variants and falls back to English for other Obsidian languages', () => {
    for (const language of ['zh', 'zh-CN', 'zh-TW', 'zh_HK']) expect(resolveLanguage('auto', language)).toBe('zh-CN');
    for (const language of ['en', 'de', 'ja', '']) expect(resolveLanguage('auto', language)).toBe('en');
    expect(resolveLanguage('en', 'zh')).toBe('en');
    expect(resolveLanguage('zh-CN', 'en')).toBe('zh-CN');
    expect(resolveLanguage('corrupted', 'en')).toBe('en');
  });
  it('preserves filenames, placeholders and native filesystem diagnostics', () => {
    const t = createTranslator('en');
    expect(t('放入：{0}', '目录/{1}/$&')).toBe('Destination: 目录/{1}/$&');
    expect(formatError(new Error('EACCES: permission denied'), t)).toBe('EACCES: permission denied');
    expect(formatError(new LocalizedError('不能使用符号链接：{0}', '研究/链接'), t)).toBe('Symbolic links are not supported: 研究/链接');
  });
  it('localizes rollback details and retains the original error and residual file paths', () => {
    const error = new LocalizedError('源文件已变化，请重新预览：{0}', '研究.md');
    const rolledBack = new RollbackError(error, []);
    expect(formatError(rolledBack, createTranslator('en'))).toBe('The source file changed. Preview again: 研究.md; files written by this operation have been rolled back.');
    const incomplete = new RollbackError(error, ['研究/残留.png']);
    expect(formatError(incomplete, createTranslator('en'))).toContain('some new files could not be removed. Check: 研究/残留.png');
    expect(formatError(incomplete, createTranslator('zh-CN'))).toContain('部分新文件未能清理');
  });
});

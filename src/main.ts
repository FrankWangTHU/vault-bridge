import { createTranslator, formatError, resolveLanguage, type Language, type LanguagePreference, type Translator } from './i18n';
import { FileSystemAdapter, Notice, Plugin, PluginSettingTab, Setting, TAbstractFile, type App, type Editor, type Command } from 'obsidian';
import { convertClipboard } from './format';
import { isProtectedPosition, splitTarget } from './markdown';
import { executeCopy, planCopy, type CopyPlan, type CopyRequest } from './copy';
import { canonicalPath, discoverVaults, samePath, type TargetVault } from './vaults';
import { DRAG_MIME, dropFolder, explorerItem, isCrossVaultDrag, parseDragPayload, resolveDraggedLink, sourceType, type DragPayload } from './drag';
import { CopyModal, ReportModal } from './ui';
interface Settings { language: LanguagePreference; autoConvert: boolean; targets: TargetVault[]; lastTarget: string; crossVaultDrag: boolean }
const DEFAULTS: Settings = { language: 'auto', autoConvert: true, targets: [], lastTarget: '', crossVaultDrag: true };
export default class NoteParcel extends Plugin {
  settings: Settings = { ...DEFAULTS, targets: [] };
  copying = false;
  private localizedCommands: string[] = [];
  get locale(): Language {
    let language = 'en';
    try { language = window.localStorage?.getItem('language') || 'en'; } catch { /* Use English if storage is unavailable. */ }
    return resolveLanguage(this.settings.language, language);
  }
  t: Translator = (key, ...args) => createTranslator(this.locale)(key, ...args);
  private errorText(error: unknown): string { return formatError(error, this.t); }
  private registerCommands() {
    for (const id of this.localizedCommands) this.removeCommand(id);
    this.localizedCommands = [];
    const add = (command: Command) => { this.localizedCommands.push(command.id); this.addCommand(command); };
    add({ id: 'copy-current-local-path', name: this.t("复制当前文件本地路径"), checkCallback: checking => {
      const file = this.app.workspace.getActiveFile(); if (!file) return false;
      if (!checking) void this.copyPath(file); return true;
    }});
    add({ id: 'copy-current-to-vault', name: this.t("复制当前笔记到其他 Vault"), checkCallback: checking => {
      const file = this.app.workspace.getActiveFile(); if (!file) return false;
      if (!checking) new CopyModal(this.app, this, [file.path]).open(); return true;
    }});
    add({ id: 'convert-selection', name: this.t("修复选中的公式和表格"), editorCallback: editor => this.convertSelection(editor) });
    add({ id: 'repair-current-note', name: this.t("修复当前笔记的公式"), editorCallback: editor => {
      const text = editor.getValue(), result = convertClipboard(text, '', this.locale);
      if (!result.changed) { new Notice(this.t("没有检测到需要修复的公式。")); return; }
      editor.replaceRange(result.text, { line: 0, ch: 0 }, editor.offsetToPos(text.length));
      new Notice(this.t("已修复当前笔记的公式，可撤销恢复。"));
    }});
  }
  async setLanguage(language: LanguagePreference) {
    this.settings.language = language;
    await this.saveSettings();
    this.registerCommands();
  }
  private documents = new WeakSet<Document>();
  async onload() {
    const saved = await this.loadData();
    this.settings = { ...DEFAULTS, ...saved, targets: Array.isArray(saved?.targets) ? saved.targets : [] };
    if (!['auto', 'en', 'zh-CN'].includes(this.settings.language)) this.settings.language = 'auto';
    this.addSettingTab(new BridgeSettings(this.app, this));
    this.registerEvent(this.app.workspace.on('file-menu', (menu, file) => {
      menu.addItem(item => item.setTitle(this.t("复制本地绝对路径")).setIcon('copy').onClick(() => this.copyPath(file)));
      if (file.path) menu.addItem(item => item.setTitle(this.t("复制到其他 Vault…")).setIcon('folder-input').onClick(() => new CopyModal(this.app, this, [file.path]).open()));
    }));
    this.registerEvent(this.app.workspace.on('files-menu', (menu, files) => {
      menu.addItem(item => item.setTitle(this.t("复制到其他 Vault…")).setIcon('folder-input').onClick(() => new CopyModal(this.app, this, files.map(f => f.path)).open()));
    }));
    this.registerCommands();
    this.registerEvent(this.app.workspace.on('editor-paste', (event, editor) => {
      if (!this.settings.autoConvert || event.defaultPrevented || !event.clipboardData || event.clipboardData.files.length) return;
      if (isProtectedPosition(editor.getValue(), editor.posToOffset(editor.getCursor('from')), editor.posToOffset(editor.getCursor('to')))) return;
      const text = event.clipboardData.getData('text/plain'), html = event.clipboardData.getData('text/html');
      if (!text && !html) return;
      try {
        const result = convertClipboard(text, html, this.locale); result.warnings.forEach(w => new Notice(`NoteParcel: ${w}`));
        if (result.changed) { event.preventDefault(); editor.replaceSelection(result.text); }
      } catch (error) { new Notice(this.t("NoteParcel 转换失败，使用普通粘贴：{0}", this.errorText(error))); }
    }));
    this.bindDragDocument(document);
    this.app.workspace.iterateAllLeaves(leaf => this.bindDragDocument(leaf.view.containerEl.ownerDocument));
    this.registerEvent(this.app.workspace.on('window-open', win => this.bindDragDocument(win.doc)));
  }
  get sourceRoot(): string {
    const adapter = this.app.vault.adapter;
    if (!(adapter instanceof FileSystemAdapter)) throw new Error(this.t("本功能仅支持桌面文件系统。"));
    return adapter.getBasePath();
  }
  async saveSettings() { await this.saveData(this.settings); }
  async targets() { return discoverVaults(this.sourceRoot, this.settings.targets, undefined, this.locale); }
  request(selection: string[], target: TargetVault, destination: string): CopyRequest {
    return { language: this.locale, sourceRoot: this.sourceRoot, targetRoot: target.path, selection, destination, configDir: this.app.vault.configDir,
      resolve: (link, source) => this.app.metadataCache.getFirstLinkpathDest(link, source)?.path ?? null };
  }
  async transfer(request: CopyRequest, progress?: (label: string) => void): Promise<CopyPlan> {
    if (this.copying) throw new Error(this.t("已有复制任务正在进行，请稍候。"));
    this.copying = true;
    try {
      progress?.(this.t("正在收集附件…")); const plan = await planCopy(request);
      await executeCopy(plan, (done, total) => progress?.(this.t("正在复制 {0}/{1}", done, total)));
      new Notice(this.t("已复制 {0} 篇笔记和 {1} 个附件/其他文件{2}。", plan.notes, plan.attachments, plan.renamed.length ? this.t("，{0} 个重名文件已改名", plan.renamed.length) : ''));
      return plan;
    } finally { this.copying = false; }
  }
  async copyPath(file: TAbstractFile) {
    try { await navigator.clipboard.writeText((this.app.vault.adapter as FileSystemAdapter).getFullPath(file.path)); new Notice(this.t("已复制本地绝对路径")); }
    catch (error) { new Notice(this.t("复制失败：{0}", this.errorText(error))); }
  }
  convertSelection(editor: Editor) {
    const selected = editor.getSelection(); if (!selected) { new Notice(this.t("请先选中需要转换的内容。")); return; }
    const start = editor.posToOffset(editor.getCursor('from'));
    if (isProtectedPosition(editor.getValue(), start) && start !== 0) { new Notice(this.t("代码或属性区内不进行转换。")); return; }
    try {
      const result = convertClipboard(selected, /^\s*<table[\s>]/i.test(selected) ? selected : '', this.locale);
      result.warnings.forEach(w => new Notice(w));
      if (result.changed) { editor.replaceSelection(result.text); new Notice(this.t("已转换，可撤销恢复。")); }
      else if (!result.warnings.length) new Notice(this.t("没有需要转换的公式或表格。"));
    } catch (error) { new Notice(this.t("转换失败：{0}", this.errorText(error))); }
  }
  private bindDragDocument(doc: Document) {
    if (this.documents.has(doc)) return; this.documents.add(doc);
    this.registerDomEvent(doc, 'dragstart', event => {
      if (!this.settings.crossVaultDrag || !event.dataTransfer) return;
      const item = explorerItem(event.target);
      if (!item || !item.closest('.nav-files-container')) return;
      const ownPath = item.dataset.path; if (!ownPath || ownPath === '/') return;
      try {
        const selected = item.classList.contains('is-selected')
          ? [...doc.querySelectorAll<HTMLElement>('.nav-files-container .nav-file-title.is-selected[data-path], .nav-files-container .nav-folder-title.is-selected[data-path]')].map(el => el.dataset.path!) : [ownPath];
        const selections = selected.length ? selected : [ownPath];
        const payload: DragPayload = { version: 1, sourceRoot: this.sourceRoot, configDir: this.app.vault.configDir, selections, resolved: Object.create(null) };
        for (const file of this.app.vault.getMarkdownFiles()) {
          if (!selections.some(p => file.path === p || file.path.startsWith(`${p}/`))) continue;
          const cache = this.app.metadataCache.getFileCache(file), links: Record<string, string> = Object.create(null);
          for (const ref of [...cache?.links ?? [], ...cache?.embeds ?? []]) {
            const link = splitTarget(ref.link).path, resolved = this.app.metadataCache.getFirstLinkpathDest(link, file.path);
            if (resolved) links[link] = resolved.path;
          }
          payload.resolved[file.path] = links;
        }
        const raw = JSON.stringify(payload); if (raw.length > 8_000_000) throw new Error(this.t("选择内容过多，请使用右键复制。"));
        event.dataTransfer.setData(DRAG_MIME, raw); event.dataTransfer.setData(sourceType(this.sourceRoot), '1');
        event.dataTransfer.effectAllowed = 'copyMove';
      } catch (error) { new Notice(this.t("跨库拖拽不可用：{0}", this.errorText(error))); }
    }, true);
    this.registerDomEvent(doc, 'dragover', event => {
      if (!this.settings.crossVaultDrag || !event.dataTransfer || dropFolder(event.target) === null || !isCrossVaultDrag([...event.dataTransfer.types], this.sourceRoot)) return;
      event.preventDefault(); event.stopImmediatePropagation(); event.dataTransfer.dropEffect = 'copy';
    }, true);
    this.registerDomEvent(doc, 'drop', event => {
      if (!this.settings.crossVaultDrag || !event.dataTransfer || !isCrossVaultDrag([...event.dataTransfer.types], this.sourceRoot)) return;
      const destination = dropFolder(event.target); if (destination === null) return;
      event.preventDefault(); event.stopImmediatePropagation(); event.dataTransfer.dropEffect = 'copy';
      void this.receiveDrag(event.dataTransfer.getData(DRAG_MIME), destination);
    }, true);
  }
  async receiveDrag(raw: string, destination: string) {
    try {
      const payload = parseDragPayload(raw), sourceRoot = await canonicalPath(payload.sourceRoot);
      const { vaults } = await this.targets();
      if (!vaults.some(v => samePath(v.path, sourceRoot))) throw new Error(this.t("来源不是已登记的其他 Vault，请在 Obsidian 库列表中添加它后重试。"));
      const plan = await this.transfer({ language: this.locale, sourceRoot, targetRoot: this.sourceRoot, selection: payload.selections, destination, configDir: payload.configDir,
        resolve: (link, source) => resolveDraggedLink(payload, link, source) });
      if (plan.warnings.length) new ReportModal(this.app, plan, this.t).open();
    } catch (error) { new Notice(this.t("跨库拖拽未完成：{0}", this.errorText(error)), 10000); }
  }
}
class BridgeSettings extends PluginSettingTab {
  constructor(app: App, private plugin: NoteParcel) { super(app, plugin); }
  display() {
    const { containerEl } = this; containerEl.empty();
    new Setting(containerEl).setName(this.plugin.t('界面语言'))
      .setDesc(this.plugin.t('选择 NoteParcel 的界面语言；跟随 Obsidian 时，中文使用简体中文，其他语言使用英文。'))
      .addDropdown(dropdown => dropdown.addOption('auto', this.plugin.t('跟随 Obsidian')).addOption('zh-CN', '简体中文').addOption('en', 'English')
        .setValue(this.plugin.settings.language).onChange(async value => {
          if (value !== 'auto' && value !== 'zh-CN' && value !== 'en') return;
          await this.plugin.setLanguage(value); this.display();
        }));
    new Setting(containerEl).setName(this.plugin.t("自动转换粘贴的公式和表格")).setDesc(this.plugin.t("同时修复丢失反斜杠的公式分隔符；代码与属性区不转换。")).addToggle(toggle => toggle.setValue(this.plugin.settings.autoConvert).onChange(async value => { this.plugin.settings.autoConvert = value; await this.plugin.saveSettings(); }));
    new Setting(containerEl).setName(this.plugin.t("跨 Vault 窗口拖拽复制")).setDesc(this.plugin.t("两边均需启用新版 NoteParcel；拖到目标库左侧文件列表或文件夹即可复制，源文件保留。")).addToggle(toggle => toggle.setValue(this.plugin.settings.crossVaultDrag).onChange(async value => { this.plugin.settings.crossVaultDrag = value; await this.plugin.saveSettings(); }));
    containerEl.createEl('p', { text: this.plugin.t("复制窗口会自动读取 Obsidian 已登记的 Vault。未登记的库可以在复制窗口的“手动添加”中添加。") });
    for (const target of this.plugin.settings.targets) new Setting(containerEl).setName(target.name).setDesc(target.path).addButton(button => button.setButtonText(this.plugin.t("清除偏好")).onClick(async () => {
      this.plugin.settings.targets = this.plugin.settings.targets.filter(t => t.path !== target.path);
      if (this.plugin.settings.lastTarget === target.path) this.plugin.settings.lastTarget = '';
      await this.plugin.saveSettings(); this.display();
    }));
  }
}


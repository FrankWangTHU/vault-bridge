import { App, FileSystemAdapter, Modal, Notice, Plugin, PluginSettingTab, Setting, TAbstractFile, TFile, type Editor } from 'obsidian';
import { convertClipboard } from './format';
import { isProtectedPosition } from './markdown';
import { executeCopy, planCopy, type CopyPlan } from './copy';

interface TargetVault { name: string; path: string; destination: string }
interface Settings { autoConvert: boolean; targets: TargetVault[]; lastTarget: string }
const DEFAULTS: Settings = { autoConvert: true, targets: [], lastTarget: '' };
const message = (error: unknown) => error instanceof Error ? error.message : String(error);

export default class VaultBridge extends Plugin {
  settings: Settings = { ...DEFAULTS, targets: [] };
  copying = false;
  async onload() {
    const saved = await this.loadData();
    this.settings = { ...DEFAULTS, ...saved, targets: Array.isArray(saved?.targets) ? saved.targets : [] };
    this.addSettingTab(new BridgeSettings(this.app, this));
    this.registerEvent(this.app.workspace.on('file-menu', (menu, file) => {
      menu.addItem(item => item.setTitle('复制本地绝对路径').setIcon('copy').onClick(() => this.copyPath(file)));
      if (file.path) menu.addItem(item => item.setTitle('复制到其他 Vault…').setIcon('folder-input').onClick(() => new CopyModal(this.app, this, file).open()));
    }));
    this.addCommand({ id: 'copy-current-local-path', name: '复制当前文件本地路径', checkCallback: checking => {
      const file = this.app.workspace.getActiveFile();
      if (!file) return false;
      if (!checking) void this.copyPath(file);
      return true;
    }});
    this.addCommand({ id: 'copy-current-to-vault', name: '复制当前笔记到其他 Vault', checkCallback: checking => {
      const file = this.app.workspace.getActiveFile();
      if (!file) return false;
      if (!checking) new CopyModal(this.app, this, file).open();
      return true;
    }});
    this.addCommand({ id: 'convert-selection', name: '转换选中的公式和表格', editorCallback: editor => this.convertSelection(editor) });
    this.registerEvent(this.app.workspace.on('editor-paste', (event, editor) => {
      if (!this.settings.autoConvert || event.defaultPrevented || !event.clipboardData || event.clipboardData.files.length) return;
      const content = editor.getValue();
      if (isProtectedPosition(content, editor.posToOffset(editor.getCursor('from')), editor.posToOffset(editor.getCursor('to')))) return;
      const text = event.clipboardData.getData('text/plain'), html = event.clipboardData.getData('text/html');
      if (!text && !html) return;
      try {
        const result = convertClipboard(text, html);
        result.warnings.forEach(w => new Notice(`VaultBridge：${w}`));
        if (result.changed) {
          event.preventDefault();
          editor.replaceSelection(result.text);
        }
      } catch (error) { new Notice(`VaultBridge 转换失败，使用普通粘贴：${message(error)}`); }
    }));
  }
  async saveSettings() { await this.saveData(this.settings); }
  async copyPath(file: TAbstractFile) {
    try {
      const adapter = this.app.vault.adapter;
      if (!(adapter instanceof FileSystemAdapter)) throw new Error('本地路径功能仅支持桌面文件系统。');
      await navigator.clipboard.writeText(adapter.getFullPath(file.path));
      new Notice('已复制本地绝对路径');
    } catch (error) { new Notice(`复制失败：${message(error)}`); }
  }
  convertSelection(editor: Editor) {
    const selected = editor.getSelection();
    if (!selected) { new Notice('请先选中需要转换的内容。'); return; }
    const full = editor.getValue(), start = editor.posToOffset(editor.getCursor('from'));
    // A whole-document selection may include protected blocks; the converter skips them.
    if (isProtectedPosition(full, start) && start !== 0) { new Notice('代码或属性区内不进行转换。'); return; }
    try {
      const result = convertClipboard(selected, /^\s*<table[\s>]/i.test(selected) ? selected : '');
      result.warnings.forEach(w => new Notice(w));
      if (result.changed) { editor.replaceSelection(result.text); new Notice('已转换，可撤销恢复。'); }
      else if (!result.warnings.length) new Notice('没有需要转换的公式或表格。');
    } catch (error) { new Notice(`转换失败：${message(error)}`); }
  }
}

class CopyModal extends Modal {
  private targetPath = '';
  private targetName = '';
  private destination = '';
  private plan?: CopyPlan;
  private generation = 0;
  private busy = false;
  private preview!: HTMLDivElement;
  constructor(app: App, private plugin: VaultBridge, private file: TAbstractFile) {
    super(app);
    const target = plugin.settings.targets.find(t => t.path === plugin.settings.lastTarget) ?? plugin.settings.targets[0];
    if (target) { this.targetPath = target.path; this.targetName = target.name; this.destination = target.destination; }
  }
  onOpen() { this.render(); }
  onClose() { this.generation++; this.contentEl.empty(); }
  private invalidate() { this.plan = undefined; this.generation++; this.preview?.empty(); }
  private render() {
    const { contentEl } = this;
    contentEl.empty(); contentEl.addClass('vault-bridge-modal');
    contentEl.createEl('h2', { text: '复制到其他 Vault' });
    contentEl.createEl('p', { text: `所选内容：${this.file.path}` });
    contentEl.createEl('p', { text: '复制当前已保存的内容。文件夹保留层级，外部附件集中保存；已有文件不会被覆盖。', cls: 'setting-item-description' });
    if (this.plugin.settings.targets.length) new Setting(contentEl).setName('常用 Vault').addDropdown(dropdown => {
      dropdown.addOption('', '选择已保存的 Vault');
      this.plugin.settings.targets.forEach(t => dropdown.addOption(t.path, t.name));
      dropdown.setValue(this.targetPath).onChange(value => {
        if (this.busy) return;
        const target = this.plugin.settings.targets.find(t => t.path === value);
        if (target) { this.targetPath = target.path; this.targetName = target.name; this.destination = target.destination; this.invalidate(); this.render(); }
      });
    });
    new Setting(contentEl).setName('Vault 名称').setDesc('仅用于本地列表，预览成功后保存。').addText(input => input.setValue(this.targetName).onChange(v => { this.targetName = v; this.invalidate(); }));
    new Setting(contentEl).setName('Vault 绝对路径').setDesc('目标目录需包含 .obsidian 文件夹。').addText(input => input.setPlaceholder('D:\\Notes\\OtherVault').setValue(this.targetPath).onChange(v => { this.targetPath = v.trim(); this.invalidate(); }));
    new Setting(contentEl).setName('导入目录').setDesc('相对于目标 Vault，例如 Research/Imported；留空放入库根目录。').addText(input => input.setValue(this.destination).onChange(v => { this.destination = v.trim(); this.invalidate(); }));
    this.preview = contentEl.createDiv({ cls: 'vault-bridge-preview' });
    new Setting(contentEl).addButton(button => button.setButtonText('预览复制').onClick(async () => {
      if (this.busy || this.plugin.copying) return;
      this.busy = true; button.setDisabled(true); this.invalidate();
      const generation = this.generation;
      try {
        const adapter = this.app.vault.adapter;
        if (!(adapter instanceof FileSystemAdapter)) throw new Error('跨库复制仅支持桌面文件系统。');
        const plan = await planCopy({ sourceRoot: adapter.getBasePath(), targetRoot: this.targetPath, selection: this.file.path, destination: this.destination, configDir: this.app.vault.configDir,
          resolve: (link, source) => this.app.metadataCache.getFirstLinkpathDest(link, source)?.path ?? null });
        if (generation !== this.generation) return;
        this.plan = plan;
        const target = { name: this.targetName.trim() || this.targetPath, path: this.targetPath, destination: this.destination };
        this.plugin.settings.targets = [...this.plugin.settings.targets.filter(t => t.path !== target.path), target];
        this.plugin.settings.lastTarget = target.path;
        await this.plugin.saveSettings();
        this.showPlan(plan);
      } catch (error) { this.preview.setText(`无法预览：${message(error)}`); }
      finally { this.busy = false; button.setDisabled(false); }
    })).addButton(button => button.setButtonText('执行复制').setCta().onClick(async () => {
      if (this.busy || this.plugin.copying) return;
      if (!this.plan) { new Notice('请先预览复制清单。'); return; }
      this.busy = true; this.plugin.copying = true; button.setDisabled(true);
      const plan = this.plan;
      // Freeze destination controls while the approved plan is being executed.
      contentEl.querySelectorAll('input,select').forEach(el => (el as HTMLInputElement).disabled = true);
      try {
        await executeCopy(plan, (done, total) => button.setButtonText(`复制中 ${done}/${total}`));
        this.showPlan(plan);
        this.preview.createEl('p', { text: `复制完成：${plan.entries.length} 个文件。${plan.warnings.length ? '请检查下列未迁移链接提示。' : ''}` });
        new Notice(`VaultBridge：已复制 ${plan.entries.length} 个文件。`);
      } catch (error) { this.preview.setText(`复制失败：${message(error)}`); new Notice('复制失败，请查看窗口内说明。'); }
      finally {
        this.plan = undefined; this.busy = false; this.plugin.copying = false;
        button.setDisabled(false).setButtonText('执行复制');
        contentEl.querySelectorAll('input,select').forEach(el => (el as HTMLInputElement).disabled = false);
      }
    }));
  }
  private showPlan(plan: CopyPlan) {
    this.preview.empty();
    this.preview.createEl('p', { text: `${plan.notes} 篇笔记，${plan.attachments} 个附件/其他文件，${plan.renamed.length} 处重名调整。` });
    const details = this.preview.createEl('details'); details.createEl('summary', { text: '查看文件去向' });
    const list = details.createEl('ul');
    plan.entries.forEach(entry => list.createEl('li', { text: `${entry.source} → ${entry.destination}` }));
    if (plan.renamed.length) {
      this.preview.createEl('h4', { text: '重名调整' });
      plan.renamed.forEach(item => this.preview.createEl('p', { text: `${item.from} → ${item.to}` }));
    }
    if (plan.warnings.length) {
      this.preview.createEl('h4', { text: '需要检查的链接' });
      const warnings = this.preview.createEl('ul');
      plan.warnings.forEach(w => warnings.createEl('li', { text: w }));
    }
  }
}

class BridgeSettings extends PluginSettingTab {
  constructor(app: App, private plugin: VaultBridge) { super(app, plugin); }
  display() {
    const { containerEl } = this; containerEl.empty();
    containerEl.createEl('h2', { text: 'VaultBridge（库桥）' });
    new Setting(containerEl).setName('自动转换粘贴的公式和表格').setDesc('识别 LaTeX 分隔符、带公式源码的 HTML 和普通 HTML 表格。代码与属性区不转换。').addToggle(toggle => toggle.setValue(this.plugin.settings.autoConvert).onChange(async value => {
      this.plugin.settings.autoConvert = value; await this.plugin.saveSettings();
    }));
    containerEl.createEl('h3', { text: '常用目标 Vault' });
    containerEl.createEl('p', { text: '在文件右键菜单中预览复制后保存目标。路径仅保存在本地插件设置中。' });
    for (const target of this.plugin.settings.targets) new Setting(containerEl).setName(target.name).setDesc(target.path).addButton(button => button.setButtonText('移除').onClick(async () => {
      this.plugin.settings.targets = this.plugin.settings.targets.filter(t => t.path !== target.path);
      if (this.plugin.settings.lastTarget === target.path) this.plugin.settings.lastTarget = '';
      await this.plugin.saveSettings(); this.display();
    }));
  }
}

import { App, Modal, Notice, Setting } from 'obsidian';
import * as path from 'node:path';
import type VaultBridge from './main';
import { planCopy, type CopyPlan } from './copy';
import { listTargetFolders, type TargetVault } from './vaults';
const errorText = (e: unknown) => e instanceof Error ? e.message : String(e);
function setup(modal: Modal, title: string) {
  modal.modalEl.addClass('vault-bridge-dialog');
  modal.contentEl.addClass('vault-bridge-modal');
  modal.contentEl.createEl('h2', { text: title });
}
function showReport(parent: HTMLElement, plan: CopyPlan) {
  parent.createEl('p', { text: `${plan.notes} 篇笔记 · ${plan.attachments} 个附件/其他文件 · ${plan.renamed.length} 个重名调整` });
  const details = parent.createEl('details'); details.createEl('summary', { text: '文件去向与重名调整' });
  const list = details.createEl('ul');
  plan.entries.forEach(entry => list.createEl('li', { text: `${entry.source} → ${entry.destination}` }));
  if (plan.warnings.length) {
    const warnings = parent.createEl('details'); warnings.open = true;
    warnings.createEl('summary', { text: `${plan.warnings.length} 条链接提示` });
    const items = warnings.createEl('ul'); plan.warnings.forEach(text => items.createEl('li', { text }));
  }
}
export class ReportModal extends Modal {
  constructor(app: App, private plan: CopyPlan) { super(app); }
  onOpen() { setup(this, '复制完成'); showReport(this.contentEl, this.plan); }
  onClose() { this.contentEl.empty(); }
}
export class FolderModal extends Modal {
  private generation = 0;
  constructor(app: App, private root: string, private current: string, private choose: (folder: string) => void) { super(app); }
  onOpen() { void this.render(); }
  onClose() { this.generation++; this.contentEl.empty(); }
  private async render() {
    const generation = ++this.generation;
    this.contentEl.empty(); setup(this, '选择目标文件夹');
    const nav = this.contentEl.createDiv({ cls: 'vault-bridge-actions' });
    nav.createEl('button', { text: '库根目录' }).onclick = () => { this.current = ''; void this.render(); };
    if (this.current) nav.createEl('button', { text: '上一级' }).onclick = () => { const parent = path.posix.dirname(this.current); this.current = parent === '.' ? '' : parent; void this.render(); };
    this.contentEl.createEl('p', { text: this.current || '库根目录', cls: 'vault-bridge-path' });
    const list = this.contentEl.createDiv({ cls: 'vault-bridge-list' });
    try {
      const folders = await listTargetFolders(this.root, this.current);
      if (generation !== this.generation) return;
      if (!folders.length) list.createEl('p', { text: '没有子文件夹。', cls: 'setting-item-description' });
      for (const folder of folders) list.createEl('button', { text: `📁 ${path.posix.basename(folder)}`, cls: 'vault-bridge-choice' }).onclick = () => { this.current = folder; void this.render(); };
      const use = this.contentEl.createEl('button', { text: '选择此文件夹', cls: 'mod-cta' });
      use.onclick = () => { this.choose(this.current); this.close(); };
    } catch (error) { if (generation === this.generation) list.createEl('p', { text: `无法读取：${errorText(error)}。可返回库根目录。` }); }
  }
}
export class CopyModal extends Modal {
  private selected?: TargetVault;
  private destination = '';
  private generation = 0;
  private closed = false;
  private busy = false;
  constructor(app: App, private plugin: VaultBridge, private selections: string[]) { super(app); }
  onOpen() { this.closed = false; void this.load(); }
  onClose() { this.closed = true; this.generation++; this.contentEl.empty(); }
  private async load() {
    this.contentEl.empty(); setup(this, '复制到其他 Vault');
    const loading = this.contentEl.createEl('p', { text: '正在读取已有 Vault…' });
    try {
      const { vaults, warning } = await this.plugin.targets();
      if (this.closed) return;
      loading.remove(); this.render(vaults, warning);
    } catch (error) { if (!this.closed) loading.setText(`读取失败：${errorText(error)}`); }
  }
  private render(vaults: TargetVault[], warning?: string) {
    const content = this.contentEl;
    content.createEl('p', { text: this.selections.length === 1 ? this.selections[0] : `已选 ${this.selections.length} 个文件/文件夹`, cls: 'vault-bridge-path' });
    const choices = content.createDiv({ cls: 'vault-bridge-list' });
    const location = content.createDiv({ cls: 'vault-bridge-location' });
    const status = content.createDiv({ cls: 'vault-bridge-preview', attr: { 'aria-live': 'polite' } });
    const actions = content.createDiv({ cls: 'vault-bridge-actions' });
    const preview = actions.createEl('button', { text: '查看明细' });
    const copy = actions.createEl('button', { text: '复制', cls: 'mod-cta' });
    const buttons: HTMLButtonElement[] = [];
    const invalidate = () => { this.generation++; status.empty(); };
    const updateLocation = () => {
      location.empty();
      location.createSpan({ text: `放入：${this.destination || '库根目录'}`, cls: 'vault-bridge-path' });
      const change = location.createEl('button', { text: '选择文件夹…' });
      change.disabled = !this.selected || this.busy;
      change.onclick = () => { if (this.selected && !this.busy) new FolderModal(this.app, this.selected.path, this.destination, folder => { this.destination = folder; invalidate(); updateLocation(); }).open(); };
    };
    const addChoice = (vault: TargetVault) => {
      const button = choices.createEl('button', { cls: 'vault-bridge-choice' }); buttons.push(button);
      button.createEl('strong', { text: vault.name });
      button.createSpan({ text: vault.open ? '已打开' : '', cls: 'vault-bridge-badge' });
      button.createEl('small', { text: vault.path, cls: 'vault-bridge-path' });
      button.onclick = () => {
        if (this.busy) return;
        this.selected = vault; this.destination = vault.destination || ''; invalidate();
        buttons.forEach(b => { b.classList.toggle('is-active', b === button); b.setAttribute('aria-pressed', String(b === button)); });
        copy.setText(`复制到 ${vault.name}`); copy.disabled = false; preview.disabled = false; updateLocation();
      };
      return button;
    };
    vaults.forEach(addChoice);
    copy.disabled = preview.disabled = !vaults.length;
    if (vaults.length) buttons[Math.max(0, vaults.findIndex(v => v.path === this.plugin.settings.lastTarget))].click();
    else choices.createEl('p', { text: '尚未发现其他 Vault。先在 Obsidian 中打开一次目标库，或在下方手动添加。' });
    updateLocation();
    if (warning) content.createEl('p', { text: warning, cls: 'setting-item-description' });
    const setBusy = (busy: boolean) => {
      this.busy = busy;
      content.querySelectorAll('button,input').forEach(el => (el as HTMLInputElement).disabled = busy);
      if (!busy && !this.closed) { copy.disabled = preview.disabled = !this.selected; updateLocation(); }
    };
    preview.onclick = async () => {
      if (!this.selected || this.busy) return;
      setBusy(true); status.setText('正在收集附件…');
      const generation = this.generation;
      try {
        const plan = await planCopy(this.plugin.request(this.selections, this.selected, this.destination));
        if (this.closed || generation !== this.generation) return;
        status.empty(); showReport(status, plan);
      } catch (error) { if (!this.closed) status.setText(errorText(error)); }
      finally { setBusy(false); }
    };
    copy.onclick = async () => {
      if (!this.selected || this.busy) return;
      const target = { ...this.selected, destination: this.destination }; setBusy(true);
      try {
        const plan = await this.plugin.transfer(this.plugin.request(this.selections, target, this.destination), label => { if (!this.closed) status.setText(label); });
        this.plugin.settings.targets = [...this.plugin.settings.targets.filter(t => t.path !== target.path), target];
        this.plugin.settings.lastTarget = target.path;
        try { await this.plugin.saveSettings(); } catch { new Notice('复制已完成，但未能保存目标库偏好。'); }
        this.close(); if (plan.warnings.length) new ReportModal(this.app, plan).open();
      } catch (error) { if (!this.closed) status.setText(`复制失败：${errorText(error)}`); else new Notice(`复制失败：${errorText(error)}`); }
      finally { setBusy(false); }
    };
    const advanced = content.createEl('details', { cls: 'vault-bridge-manual' }); advanced.createEl('summary', { text: '找不到目标库？手动添加' });
    let manualPath = '';
    const manual = new Setting(advanced).setName('Vault 文件夹路径').addText(input => input.setPlaceholder('粘贴目标库路径').onChange(value => { manualPath = value.trim().replace(/^"|"$/g, ''); }));
    manual.addButton(button => button.setButtonText('添加').onClick(async () => {
      if (this.busy) return;
      if (!path.isAbsolute(manualPath)) { new Notice('请填写目标 Vault 的绝对路径。'); return; }
      try {
        await listTargetFolders(manualPath);
        const target: TargetVault = { name: path.basename(manualPath), path: manualPath, destination: '' };
        addChoice(target).click(); advanced.open = false;
      } catch (error) { new Notice(errorText(error)); }
    }));
    content.createEl('p', { text: '自动携带附件，重名自动改名，源文件保留。也可拖入另一个已启用 VaultBridge 的 Vault 文件列表。', cls: 'setting-item-description' });
  }
}

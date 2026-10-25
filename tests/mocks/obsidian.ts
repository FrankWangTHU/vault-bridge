import * as path from 'node:path';
export class Plugin {
  app: any;
  commands: any[] = [];
  settingTabs: any[] = [];
  domEvents = new Map<string, (...args: any[]) => void>();
  constructor(app: any) { this.app = app; }
  async loadData() { return {}; }
  async saveData(_data: unknown) {}
  addSettingTab(tab: unknown) { this.settingTabs.push(tab); }
  registerEvent(_event: unknown) {}
  registerDomEvent(_element: unknown, name: string, callback: (...args: any[]) => void) { this.domEvents.set(name, callback); }
  addCommand(command: unknown) { this.commands.push(command); }
  removeCommand(id: string) { this.commands = this.commands.filter(command => command.id !== id); }
}
export class FileSystemAdapter {
  constructor(private root: string) {}
  getBasePath() { return this.root; }
  getFullPath(relative: string) { return path.join(this.root, relative); }
}
export class Notice { static messages: string[] = []; constructor(text: string) { Notice.messages.push(text); } }
export class PluginSettingTab {
  containerEl = document.createElement('div');
  constructor(_app: unknown, _plugin: unknown) {}
}
export class Modal {
  app: any;
  modalEl = document.createElement('div');
  contentEl = document.createElement('div');
  constructor(app: any) { this.app = app; this.modalEl.append(this.contentEl); }
  open() { document.body.append(this.modalEl); (this as any).onOpen?.(); }
  close() { (this as any).onClose?.(); this.modalEl.remove(); }
}
export class Setting {
  constructor(private container: HTMLElement) {}
  setName(name: string) { const el = document.createElement('span'); el.textContent = name; this.container.append(el); return this; }
  setDesc(desc: string) { const el = document.createElement('p'); el.textContent = desc; this.container.append(el); return this; }
  addDropdown(callback: (component: any) => void) {
    const select = document.createElement('select'); this.container.append(select);
    const component = {
      addOption: (value: string, label: string) => { const option = document.createElement('option'); option.value = value; option.textContent = label; select.append(option); return component; },
      setValue: (value: string) => { select.value = value; return component; },
      onChange: (fn: (value: string) => void) => { select.onchange = () => fn(select.value); return component; },
    };
    callback(component); return this;
  }
  addToggle(callback: (component: any) => void) {
    const input = document.createElement('input'); input.type = 'checkbox'; this.container.append(input);
    const component = { setValue: (value: boolean) => { input.checked = value; return component; }, onChange: (fn: (value: boolean) => void) => { input.onchange = () => fn(input.checked); return component; } };
    callback(component); return this;
  }
  addText(callback: (component: any) => void) {
    const input = document.createElement('input'); this.container.append(input);
    const component = { setPlaceholder: (text: string) => { input.placeholder = text; return component; }, onChange: (fn: (v: string) => void) => { input.oninput = () => fn(input.value); return component; } };
    callback(component); return this;
  }
  addButton(callback: (component: any) => void) {
    const button = document.createElement('button'); this.container.append(button);
    const component = { setButtonText: (text: string) => { button.textContent = text; return component; }, onClick: (fn: () => void) => { button.onclick = fn; return component; } };
    callback(component); return this;
  }
}
export class TFile {}
export class TAbstractFile {}
export class App {}


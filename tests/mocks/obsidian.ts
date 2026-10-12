import * as path from 'node:path';
export class Plugin {
  app: any;
  commands: any[] = [];
  domEvents = new Map<string, (...args: any[]) => void>();
  constructor(app: any) { this.app = app; }
  async loadData() { return {}; }
  async saveData(_data: unknown) {}
  addSettingTab(_tab: unknown) {}
  registerEvent(_event: unknown) {}
  registerDomEvent(_element: unknown, name: string, callback: (...args: any[]) => void) { this.domEvents.set(name, callback); }
  addCommand(command: unknown) { this.commands.push(command); }
}
export class FileSystemAdapter {
  constructor(private root: string) {}
  getBasePath() { return this.root; }
  getFullPath(relative: string) { return path.join(this.root, relative); }
}
export class Notice { static messages: string[] = []; constructor(text: string) { Notice.messages.push(text); } }
export class PluginSettingTab { constructor(_app: unknown, _plugin: unknown) {} }
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
  setName(_name: string) { return this; }
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

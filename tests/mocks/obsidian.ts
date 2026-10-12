import * as path from 'node:path';
export class Plugin {
  app: any;
  commands: any[] = [];
  constructor(app: any) { this.app = app; }
  async loadData() { return {}; }
  async saveData(_data: unknown) {}
  addSettingTab(_tab: unknown) {}
  registerEvent(_event: unknown) {}
  addCommand(command: unknown) { this.commands.push(command); }
}
export class FileSystemAdapter {
  constructor(private root: string) {}
  getBasePath() { return this.root; }
  getFullPath(relative: string) { return path.join(this.root, relative); }
}
export class Notice { static messages: string[] = []; constructor(text: string) { Notice.messages.push(text); } }
export class PluginSettingTab { constructor(_app: unknown, _plugin: unknown) {} }
export class Modal {}
export class Setting {}
export class TFile {}
export class TAbstractFile {}
export class App {}

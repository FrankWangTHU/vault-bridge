# NoteParcel

**Take your notes anywhere—with attachments and links along for the ride.**

**English** | [简体中文](README.zh-CN.md)

Move research from one Obsidian vault to another without gathering attachments by hand. NoteParcel copies selected notes and folders, brings their local attachments, and updates links between copied files. Paste math and tables from ChatGPT or the web into a cleaner Markdown workflow, and copy local file paths whenever another app needs them.

**Desktop only · Obsidian 1.7.2+ · English / Simplified Chinese interface · Local processing.** No account, API key, telemetry, or content uploads.

## Less cleanup. More time for your ideas.

- **Pack your notes, not just the text.** Copy notes or entire folders to another vault with their referenced local attachments.
- **Drag, drop, keep working.** Stable cross-window drag-and-drop lets you copy notes, folders, or multiple selected items into another vault's file explorer.
- **Keep copied links connected.** Links between copied files are updated automatically. Shared attachments are copied once, conflicting filenames are numbered, and existing files stay untouched.
- **Make pasted math and tables readable.** Convert supported LaTeX delimiters and HTML tables on paste, or repair selected text or the current note with undo support.
- **Get a file path in a click.** Copy an absolute file or folder path from the context menu.

Use it to bring research into a project vault, reuse a collection of notes, or keep formulas and tables readable without interrupting your writing.

⭐ **Finding NoteParcel useful? [Give it a Star on GitHub](https://github.com/FrankWangTHU/vault-bridge)** to support the project and help more Obsidian users discover it. Bug reports and suggestions are welcome, too.

## Interface language

Open **Settings → NoteParcel → Interface language** and choose **Follow Obsidian**, **简体中文**, or **English**. Automatic mode uses Simplified Chinese for Chinese Obsidian interfaces and English for other languages. Menus, commands, settings, copy dialogs, progress, and plugin notices are translated. Language changes take effect immediately for settings, commands, and newly opened menus/dialogs. Your settings, hotkeys, filenames, and paths are preserved.

## Installation

Install **NoteParcel** from **Settings → Community plugins → Browse**, or open the [community listing](https://community.obsidian.md/plugins/vault-bridge-toolkit) and select **Add to Obsidian**.

在“设置 → 第三方插件 → 浏览”中搜索 **NoteParcel** 并安装，或打开[社区插件页面](https://community.obsidian.md/plugins/vault-bridge-toolkit)，点击 **Add to Obsidian**。详细中文操作步骤请见[完整中文指南](README.zh-CN.md)。

For manual installation from GitHub / 从 GitHub 手动安装：

1. Download `vault-bridge-toolkit-0.2.5.zip` from [Releases](https://github.com/FrankWangTHU/vault-bridge/releases). Do not use the automatically generated Source code archive.
2. Extract the `vault-bridge-toolkit` folder into your vault's `.obsidian/plugins/` directory.
3. Verify that `main.js`, `manifest.json`, and `styles.css` are directly inside `.obsidian/plugins/vault-bridge-toolkit/`.
4. Restart Obsidian and enable NoteParcel in **Settings → Community plugins**.

To upgrade, replace the plugin files and keep your existing `data.json`. Reload the plugin or restart Obsidian. Upgrading does not modify existing notes.

**Name change / 更名说明:** Formerly **VaultBridge Toolkit**, renamed in 0.2.3. The plugin ID `vault-bridge-toolkit`, installation folder, saved settings, command IDs, and GitHub repository remain the same; 0.2.2 users can update in place. 本项目原名“库桥工具箱”，现为“笔记包裹”；插件标识及安装目录保持不变，0.2.2 用户可直接升级并保留设置和快捷键。

**Upgrading from 0.2.1 or earlier:** the old `vault-bridge` ID belongs to a different author's community plugin. This project now uses `vault-bridge-toolkit`; its GitHub repository stays the same. Disable this project's old installation, install the new folder, and optionally copy your own old `data.json` into the new folder before enabling it. Do not enable both copies. Reassign custom hotkeys to the new plugin commands. Do not install the unrelated community entry named “Vault Bridge” as an update to this project. Existing note and attachment paths are unchanged.

## Copy a file path

Right-click a file or folder and choose **复制本地绝对路径** (Copy local absolute path). For the active note, use **复制当前文件本地路径** in the command palette. The copied path includes the file extension and uses your operating system's native format.

## Copy to another vault

1. Save your edits. Select notes or a folder in the file explorer, then choose **复制到其他 Vault…** (Copy to another vault) from the context menu.
2. Click the destination vault. Registered vaults appear automatically, including closed vaults that are available on disk.
3. Use **选择文件夹…** (Choose folder) to browse the destination, or keep the vault root. The last vault and folder are remembered.
4. Click **复制到…** (Copy to). **查看明细** (View details) is an optional preview. Any unresolved attachment or uncopied note links are reported.

If a vault is missing, open it once with Obsidian or expand the manual-add section. Destination vaults must have a default `.obsidian` configuration folder.

### Attachment and link rules

Copying a folder preserves its name, hierarchy, internal attachments, and empty folders. Local attachments referenced outside the selected content are collected into `_attachments/vault-bridge/` under the destination folder. Shared attachments are copied once. Conflicts become `name (1).ext`, `name (2).ext`, and so on.

Wiki links, embeds, aliases, image widths, heading/block references, PDF page fragments, and ordinary/reference-style Markdown links are supported. Copied wiki links use full paths within the destination vault; Markdown links use relative paths. Links to other notes are not followed recursively. Uncopied links are left intact and reported; they may resolve to a different same-named note in the target vault.

The source is never deleted or changed. Existing destination files are never overwritten. A failed copy attempts to remove only the files and empty folders created by that operation. Forced termination or disk errors can prevent complete rollback.

### Drag between vault windows

Enable NoteParcel in both vaults (drag support was introduced in VaultBridge 0.2.0). Drag notes, a folder, or multiple selected items from the source file explorer into the destination vault's file explorer:

- Drop on a folder to copy into it.
- Drop on a note to copy into that note's parent folder.
- Drop on the root area to copy into the vault root.

Only dropping into the other vault's file explorer triggers copying. Merely leaving the source window does not. Same-vault dragging keeps Obsidian's normal behavior. Disable cross-vault dragging in settings if needed.

Cross-window drag-and-drop is stable and available for everyday use. It copies your content while preserving the source files. The context-menu copy workflow is also available.

## Repair pasted math and tables

Normal editor paste automatically recognizes:

- `\(x^2\)` → `$x^2$`.
- `\[...\]` → a display-math block with standalone `$$` delimiters.
- Lost delimiter backslashes, such as `[ \boxed{...} ]`, `(P(\theta))`, or `(P(D))`, when balanced brackets contain clear mathematical syntax.
- Ordinary HTML tables, including cell formulas, escaped pipes, and line breaks.
- KaTeX/MathJax HTML containing LaTeX annotations, without duplicating visible and hidden math layers.

For content already in a note, run **修复当前笔记的公式** (Repair math in current note). For selected text, run **修复选中的公式和表格** (Repair selected math and tables). Each conversion uses one editor change and can be undone once. Automatic conversion can be disabled in settings.

Code blocks, inline code, frontmatter, and existing dollar-delimited math are protected. File/image pastes and paste events already handled by another plugin are left alone.

## Privacy and filesystem access

No network requests, payments, accounts, or API keys are required by the plugin. It has no telemetry.

To discover your vaults, NoteParcel reads **Obsidian's application-level `obsidian.json` registry outside the current vault**. It does not scan your disk. It also reads the selected source files and attachments, lists folders in the chosen destination vault, and writes copies there. Personal paths and destination preferences are saved only in the plugin's local `data.json`, which is excluded from this repository.

The registry is an internal Obsidian format; if it changes, use manual entry. Source files outside the source vault, symbolic links, configuration folders, `.git`, and `.trash` are excluded from copying.

## Limitations and verification

- Desktop only. Automated checks run on Windows and Linux; macOS testing remains outstanding.
- Copies use saved files. Save edits before copying or dragging.
- No dependency parsing inside frontmatter, raw HTML, Canvas, or third-party plugin files. Such files are copied as ordinary files where applicable.
- Remote attachments are not downloaded. Source and destination vaults cannot be identical or nested.
- Math images and visual-only formulas without LaTeX source are not reconstructed. Merged or nested HTML tables retain normal paste behavior with a notice. The first table row becomes the Markdown header.
- Plain text that has lost its table structure cannot reliably be restored.
- Automated tests cover representative clipboard HTML and simulated UI events. For manual verification steps, see [TESTING.md](TESTING.md).

## Development

Use Node.js 22 and the pnpm version specified in `package.json`:

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm check
pnpm package
```

`pnpm dev` watches source changes. `pnpm check` runs TypeScript checking, tests, and a build. `pnpm package` creates the installable ZIP in `dist/`.

Source modules separate event integration, UI, vault discovery, dragging, copy planning/execution, and content conversion. File-copy tests use temporary vaults, not personal notes.

## Links and license

Created by **Yanlu Wang / [FrankWangTHU](https://github.com/FrankWangTHU)**.

- [Project: FrankWangTHU/vault-bridge](https://github.com/FrankWangTHU/vault-bridge)
- [Downloads and release notes](https://github.com/FrankWangTHU/vault-bridge/releases)
- [Bug reports and feature requests](https://github.com/FrankWangTHU/vault-bridge/issues)

[MIT License](LICENSE). Bundled dependency licenses are included in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and the built JavaScript.


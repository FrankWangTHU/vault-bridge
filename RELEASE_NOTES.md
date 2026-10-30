# NoteParcel 0.2.6

## English

Copy referenced Excalidraw drawings across vaults and keep external attachments organized by note name. Resolves [#1](https://github.com/FrankWangTHU/vault-bridge/issues/1).

- External attachments now default to `assets/<final note name>/` beside each copied note, including upgrades without an attachment-location preference. Shared attachments get a separate copy for each note in this mode.
- Choose **Settings → NoteParcel → Attachment location → Shared attachment folder** to use the previous `_attachments/vault-bridge/` layout. Attachments inside a selected folder keep their existing structure in either mode.
- Referenced `.excalidraw.md` drawings, nested drawings and their local Markdown/wiki attachment links are now collected and rewritten. Frame/block selectors and embed widths such as `#^frame=…|100%` are preserved. Drawing scene data stays intact.
- Context-menu copies and cross-vault drag-and-drop both support the attachment setting. English and Simplified Chinese settings and guides are updated.
- Path checks reject blocked or symbolic-link attachment directories before filename conflict handling.

Verified with 66 automated tests, Windows/Linux checks, and installation packaging. Legacy `.excalidraw` JSON is copied intact; its internal dependencies are not parsed. Source files and existing destination files are preserved.

Update through Obsidian's community plugins when the directory has processed this release, or install `vault-bridge-toolkit-0.2.6.zip` from this release. Keep your existing `data.json` and reload the plugin. Cross-vault drag-and-drop users should update both vaults.

## 简体中文

修复跨库复制中的 Excalidraw 引用，并默认按笔记名整理外部附件，解决 [#1](https://github.com/FrankWangTHU/vault-bridge/issues/1)。

- 外部附件默认放到复制后笔记旁的 `assets/<最终笔记名>/`，升级时尚未设置此选项也使用该默认值。多篇笔记共用的附件会为每篇笔记各保留一份副本。
- 可在“设置 → NoteParcel → 附件存放方式 → 共享附件目录”切回原来的 `_attachments/vault-bridge/` 布局。所选文件夹内的附件在两种模式下均保留原有目录结构。
- 自动携带引用的 `.excalidraw.md` 绘图、嵌套绘图及其 Markdown/双链本地附件，并更新链接；保留 `#^frame=…|100%` 等帧/块定位和显示尺寸，保持绘图场景数据完整。
- 右键复制与跨库拖入均支持该选项，中英文设置和指南同步更新。
- 附件目录被文件或符号链接占用时，及时报告问题，避免反复尝试重名编号。

已通过 66 项自动测试、Windows/Linux 检查和安装包验证。旧式 `.excalidraw` JSON 保持原样复制，内部依赖暂不解析。源文件与目标已有文件保持原样。

社区目录处理此版本后可在 Obsidian 中检查更新，也可下载安装本页的 `vault-bridge-toolkit-0.2.6.zip`。保留原有 `data.json` 并重载插件。跨库拖拽建议两个库都更新。

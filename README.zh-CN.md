# VaultBridge（库桥）

[English](README.md) | [简体中文](README.zh-CN.md) · [项目仓库](https://github.com/FrankWangTHU/vault-bridge) · [下载](https://github.com/FrankWangTHU/vault-bridge/releases) · [反馈问题](https://github.com/FrankWangTHU/vault-bridge/issues)

让 Obsidian 笔记在本地文件、不同 Vault 和聊天内容之间流转。适用于 **Obsidian 1.7.2 及以上桌面版**，中文界面。

## 安装

1. 从 [Releases](https://github.com/FrankWangTHU/vault-bridge/releases) 下载 `vault-bridge-0.2.1.zip`，不要下载 GitHub 自动生成的 Source code 压缩包。
2. 将压缩包里的 `vault-bridge` 文件夹放入你的 Vault 的 `.obsidian/plugins/` 目录。
3. 确认 `.obsidian/plugins/vault-bridge/` 下直接包含 `main.js`、`manifest.json`、`styles.css`。
4. 重启 Obsidian，在“设置 → 第三方插件”中允许使用第三方插件并启用 **VaultBridge**。

也可以运行下方开发命令，从本地 `dist/` 获取同样的安装包。目前尚未上架社区插件市场，提交和审核完成前请使用 GitHub 安装包。中英文介绍均已提供；插件界面目前为中文。

## 使用

### 复制本地路径

右键文件或文件夹，选择“复制本地绝对路径”。也可在命令面板运行“VaultBridge: 复制当前文件本地路径”。复制结果是系统原生绝对路径，包含文件扩展名，可直接用于其他应用。

### 携带附件复制到其他 Vault

1. 保存正在编辑的笔记，右键笔记或文件夹，选择“复制到其他 Vault…”。
2. 窗口自动列出 Obsidian 已登记的其他 Vault，点击目标库即可；不必填写名称或路径。目标库不必打开，但需已有 `.obsidian` 文件夹。
3. 默认放到库根目录；点击“选择文件夹…”可直接浏览目标库的文件夹。上次选择的库和目录会被记住。
4. 点击“复制到…”。无需先预览；想检查文件去向时可点击“查看明细”。源文件和目标已有文件保持原样，复制后会列出未迁移链接等提示。

支持在文件列表中多选后右键复制。找不到目标库时，先在 Obsidian 中打开一次该库，或展开窗口底部“手动添加”。自动发现读取本机 Obsidian 的 `obsidian.json` 登记信息，不扫描整块磁盘；该内部格式若随 Obsidian 更新变化，可使用手动添加。

例如，将 `项目/笔记.md` 导入另一个库的 `研究` 目录：

```text
目标库/
  研究/
    笔记.md
    _attachments/vault-bridge/
      图片.png
      论文.pdf
```

复制文件夹时保留该文件夹名称、内部层级和空目录。位于文件夹内部的附件保留原位置，引用的外部附件放入 `_attachments/vault-bridge/`。共享附件只复制一次，不同来源的同名附件分别保存。同名文件增加 ` (1)`、` (2)` 等序号，笔记内链接随之更新。

支持 `[[笔记|别名]]`、`![[图片.png|300]]`、标题/块定位、PDF 页码，以及普通和引用式 Markdown 链接。复制后的双链使用目标库内完整路径；Markdown 链接使用相对路径。仅改写复制范围内的链接，未复制的其他笔记链接保留并提示，它们在目标库中可能指向同名笔记。

### 拖到另一个 Vault 的左侧文件列表（实验性）

两边都安装并启用 0.2.0 或更新版 VaultBridge，同时打开两个 Vault 窗口。从源库左侧文件列表拖出笔记、文件夹或多个选中项，放到目标库左侧文件夹上，即复制到该文件夹；放到笔记上则复制到它所在的文件夹，放到列表根区域则复制到库根目录。自动携带附件并改写链接，源文件保留。

只有在另一个 Vault 的文件列表内松开鼠标才触发复制；仅拖出窗口不会复制。库内拖动保持 Obsidian 原有行为。目标库未启用新版插件时，插件无法接管该窗口。此功能依赖 Obsidian 文件列表结构及桌面跨窗口拖拽机制，已验证模拟事件，尚未通过真实跨窗口操作验收；失败时可使用右键复制。设置中可关闭跨库拖拽。

### 粘贴公式与表格

启用插件后，在 Markdown 编辑器正常粘贴即可自动识别：

- `\(x^2\)` → `$x^2$`。
- `\[...\]` → 独立行的 `$$` 公式块。
- 复制时分隔符反斜杠丢失的 `[ \boxed{...} ]`、`(P(\theta))`、`(P(D))` → 对应块公式或行内公式。只修复括号平衡且有明确数学特征的内容。
- 网页复制的普通 HTML 表格 → Markdown 表格，包括单元格中的公式、竖线和换行。
- HTML 中携带 LaTeX 标注的 KaTeX/MathJax 公式 → 原始公式，避免视觉层和隐藏层重复出现。

在插件设置中可以关闭自动转换。已经粘贴坏的笔记，可运行“VaultBridge: 修复当前笔记的公式”；也可选中一部分后运行“VaultBridge: 修复选中的公式和表格”。可在 Obsidian 快捷键设置中分配快捷键。转换以一次编辑写入，可使用撤销恢复；升级插件不会自动改写已有笔记。

代码块、行内代码、笔记属性区和已有 `$...$` / `$$...$$` 公式受保护。普通文本、图片和文件粘贴不接管；不修改其他插件已经处理的粘贴事件。

## 支持边界

- 仅桌面端。优先在 Windows 开发，自动检查同时覆盖 Windows/Linux；macOS 和真实 Obsidian 界面仍需手动验收。
- 跨库复制以已保存的 Markdown 笔记为基础，不递归复制其他关联笔记。属性区、原始 HTML 标签、Canvas、第三方插件文件内部的附件引用不解析；相关提示会在预览中出现。
- 远程 URL 保持不变，不下载网页附件。不读取或复制 Vault 外部文件、符号链接、`.obsidian`、`.git`、`.trash` 或源库自定义配置目录。
- 目标 Vault 使用默认 `.obsidian` 配置目录；源库支持自定义配置目录的排除。目标与源库不能相同或相互嵌套。
- 文件重名自动改名；遇到文件夹路径被普通文件占用、大小写不一致的父目录等情况会要求修正目录后重新预览。预览后源文件或目标位置变化时停止复制，避免使用过期映射。
- 复制失败会回滚本次新建文件，仅删除空的新建目录；异常断电或进程被强制退出无法保证自动回滚。磁盘或权限问题导致清理失败时会列出残留文件。
- 不对公式图片或只有视觉文字、缺少 LaTeX 源码的公式做 OCR/猜测还原。合并单元格、嵌套表格不强行转换，会保留默认粘贴并提示。HTML 表格首行作为 Markdown 表头。
- 仅剩纯文本的表格若已无行列结构，不能可靠还原；请使用网页复制保留 HTML 或复制 Markdown 原文。

## 隐私

无需账号、API 密钥或联网。转换和复制都在本机完成。目标库路径只保存在本地插件的 `data.json`，该文件已被 Git 忽略。插件不包含遥测或内容上传。

为了发现已有 Vault，插件会读取**当前库之外的 Obsidian 应用配置文件 `obsidian.json`**，不扫描整块磁盘。跨库复制会读取所选源文件及附件、浏览用户选择的目标库文件夹，并向该目标库写入副本。上述访问全部发生在本地；不复制源库外的附件或其他文件。

## 开发

使用 Node.js 22 和项目指定版本的 pnpm：

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm check
pnpm package
```

`pnpm dev` 开启构建监听。`pnpm check` 依次进行 TypeScript 检查、Vitest 测试和 esbuild 构建。`pnpm package` 生成安装文件夹与 ZIP。

主要模块：`src/main.ts` 负责 Obsidian 菜单、设置与事件；`src/ui.ts` 负责复制和文件夹选择窗口；`src/vaults.ts` 负责发现已登记的库；`src/drag.ts` 负责拖拽协议和位置识别；`src/copy.ts` 负责复制规划与执行；`src/format.ts` 负责剪贴板转换。Markdown 解析与保护范围单独封装，测试使用临时目录，不访问真实 Vault。

每次推送运行 Windows/Linux 自动检查；推送与 manifest 版本一致的标签（例如 `0.2.0`）时，发布流程先检查再生成 GitHub Release，附带安装 ZIP 和三个插件文件。

手动验收方法见 [TESTING.md](TESTING.md)。MIT License。

作者：**Yanlu Wang / [FrankWangTHU](https://github.com/FrankWangTHU)**。项目主页：[FrankWangTHU/vault-bridge](https://github.com/FrankWangTHU/vault-bridge)。第三方依赖许可见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)，同时保留在发布的 JavaScript 中。

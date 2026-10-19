# Community directory submission / 社区插件申请

Status (2026-10-19): NoteParcel 0.2.4 review completed, with no blocking errors. Build verification reproduced main.js byte-for-byte. The public listing's Add to Obsidian installation link is enabled. Non-blocking warnings remain; the review badge is Caution.

状态（2026-10-19）：NoteParcel 0.2.4 已完成审核，无阻断错误，main.js 逐字节构建验证通过。市场页面的 Add to Obsidian 安装入口已开放。仍有非阻断警告，审核标记为 Caution。

## Repository / 仓库

[https://github.com/FrankWangTHU/vault-bridge](https://github.com/FrankWangTHU/vault-bridge)

Plugin ID: `vault-bridge-toolkit` · Name: **NoteParcel** · Author: **Yanlu Wang** · License: **MIT** · Desktop only, Obsidian 1.7.2+.

The earlier ID `vault-bridge` is occupied by another author's plugin. Version 0.2.2 uses this distinct ID; the GitHub repository URL is unchanged. / 原标识被另一位作者占用，0.2.2 已改用独立标识，仓库地址不变。

## English introduction

NoteParcel helps you copy notes and their attachments between Obsidian vaults, copy local file paths, and repair math and tables pasted from ChatGPT or the web. Pick a registered vault and a destination folder, then copy without overwriting existing files. Links between copied files are updated, shared attachments are collected once, and the source stays intact. Formula repair works during paste or on existing notes, with undo support. Everything runs locally, without API keys or uploads.

Documentation is available in English and Chinese; the plugin interface currently uses Chinese. Cross-window dragging is experimental and requires NoteParcel in both vaults.

Source, downloads, and feedback: [FrankWangTHU/vault-bridge](https://github.com/FrankWangTHU/vault-bridge).

## 中文介绍

NoteParcel（笔记包裹）让 Obsidian 笔记跨库复制更方便：自动识别已有 Vault，选好目标库和文件夹，即可将笔记连同附件一起复制，更新已复制文件之间的链接，并自动处理重名，不覆盖已有文件、不改动源笔记。右键可复制文件的本地绝对路径；从 ChatGPT 或网页粘贴的公式和表格可自动转换，也支持修复已有笔记并撤销。全部处理在本地完成，无需 API 密钥或上传内容。

提供中英文说明，插件界面目前为中文。跨窗口拖拽为实验性功能，两个 Vault 都需启用插件。

源码、下载和反馈：[FrankWangTHU/vault-bridge](https://github.com/FrankWangTHU/vault-bridge)。

## Submission steps / 提交步骤

Follow the current [official submission guide](https://docs.obsidian.md/Plugins/Releasing/Submit%20your%20plugin) and [account setup guide](https://docs.obsidian.md/community-directory/set-up-and-claim):

1. Sign in at [community.obsidian.md](https://community.obsidian.md) with your Obsidian account. / 使用 Obsidian 账号登录。
2. Connect the GitHub account **FrankWangTHU** in the community profile. / 在社区资料页关联 GitHub 账号。
3. Open **Plugins → New plugin**, enter the repository URL above, and choose yourself as owner. / 新增插件，填写上述仓库地址，所有者选择自己。
4. Review the developer policies and maintenance commitment, then submit. / 阅读开发者政策和维护承诺并提交。
5. Resolve review feedback in the repository and publish a new version if required; publish the entry when eligible. / 根据审核反馈修改并发布新版本，通过后发布市场条目。

The directory reads the manifest and README from the repository. The release tag must match the manifest version and include `main.js`, `manifest.json`, and `styles.css`. Track the live review at [the plugin account page](https://community.obsidian.md/account/plugins/vault-bridge-toolkit).

目录会读取仓库的 manifest 和 README。Release 标签需与版本号一致，附带三个插件文件。实际审核状态以插件后台为准。

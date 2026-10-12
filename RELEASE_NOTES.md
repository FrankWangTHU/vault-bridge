VaultBridge（库桥）0.1.0：

- 文件/文件夹右键复制本地绝对路径。
- 笔记或文件夹携带本地附件跨 Vault 复制，预览清单、重名改名并更新链接。
- 自动转换粘贴的 LaTeX 公式、带公式源码的 HTML 和普通 HTML 表格，可关闭自动转换或手动转换选区。

下载 `vault-bridge-0.1.0.zip`，将其中的 `vault-bridge` 文件夹放入 Vault 的 `.obsidian/plugins/`，然后在 Obsidian 第三方插件设置中启用。需 Obsidian 1.7.2+ 桌面版。

首版不递归复制关联笔记，不解析属性区/HTML/Canvas 内部附件，复杂表格和缺少 LaTeX 源码的公式保留默认粘贴。真实 Obsidian 和真实 ChatGPT 剪贴板的端到端验收仍待完成，详见 README 与 TESTING。

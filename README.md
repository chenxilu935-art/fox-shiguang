# 狐の林间拾光室

面向 Obsidian 的本地小红书收藏整理插件，插件 ID 为 `fox-shiguang`。Stage 3.1 是独立运行骨架，包含原生设置、欢迎向导以及 Inbox 和 Bookmarks 的只读文件名预览。

抓取小红书收藏和下载媒体需要配套使用基于 [RedLink（上游作者 boaleiyt）](https://github.com/boaleiyt/redlink) 改编的拾光室适配插件。狐の林间拾光室负责 Vault 内收藏的整理与展示。两个插件各自管理配置，通过 Markdown 与媒体文件协作。

本分支保留已验收的 Stage 3.1 基线。主题关联体验版在 [Stage 3.2 开发分支](https://github.com/chenxilu935-art/fox-shiguang/tree/stage-3.2-topic-associations)。

## 安装

使用桌面版 Obsidian。关闭隔离 Vault 的受限模式，将安装 ZIP 中的 `fox-shiguang` 文件夹放入该 Vault 的 `.obsidian/plugins/`，再从第三方插件列表启用。首次启动会打开设置向导。也可从命令面板运行「狐の林间拾光室：打开拾光室」，从 Obsidian 插件设置修改路径和分类。

无采集插件也可启动。默认路径为 `RedNote/Inbox`、`RedNote/Bookmarks`、`RedNote/Cache` 和 `RedNote/Covers`。如果已有采集工具，请在向导或设置中填入它实际使用的 Vault 相对路径。插件不会创建收藏目录或下载媒体。

停用插件会关闭拾光室视图。卸载前如需留存设置，请先备份本插件的 `data.json`。Obsidian 卸载会移除插件安装目录。收藏文件夹及独立于该目录的媒体仍由 Vault 管理。

## 构建

需要 Node.js 20 或更新版本，以及 npm。在源码目录运行：

```sh
npm ci
npm test
npm run build
```

产物是 `dist/fox-shiguang/` 内的 `manifest.json`、`main.js`、`styles.css` 和 `LICENSE`。从这四个文件重建 ZIP，并保留顶层 `fox-shiguang/` 文件夹。开发安装和打包须在独立 Vault 及项目目录进行。

## 当前能力

- 独立 Obsidian 视图、打开命令和原生设置页。
- 可稍后完成或从设置重新运行的首次启动向导。向导完成前的临时选择不会写盘。
- 四个收藏目录、自动刷新、手动扫描、默认浏览页和排序。
- 通用主题模板和本地分类的增删改、顺序、图标、颜色。操作只影响分类设置。
- 默认关闭的 AI 偏好和服务商、模型名称配置。当前版本没有模型调用或凭证输入。

## 数据和后续工作

Inbox 用于待整理收藏，Bookmarks 用于已保留收藏，森林书桌的正式入库是独立的知识整理流程。Stage 3.2 从文件名预览继续接入小红书 Markdown、主题关联、阅读器和收藏操作。公开发布前需逐项核对现有森林界面源码和素材的再分发许可。

[数据与配置结构](docs/data-and-config.md) · [许可证](LICENSE)

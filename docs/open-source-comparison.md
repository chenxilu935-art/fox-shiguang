# 开源项目比较

2026-11-20 编码前通过 GitHub 搜索与官方 REST API 核验。Stars 为查询时快照，更新时间采用最近代码推送 `pushed_at`，不把关注或元数据更新时间算作代码更新。本轮仅借鉴，未复制这些项目的代码。

| 项目 | Stars | 最近代码推送 UTC | 许可 | 技术栈 | 安装与改造 |
| --- | ---: | --- | --- | --- | --- |
| [Notes Explorer](https://github.com/tu2-atmanand/obsidian-notes-explorer) | 133 | 2025-11-04 13:44:35 | MIT | TypeScript、Svelte 4、minimasonry、sortablejs | 可从社区插件安装，直接获得本地笔记卡片、画廊/瀑布流与搜索筛选。要接入拾光室主题、收录及原版森林布局，需中高成本二开；较长时间未推送，有兼容维护风险。 |
| [MAKE.md](https://github.com/Make-md/makemd) | 2051 | 2026-07-09 04:50:46 | MIT | TypeScript、React 18、CodeMirror、sql.js | 插件部署较容易，集合、关系、表格与多视图可直接使用。要还原原版界面并保持当前 Markdown 主题结构，改造成本高；引入依赖多、数据模型和工作区行为迁移风险较大。 |
| [Dashboard Navigator](https://github.com/drbap/dashboard-navigator-for-obsidian) | 260 | 2026-08-24 07:11:17 | MIT | TypeScript、Obsidian API | 普通搜索、标签与收藏导航可直接用，无服务端部署。森林卡片、阅读器、多主题和 Inbox 收录需中高成本二开；仓库已归档，后续维护由采用者承担。 |

许可已核对各仓库当前 LICENSE；Notes Explorer 的 README 徽章仍写 GPL-3.0，但 LICENSE 正文和 package.json 均写 MIT。若未来要复制其代码，应先澄清来源及历史许可，本轮不引入。

三者都不能直接交付本次要求的 FoxDashboard 原版界面。当前独立插件已经具有验收过的设置、Markdown 主题关联与目录跟随逻辑，因此直接提取自有 FoxDashboard 的布局、CSS、森林素材与交互，并通过独立适配层接入现有数据，成本最低。重点风险是宿主依赖、iframe 样式隔离、媒体路径与文件变动后的关联一致性，应以隔离 Vault 实测控制。

核验来源：各项目 [Notes Explorer API](https://api.github.com/repos/tu2-atmanand/obsidian-notes-explorer)、[MAKE.md API](https://api.github.com/repos/Make-md/makemd)、[Dashboard Navigator API](https://api.github.com/repos/drbap/dashboard-navigator-for-obsidian)，以及各仓库 README、package.json、LICENSE。改造成本为基于功能与依赖的工程判断，不是工时报价。

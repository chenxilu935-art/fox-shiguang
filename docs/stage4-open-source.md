# Stage 4 开源借鉴

2026-11-24 编码前通过官方 GitHub REST API 核验。Stars 为查询快照，更新时间采用代码推送时间。本轮没有复制这些项目源码或新增运行依赖。

| 项目 | Stars | 最近推送 UTC | 许可/技术栈 | 直接使用与改造判断 |
| --- | ---: | --- | --- | --- |
| [Outliner](https://github.com/vslinko/obsidian-outliner) | 1377 | 2026-11-07 13:07 | MIT / TypeScript | 普通 Obsidian 插件安装，可直接获得大纲块移动、缩进等编辑行为。适合借鉴有序文档操作；嵌入当前沙盒书桌并衔接来源及入库需中高成本。 |
| [Highlightr](https://github.com/chetachiezikeuzor/Highlightr-Plugin) | 814 | 2023-11-15 02:31 | MPL-2.0 / TypeScript | 插件部署低，可直接进行 Markdown 文字高亮。不是摘录草稿系统；需补自由文档、稳定来源、预览和去重，改造成本高，维护时间及许可证需关注。 |
| [Linter](https://github.com/platers/obsidian-linter) | 2120 | 2026-11-22 20:18 | MIT / TypeScript | 插件部署低，可直接规范 Markdown/YAML。可借鉴元数据校验边界；格式重写不适用于本轮保留原文及自由顺序的要求，不能替代书桌。 |

本轮保留现有森林阅读器、Vault 文件协作与 `shiguangTopics`，参考旧草稿保存队列增量实现。相较引入整套编辑器，保留轻量有序文本与引用块的实现成本和维护负担更低。上述改造成本是工程判断，并非工时报价。

来源：各仓库及 [Outliner API](https://api.github.com/repos/vslinko/obsidian-outliner)、[Highlightr API](https://api.github.com/repos/chetachiezikeuzor/Highlightr-Plugin)、[Linter API](https://api.github.com/repos/platers/obsidian-linter)。

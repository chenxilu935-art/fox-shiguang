# Stage 3.2 森林界面提取清单

本轮复用项目已有 FoxDashboard 拾光室源码，没有采用调研项目的代码或重做一套简化设计。

| 原模块 | 提取与整合 |
| --- | --- |
| shiguang-shell.html | 森林顶部、工具区、卡片网格、右侧已选面板、主题对话框及大预览 dialog；移除工作台导航与冗余说明 |
| shiguang.css | 原配色、尺寸、布局、卡片、纸张阅读器及响应式样式；隔离在 iframe 中 |
| shiguang-ui.txt | 卡片选择、搜索、主题筛选、已选列表、阅读切换和分类交互；接入独立版固定消息 |
| shiguang-view.ts | 仅参考 iframe 消息桥接方式；数据改用独立版 scanSources、Article 和设置 |
| shiguang-reader.ts | 复用 Markdown 安全渲染、媒体占位替换、字节传输及 Blob 生命周期处理；解除 RedLink 解析依赖 |
| shiguang-topics / drafts | 主题使用既有 shiguangTopics 与独立配置；不移植个人侧文件、历史草稿或草稿编辑器 |
| forest-desk.jpg | 沿用已记录来源的生成插画，构建时嵌入 |
| story-atlas.jpg | 示例封面图集不进入独立版，不用于替代真实封面 |
| forest-brand.ts / fox-pines.png | 保留可复用的文字品牌布局；角色图再分发权待核实，不随公开包分发 |
| FoxDashboard / RedLink 宿主 | 移除工作台入口、收藏选择器、登录、抓取和获取媒体调用；插件只读取 Vault 本地文件 |

现有首次向导、原生设置、配置 v1、多主题写入、文件改名与目录跟随逻辑保留。内部 ID 由插件管理，界面使用中文名称。批量保留仅移动笔记到 Bookmarks；清理只将笔记交给 Obsidian 回收站，保留共享媒体。操作前显示确认，遇到重复身份或目标冲突时拒绝覆盖。

AI 默认关闭，关闭时隐藏整组入口和面板；开启仅显示尚未连接状态，不生成模拟推荐。本轮没有网络采集或 AI 服务实现。

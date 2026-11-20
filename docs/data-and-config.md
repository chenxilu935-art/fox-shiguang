# 数据、配置与后续衔接

## 用户本地配置

插件通过 Obsidian `loadData` / `saveData` 读写当前 Vault 中的 `.obsidian/plugins/fox-shiguang/data.json`。在首次保存前可没有该文件。v1 结构如下，内容均为默认值。

```json
{
  "version": 1,
  "initialized": false,
  "root": "小红书raw",
  "paths": {
    "inbox": "小红书raw/RedNote/Inbox",
    "bookmarks": "小红书raw/RedNote/Bookmarks",
    "cache": "小红书raw/RedNote/Cache",
    "covers": "小红书raw/RedNote/Covers"
  },
  "autoRefresh": true,
  "defaultPage": "inbox",
  "sort": "name-asc",
  "categories": [],
  "ai": { "enabled": false, "provider": "", "model": "" }
}
```

- `initialized` 在向导完成后保存，升级保持该值。退出前未保存的选择可从最近一次已保存设置重新开始。显式点击「一键创建默认目录」后，文件夹会立即创建。
- 标准结构从 `root` 推导四个 `paths`。高级结构沿用四个有效路径，Stage 3.1 升级保留旧目录。路径均为 Vault 相对路径，拒绝绝对、隐藏、越界及重叠目录。
- `categories` 保持有序数组，每项保存 `id`、`name`、`icon`、`color`。重命名和排序保留 ID。通用模板使用公开的生活、学习、工作和灵感四类。
- `ai` 只记录启用偏好及服务商、模型名称。关闭时隐藏整组 AI 界面，开启时仅显示未连接状态。本版没有模型调用或凭证输入。
- 结构损坏或为未知版本时，插件提示错误并保留原设置文件。阶段内按单队列保存配置。

### 设置导入与导出

当前通过本地备份实现。停用插件后复制其 `data.json` 到自己的备份位置。恢复前先备份目标 Vault 的同名文件，确认设置版本兼容且四个目录适合目标 Vault，再把文件恢复到插件目录并启用。无需复制收藏、媒体或任何登录信息。目录和分类可含个人信息，备份应放在私有位置。未来若增加导入按钮，先校验同版结构、预览差异和路径，再确认写入。

## 文件协作和主题

- RedLink 适配版负责写入小红书 Markdown、封面和由用户主动补取的媒体。根目录移动后应核对采集路径。本插件不读取或修改 RedLink 账户配置。
- 文章以 `xhs:<原帖ID>` 识别，主题 ID 放在 Markdown 顶部的 `shiguangTopics` 列表。插件设置保存分类名称、图标、颜色和顺序。文章的原帖标签为 `tags`，保持原有语义。未知关联 ID 会保留在原笔记中。
- 删除分类只移除分类定义，保留原笔记中的关联 ID 以便恢复。界面不显示内部 ID；重新创建同名分类会获得新的 ID，不自动匹配历史属性。
- 批量保留将 Inbox 笔记移动到 Bookmarks，不覆盖同名文件。清理调用 Obsidian 的笔记回收操作，遵循用户回收站设置，不删除媒体。文件变更或身份重复时拒绝沿用旧选择。
- 阅读器仅加载已配置收藏目录内的本地媒体，通过内存字节传给隔离界面。笔记上限 1 MiB，单媒体上限 64 MiB、每篇总媒体上限 128 MiB；卡片封面上限 5 MiB。超限媒体请通过 Obsidian 原笔记查看。
- 旧主题 JSON 可在插件设置中选择本地文件预览差异。当前预览不会改写来源 JSON、主题设置或 Markdown。历史草稿仍由原位置管理。
- Bookmarks 以目录表达保留状态。森林书桌正式入库另走由用户确认的知识整理流程，应在设计目标目录、内容格式和覆盖规则后再接入。当前不存在知识库写入接口。

## 再分发和隐私检查

安装包使用 Obsidian 自带图标、样式变量和有来源记录的森林书桌背景。Obsidian 在构建中声明为外部依赖。esbuild、TypeScript、Obsidian 类型及其依赖属于构建环境。esbuild 和 Obsidian 类型的包许可证为 MIT，TypeScript 为 Apache-2.0。构建锁文件固定依赖版本，发布包按固定文件白名单制作。

后续提取已有源码、角色图或字体前，应记录原始许可、再分发权及所需署名。公开发布前应复核待提交文件、Git 历史、发布 ZIP 及构建输出是否含私有数据或绝对路径。

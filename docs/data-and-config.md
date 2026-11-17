# 数据、配置与后续衔接

## 用户本地配置

插件通过 Obsidian `loadData` / `saveData` 读写当前 Vault 中的 `.obsidian/plugins/fox-shiguang/data.json`。在首次保存前可没有该文件。v1 结构如下，内容均为默认值。

```json
{
  "version": 1,
  "initialized": false,
  "paths": {
    "inbox": "RedNote/Inbox",
    "bookmarks": "RedNote/Bookmarks",
    "cache": "RedNote/Cache",
    "covers": "RedNote/Covers"
  },
  "autoRefresh": true,
  "defaultPage": "inbox",
  "sort": "name-asc",
  "categories": [],
  "ai": { "enabled": false, "provider": "", "model": "" }
}
```

- `initialized` 在向导完成后保存，升级保持该值。退出前未保存的步骤可从最近一次已保存设置重新开始。
- `paths` 使用 Vault 相对路径，保存时统一分隔符，拒绝绝对、隐藏、越界及互相重叠的目录。文件扫描通过 Obsidian Vault API，两视图只使用文件名预览。
- `categories` 保持有序数组，每项保存 `id`、`name`、`icon`、`color`。重命名和排序保留 ID。通用模板使用公开的生活、学习、工作和灵感四类。
- `ai` 只记录启用偏好及服务商、模型名称。凭证管理和模型调用需单独设计。当前没有 AI 浏览入口。
- 结构损坏或为未知版本时，插件提示错误并保留原设置文件。阶段内按单队列保存配置。

### 设置导入与导出

当前通过本地备份实现。停用插件后复制其 `data.json` 到自己的备份位置。恢复前先备份目标 Vault 的同名文件，确认设置版本兼容且四个目录适合目标 Vault，再把文件恢复到插件目录并启用。无需复制收藏、媒体或任何登录信息。目录和分类可含个人信息，备份应放在私有位置。未来若增加导入按钮，先校验同版结构、预览差异和路径，再确认写入。

## 文件协作和森林书桌

- 第三方采集工具负责写入小红书 Markdown、封面和由用户主动补取的媒体。Stage 3.1 视图通过 `scanSources` 读取文件列表和目录状态，可在 Stage 3.2 接入 Markdown 属性与媒体缓存解析。没有插件间调用。
- Stage 3.2 需要以 `xhs:<原帖ID>` 为关联键，接入新格式 Inbox 及保有的主题数据，延续已有个人数据，勿自动覆盖或迁移。Stage 3.1 的本地分类目前没有文章关联。现有主题关联与历史草稿须在隔离环境先验证存储归属和回滚。
- Bookmarks 以目录表达保留状态。森林书桌正式入库另走由用户确认的知识整理流程，应在设计目标目录、内容格式和覆盖规则后再接入。当前不存在知识库写入接口。

## 再分发和隐私检查

Stage 3.1 的 TypeScript 和 CSS 为本项目新编写。采用 Obsidian 自带图标和样式变量，安装包没有单独分发旧项目图片、字体、个人记录或示例媒体。Obsidian 在构建中声明为外部依赖。esbuild、TypeScript、Obsidian 类型及其依赖属于构建环境。esbuild 和 Obsidian 类型的包许可证为 MIT，TypeScript 为 Apache-2.0。构建锁文件固定依赖版本，发布包按固定文件白名单制作。

后续提取已有源码、背景、图标或字体前，应记录原始许可、再分发权及所需署名。GitHub 入口待仓库建立后填入。公开发布前应复核待提交文件、Git 历史、发布 ZIP 及构建输出是否含私有数据或绝对路径。

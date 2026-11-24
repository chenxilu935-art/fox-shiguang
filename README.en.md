# Fox Shiguang — Forest Collection Room

An independent desktop Obsidian plugin for browsing and organizing local RedNote Markdown collections. Plugin ID: `fox-shiguang`. Version `0.3.0-beta.1` is a prerelease; try it in a separate Vault first.

This release restores the original atmospheric text, single-entry sidebar and fox decoration. See the [UI restoration notes](docs/ui-restoration-preview.md). Future dashboard, learning, radar and collection navigation slots remain unconnected and are not shown as inactive entries.

The forest layout, cards, selection panel and large reading dialog are extracted from the existing FoxDashboard implementation. The plugin uses its own settings and data layer and does not require FoxDashboard or RedLink to browse existing files.

## Install

Requires desktop Obsidian 1.6.6 or later. Extract the release ZIP into your Vault's `.obsidian/plugins/` directory, keeping the `fox-shiguang` folder. Enable community plugins and enable the plugin. Complete the first-run wizard, then use the command “打开拾光室” to open the collection room. Configure folders, topic templates and display preferences in Obsidian's native plugin settings.

Default directories are `小红书raw/RedNote/Inbox`, `Bookmarks`, `Cache` and `Covers`. RedLink handles login, collection and media downloads separately. The two plugins exchange only Vault Markdown and media files; check both output configurations after changing the root.

## Features

- Forest interface, local cover images, search, topic filters and multiple selection.
- Local Markdown reader with images, video and audio, subject to platform codec support and size limits.
- Multiple topics per article through the existing `shiguangTopics` frontmatter field. Renaming articles, moving them between folders and renaming topics preserve their identities.
- Confirmed Inbox-to-Bookmarks moves without overwriting existing files; confirmed trash operations affect notes only and retain media.
- First-run wizard, generic Chinese topic templates and native settings. Internal topic IDs are generated automatically.
- AI is off by default. Enabling it only exposes an unconnected-service state; this release performs no model calls and provides no simulated recommendations.

## Build

Requires Node.js 20 or later and npm:

```sh
npm ci
npm test
npm run build
```

Output: `dist/fox-shiguang/{manifest.json,main.js,styles.css,LICENSE}`. Package these four files inside a top-level `fox-shiguang/` folder. No personal collections, settings or credentials belong in a release.

## Data and limitations

Settings stay in the plugin's local `data.json`; topics stay in Markdown. Back up settings before uninstalling, because Obsidian removes the plugin directory. Collection and media directories remain managed by the Vault. Malformed topic properties or duplicate article IDs block edits instead of silently overwriting them. Obsidian may normalize YAML formatting when saving frontmatter.

The fox artwork was supplied by the user, who confirmed permission to distribute it with this plugin. Its rights remain with the original rights holder; the repository MIT license does not relicense this artwork. Historical drafts, knowledge-base publishing, AI services and downloading media are outside this release. Large media may need to be opened in the original note.

[Chinese README](README.md) · [Changelog](CHANGELOG.md) · [Test report](docs/stage4-test-report.md) · [Extraction inventory](docs/ui-extraction.md) · [License](LICENSE)


## Forest Desk

Read and edit side by side (tabs on narrow screens). Select original text to insert a sourced quote slip; edit, reorder, delete or undo blocks in your own freeform document. Optional templates insert editable Markdown only. Drafts autosave to the private plugin file `desk-drafts.json`; wait for the saved status before exiting and back it up before uninstalling.

For Bookmarks, generate a preview, edit title/content/topics/folder and confirm once to create a note in `20-Knowledge/` by default. Preview creates no knowledge file. Stable source IDs prevent duplicate publication or overwriting existing notes. The note contains the ordered user document and sourced excerpts, not a copy of the whole original or media. Native links and the collection status connect both documents.

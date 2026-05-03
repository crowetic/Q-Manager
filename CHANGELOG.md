# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added

- QDN filesystem backups now include both the filesystem snapshot and the private resource index so another node can restore the same local state.
- Startup now compares the local filesystem state against the published QDN backup and prompts to load the QDN version when they differ.
- Out-of-date QDN publish state now appears as a small notification badge instead of opening the publish diff immediately.
- Manual publish/import actions now clear stale publish notifications and keep the sync baseline aligned with the current filesystem state.

### Changed

- The `Sync filesystem backup` toggle now controls publish reminders, not startup restore checks.
- Auto-sync no longer interrupts the user as soon as a mismatch is detected; the diff is now opened from the notification badge.
- Private file display labels are kept separate from filesystem identity so private entries do not turn into phantom tree items.
- Filesystem size summaries continue to report the summed sizes of represented files, which can look large even though the QDN backup payload is metadata-only.

### Fixed

- Deleted private files no longer reappear in sync prompts because publish baselines are normalized from the current filesystem tree plus private index.
- Restore and publish diffs now compare the filesystem snapshot and private resource index together, which keeps backup decisions accurate.
- Startup restore prompting now works consistently even when auto-sync is disabled.
- Large private media previews remain separate from the backup snapshot flow, so preview cost is not the same thing as backup publish size.
- Successful private previews now refresh the cached thumbnail in the private index, so a better preview can replace a stale image thumbnail.

### Notes

- The QDN backup is still an encrypted metadata snapshot, not the raw contents of every file in the filesystem.
- Legacy QDN backups remain readable.

## [0.2.0] - 2026-02-28

### Added

- Filesystem persistence now supports IndexedDB with localStorage backup/fallback behavior.
- Versioned/timestamped storage records for safer persistence reconciliation.
- QDN filesystem structure sync actions.
- Option to publish filesystem structure to QDN.
- Option to import filesystem structure from QDN.
- Option to discover previously published Q-Manager resources and import them into the UI.
- Automatic import destination folder: `Recovered Imports`.
- Multi-select file workflow with per-item checkboxes in the grid.
- Bulk selected-file action mode in bottom controls: `Move`, `Remove`, `Delete from QDN`.
- Bulk move modal for selected files with target folder selection.
- QDN tombstone delete flow by republishing each selected file identifier with `data64` for `"d"`.
- File preview support from the main grid.
- Right-click context menu action: `preview`.
- Double-click file behavior to open preview.
- Optional `Show thumbnails` checkbox above the main action controls.
- Image thumbnails in file tiles when thumbnail mode is enabled.
- File `displayName` support for UI labels (separate from published `name` / `identifier`).
- Right-click context menu action: `More info` modal with full known file metadata dump.
- Optional live metadata fetch from QDN resource properties (`GET_QDN_RESOURCE_PROPERTIES`) from the `More info` modal.
- Automatic metadata hydration back into file nodes from fetched properties (size, mime, display filename when appropriate).
- Selected-files footer now shows aggregated file size with unknown-count fallback.
- Per-file size display in selected file details dialog.
- File pinning support (`pin file` / `unpin file`) persisted in filesystem data.
- Visual pin badge on pinned file tiles.
- Extension-based preview inference and text preview mode (`.txt`, `.md`, `.json`, etc.).

### Changed

- IndexedDB is treated as the primary storage source, with localStorage retained as backup.
- Storage load flow now heals missing/failed IndexedDB state from localStorage fallback data when needed.
- Storage save flow now writes through a combined helper to reduce drift between stores.
- Folder/file tile visuals were refreshed for stronger readability and hierarchy.
- File rename behavior now updates `displayName` for files (folder rename behavior remains structural).
- Selection is cleared when switching top-level mode tabs (`public` / `private` / `groups`) or selected group.
- Missing/discovered file imports now attempt property hydration and use resolved filename for display labels.
- `remove directory` context action now uses a delete icon (pin icon reserved for pinning behavior).

### Fixed

- `utils.ts` TypeScript typing issues and Promise/file handling edge cases.
- Publish service default selection precedence bug in single publish flow.
- Publish service dropdown menu rendering/opacity issues in modal context.
- Better error fallback behavior for preview/thumbnails when media cannot be loaded.
- Custom button component now honors the `disabled` prop.
- Discovery/import now ignores tombstoned QDN resources by filtering very small (delete marker) resource sizes.
- Preview fallback now handles text-like resources better when MIME metadata is missing by deriving from filename extension.

### Notes

- QDN publish/import works with the in-memory filesystem state, not direct storage backend snapshots.

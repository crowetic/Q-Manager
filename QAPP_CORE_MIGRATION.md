# qapp-core Migration Notes

## Status

- Branch: `spike/qapp-core-migration`
- Started migration by introducing a single request adapter:
  - `src/qapp/request.ts`
- Major runtime request callsites now route through:
  - `requestQortal(...)`

## Adapter Behavior

`requestQortal` resolves provider in this order:

1. `window.qappCore.request` / `window.QAppCore.request` / `window.qappCore.qortalRequest`
2. `window.qapp.request` / `window.qapp.qortalRequest`
3. legacy global `qortalRequest`

If none are available, it throws an explicit provider error.

## Migrated Files

- `src/App.jsx`
- `src/Manager.tsx`
- `src/storage.ts`
- `src/File.tsx`
- `src/ContextMenuPinnedFiles.tsx`
- `src/actions/PUBLISH_QDN_RESOURCE.jsx`
- `src/actions/PUBLISH_MULTIPLE_QDN_RESOURCES.jsx`
- `src/actions/CREATE_POLL.jsx`
- `src/actions/VOTE_ON_POLL.jsx`
- `src/actions/OPEN_NEW_TAB.jsx`

## Next Steps

1. Add actual `qapp-core` package wiring once target API surface is confirmed.
2. Replace direct feature assumptions with typed qapp-core service modules.
3. Add provider diagnostics in UI (which provider is active).
4. Add branch-level smoke tests for publish, decrypt/encrypt, filesystem import/export.

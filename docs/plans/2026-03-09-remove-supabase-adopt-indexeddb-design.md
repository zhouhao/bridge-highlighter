# Design: Remove Supabase, Adopt IndexedDB

## Goal

Remove all Supabase cloud sync integration and replace `chrome.storage.local` with IndexedDB for local highlight storage. This eliminates the cloud dependency and resolves storage scalability bottlenecks.

## Decisions

- **Account tab**: Remove entirely (no placeholder)
- **Data migration**: Clean start (no migration from chrome.storage.local)
- **IndexedDB wrapper**: `idb` library (~1.2KB gzipped)

## Files to Delete

- `supabase/` — entire directory (client, services, types, migrations, docs)
- `entrypoints/sidepanel/auth-ui.ts` — auth UI class
- `utils/storage.ts` — old chrome.storage.local utility (superseded by new IndexedDB module)

## New File: `utils/db.ts`

Single module using `idb` that replaces both `utils/storage.ts` and `supabase/services/storage.ts`.

### Database Schema

- DB name: `highlighter`
- Version: `1`
- Object store: `highlights`
  - keyPath: `id` (the existing UUID string)
  - Indexes:
    - `url` — for per-page lookups
    - `createdAt` — for sorted listing
    - `tags` — multiEntry index for future tag-based queries

### Exported API

```typescript
getHighlightsForUrl(url: string): Promise<HighlightPosition[]>
saveHighlight(url: string, highlight: HighlightPosition): Promise<void>
updateHighlight(url: string, highlightId: string, updates: { comment?: string; tags?: string[] }): Promise<void>
removeHighlight(url: string, highlightId: string): Promise<void>
getAllHighlights(): Promise<PageHighlights[]>
```

Each highlight stored as its own record with a `url` field — O(1) per-record operations instead of O(n) read-modify-write on per-URL blobs.

URL normalization logic (tracking param stripping, path normalization) moves into this module.

## Files to Modify

### `entrypoints/background.ts`

- Remove Supabase imports (`storageService`, `authService`, `syncService`)
- Import from `@/utils/db` instead
- Remove `initializeServices()`, auth state listener, `performSync` message handler
- Keep highlight CRUD message handlers, swap implementation calls

### `entrypoints/sidepanel/index.html`

- Remove Account tab button
- Remove `#account-panel` div
- Remove associated CSS (`.auth-container`, `.auth-form`, `.user-profile`, `.sync-status`, `.info-note`, etc.)

### `entrypoints/sidepanel/main.ts`

- Remove `AuthUI` import and instantiation
- Remove `chrome.storage.onChanged` listener (not relevant with IndexedDB)
- Keep `highlights-updated` custom event listener

### `package.json`

- Remove `@supabase/supabase-js`
- Add `idb`

### `wxt.config.ts`

- Remove `storage` permission (no longer using `chrome.storage.local`)

## Unchanged Files

- `entrypoints/content.ts` — communicates via messages, no direct storage calls
- `utils/types.ts` — types unchanged
- `utils/modal.ts`, `utils/xpath.ts` — no storage involvement

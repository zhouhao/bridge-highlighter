# Remove Supabase & Adopt IndexedDB — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove all Supabase cloud sync and replace chrome.storage.local with IndexedDB using `idb` for scalable local highlight storage.

**Architecture:** Single `utils/db.ts` module stores each highlight as its own IndexedDB record keyed by `id`, with a `url` index for per-page lookups. Background script calls db functions directly. Content script and sidepanel communicate with background via messages (unchanged).

**Tech Stack:** TypeScript, WXT, `idb` library, IndexedDB, vitest with `fake-indexeddb`

---

### Task 1: Update dependencies

**Files:**
- Modify: `package.json`

**Step 1: Install idb, remove supabase**

Run:
```bash
cd /Users/hzhou/GitHub/bridge-highlighter && npm install idb && npm uninstall @supabase/supabase-js
```

**Step 2: Verify package.json**

`package.json` should have `"idb"` in dependencies and no `@supabase/supabase-js`.

**Step 3: Install fake-indexeddb for testing**

Run:
```bash
cd /Users/hzhou/GitHub/bridge-highlighter && npm install -D fake-indexeddb
```

**Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: replace @supabase/supabase-js with idb, add fake-indexeddb"
```

---

### Task 2: Create `utils/db.ts` — IndexedDB storage layer

**Files:**
- Create: `utils/db.ts`

**Step 1: Write `utils/db.ts`**

```typescript
import { openDB, type IDBPDatabase } from 'idb';
import type { HighlightPosition, PageHighlights } from './types';

const DB_NAME = 'highlighter';
const DB_VERSION = 1;
const STORE_NAME = 'highlights';

// Common tracking/marketing parameters to remove
const TRACKING_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id',
  '_ga', '_gid', '_gac', 'gclid', 'gclsrc',
  'fbclid', 'fb_action_ids', 'fb_action_types', 'fb_source', 'fb_ref',
  'msclkid', 'mc_cid', 'mc_eid',
  'twclid', 'tw_source', 'tw_medium', 'tw_campaign',
  'li_fat_id', 'lipi',
  'epik',
  'ttclid',
  'rdt_cid',
  'hsa_acc', 'hsa_cam', 'hsa_grp', 'hsa_ad', 'hsa_src', 'hsa_tgt', 'hsa_kw', 'hsa_mt', 'hsa_net', 'hsa_ver',
  'ref', 'referrer', 'source', 'campaign', 'medium', 'content', 'term',
  'sessionid', 'session_id', '_hsenc', '_hsmi',
  'mkt_tok',
  'igshid', 'yclid', 'gbraid', 'wbraid',
]);

/** Stored record: highlight + its normalized URL */
interface HighlightRecord extends HighlightPosition {
  url: string;
}

export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const searchParams = new URLSearchParams(parsed.search);
    const cleanedParams = new URLSearchParams();

    const sortedKeys = Array.from(searchParams.keys())
      .filter(key => !TRACKING_PARAMS.has(key.toLowerCase()))
      .sort();

    sortedKeys.forEach(key => {
      const value = searchParams.get(key);
      if (value !== null) {
        cleanedParams.append(key, value);
      }
    });

    const queryString = cleanedParams.toString();
    const pathname = parsed.pathname.replace(/\/$/, '');
    return `${parsed.origin}${pathname}${queryString ? '?' + queryString : ''}`;
  } catch {
    return url;
  }
}

function getDb(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('url', 'url', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
        store.createIndex('tags', 'tags', { unique: false, multiEntry: true });
      }
    },
  });
}

export async function getHighlightsForUrl(url: string): Promise<HighlightPosition[]> {
  const db = await getDb();
  const normalizedUrl = normalizeUrl(url);
  const records: HighlightRecord[] = await db.getAllFromIndex(STORE_NAME, 'url', normalizedUrl);
  return records;
}

export async function saveHighlight(url: string, highlight: HighlightPosition): Promise<void> {
  const db = await getDb();
  const record: HighlightRecord = { ...highlight, url: normalizeUrl(url) };
  await db.put(STORE_NAME, record);
}

export async function updateHighlight(
  url: string,
  highlightId: string,
  updates: { comment?: string; tags?: string[] }
): Promise<void> {
  const db = await getDb();
  const existing = await db.get(STORE_NAME, highlightId) as HighlightRecord | undefined;
  if (!existing) return;
  const updated: HighlightRecord = { ...existing, ...updates };
  await db.put(STORE_NAME, updated);
}

export async function removeHighlight(url: string, highlightId: string): Promise<void> {
  const db = await getDb();
  await db.delete(STORE_NAME, highlightId);
}

export async function getAllHighlights(): Promise<PageHighlights[]> {
  const db = await getDb();
  const all: HighlightRecord[] = await db.getAll(STORE_NAME);

  const byUrl = new Map<string, HighlightPosition[]>();
  for (const { url, ...highlight } of all) {
    let list = byUrl.get(url);
    if (!list) {
      list = [];
      byUrl.set(url, list);
    }
    list.push(highlight as HighlightPosition);
  }

  return Array.from(byUrl.entries()).map(([url, highlights]) => ({ url, highlights }));
}
```

**Step 2: Commit**

```bash
git add utils/db.ts
git commit -m "feat: add IndexedDB storage layer using idb"
```

---

### Task 3: Write tests for `utils/db.ts`

**Files:**
- Create: `tests/db.test.ts`
- Modify: `tests/setup.ts` (add fake-indexeddb import)

**Step 1: Add fake-indexeddb to test setup**

Add to the top of `tests/setup.ts`:
```typescript
import 'fake-indexeddb/auto';
```

**Step 2: Write `tests/db.test.ts`**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import {
  normalizeUrl,
  getHighlightsForUrl,
  saveHighlight,
  updateHighlight,
  removeHighlight,
  getAllHighlights,
} from '../utils/db';
import type { HighlightPosition } from '../utils/types';

function makeHighlight(overrides: Partial<HighlightPosition> = {}): HighlightPosition {
  return {
    id: crypto.randomUUID(),
    text: 'sample text',
    xpath: '//div',
    startOffset: 0,
    endOffset: 11,
    beforeContext: '',
    afterContext: '',
    createdAt: Date.now(),
    ...overrides,
  };
}

describe('normalizeUrl', () => {
  it('should remove hash and trailing slash', () => {
    expect(normalizeUrl('https://example.com/path/#hash')).toBe('https://example.com/path');
    expect(normalizeUrl('https://example.com/path/')).toBe('https://example.com/path');
  });

  it('should handle invalid URLs gracefully', () => {
    expect(normalizeUrl('not-a-url')).toBe('not-a-url');
  });

  it('should preserve legitimate query parameters', () => {
    expect(normalizeUrl('https://example.com/path?id=123&page=2')).toBe(
      'https://example.com/path?id=123&page=2'
    );
  });

  it('should remove tracking parameters', () => {
    expect(normalizeUrl('https://example.com/path?utm_source=twitter&utm_medium=social')).toBe(
      'https://example.com/path'
    );
    expect(normalizeUrl('https://example.com/path?fbclid=abc123')).toBe('https://example.com/path');
  });

  it('should sort query parameters alphabetically', () => {
    expect(normalizeUrl('https://example.com/path?zebra=1&apple=2')).toBe(
      'https://example.com/path?apple=2&zebra=1'
    );
  });

  it('should handle case-insensitive tracking param matching', () => {
    expect(normalizeUrl('https://example.com/path?UTM_SOURCE=test')).toBe('https://example.com/path');
  });
});

describe('IndexedDB storage', () => {
  beforeEach(async () => {
    // Delete the database before each test for isolation
    const req = indexedDB.deleteDatabase('highlighter');
    await new Promise<void>((resolve, reject) => {
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  });

  describe('saveHighlight + getHighlightsForUrl', () => {
    it('should save and retrieve a highlight by URL', async () => {
      const h = makeHighlight({ id: 'h1', text: 'hello' });
      await saveHighlight('https://example.com/page', h);

      const results = await getHighlightsForUrl('https://example.com/page');
      expect(results).toHaveLength(1);
      expect(results[0].text).toBe('hello');
      expect(results[0].id).toBe('h1');
    });

    it('should normalise URL when saving', async () => {
      const h = makeHighlight({ id: 'h1' });
      await saveHighlight('https://example.com/page/?utm_source=twitter#hash', h);

      const results = await getHighlightsForUrl('https://example.com/page');
      expect(results).toHaveLength(1);
    });

    it('should return empty array for URL with no highlights', async () => {
      const results = await getHighlightsForUrl('https://example.com/nothing');
      expect(results).toEqual([]);
    });

    it('should return multiple highlights for same URL', async () => {
      await saveHighlight('https://example.com', makeHighlight({ id: 'a' }));
      await saveHighlight('https://example.com', makeHighlight({ id: 'b' }));

      const results = await getHighlightsForUrl('https://example.com');
      expect(results).toHaveLength(2);
    });

    it('should not mix highlights from different URLs', async () => {
      await saveHighlight('https://a.com', makeHighlight({ id: 'h1' }));
      await saveHighlight('https://b.com', makeHighlight({ id: 'h2' }));

      expect(await getHighlightsForUrl('https://a.com')).toHaveLength(1);
      expect(await getHighlightsForUrl('https://b.com')).toHaveLength(1);
    });
  });

  describe('updateHighlight', () => {
    it('should update comment and tags', async () => {
      const h = makeHighlight({ id: 'h1' });
      await saveHighlight('https://example.com', h);

      await updateHighlight('https://example.com', 'h1', { comment: 'note', tags: ['a', 'b'] });

      const results = await getHighlightsForUrl('https://example.com');
      expect(results[0].comment).toBe('note');
      expect(results[0].tags).toEqual(['a', 'b']);
    });

    it('should no-op for non-existent highlight', async () => {
      await updateHighlight('https://example.com', 'missing', { comment: 'note' });
      const results = await getHighlightsForUrl('https://example.com');
      expect(results).toHaveLength(0);
    });
  });

  describe('removeHighlight', () => {
    it('should remove a highlight by ID', async () => {
      await saveHighlight('https://example.com', makeHighlight({ id: 'keep' }));
      await saveHighlight('https://example.com', makeHighlight({ id: 'remove' }));

      await removeHighlight('https://example.com', 'remove');

      const results = await getHighlightsForUrl('https://example.com');
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('keep');
    });
  });

  describe('getAllHighlights', () => {
    it('should group highlights by URL', async () => {
      await saveHighlight('https://a.com', makeHighlight({ id: 'h1' }));
      await saveHighlight('https://a.com', makeHighlight({ id: 'h2' }));
      await saveHighlight('https://b.com', makeHighlight({ id: 'h3' }));

      const pages = await getAllHighlights();
      expect(pages).toHaveLength(2);

      const pageA = pages.find(p => p.url === 'https://a.com');
      const pageB = pages.find(p => p.url === 'https://b.com');
      expect(pageA?.highlights).toHaveLength(2);
      expect(pageB?.highlights).toHaveLength(1);
    });

    it('should return empty array when no highlights exist', async () => {
      const pages = await getAllHighlights();
      expect(pages).toEqual([]);
    });
  });
});
```

**Step 3: Run tests**

Run: `cd /Users/hzhou/GitHub/bridge-highlighter && npx vitest run tests/db.test.ts`
Expected: All tests pass.

**Step 4: Commit**

```bash
git add tests/db.test.ts tests/setup.ts
git commit -m "test: add IndexedDB storage layer tests"
```

---

### Task 4: Rewrite `entrypoints/background.ts`

**Files:**
- Modify: `entrypoints/background.ts`

**Step 1: Replace entire background.ts**

```typescript
import {
  getHighlightsForUrl,
  saveHighlight,
  updateHighlight,
  removeHighlight,
  getAllHighlights,
} from '@/utils/db';

export default defineBackground(() => {
  // Create context menu on install
  chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
      id: 'save-highlight',
      title: 'Highlight Text',
      contexts: ['selection']
    });
  });

  // Handle context menu clicks
  chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (!tab?.id) return;

    if (info.menuItemId === 'save-highlight') {
      chrome.tabs.sendMessage(tab.id, { action: 'saveHighlight' });
    }
  });

  // Handle action click to open side panel
  chrome.action.onClicked.addListener(async (tab) => {
    if (tab.id) {
      await chrome.sidePanel.open({ tabId: tab.id });
    }
  });

  // Listen for messages from content script and sidepanel
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'getHighlights') {
      getHighlightsForUrl(message.url).then(sendResponse);
      return true;
    } else if (message.action === 'saveHighlightData') {
      saveHighlight(message.url, message.highlight).then(() => sendResponse(true));
      return true;
    } else if (message.action === 'updateHighlightData') {
      updateHighlight(message.url, message.highlightId, message.updates).then(() => sendResponse(true));
      return true;
    } else if (message.action === 'removeHighlightData') {
      removeHighlight(message.url, message.highlightId).then(() => sendResponse(true));
      return true;
    } else if (message.action === 'getAllHighlights') {
      getAllHighlights().then(sendResponse);
      return true;
    }
  });

  // Notify sidepanel of tab switches
  chrome.tabs.onActivated.addListener(async (activeInfo) => {
    try {
      chrome.runtime.sendMessage({
        action: 'tabActivated',
        tabId: activeInfo.tabId
      });
    } catch (error) {
      console.debug('Could not notify sidepanel of tab change:', error);
    }
  });
});
```

**Step 2: Commit**

```bash
git add entrypoints/background.ts
git commit -m "refactor: replace Supabase storage with IndexedDB in background script"
```

---

### Task 5: Update sidepanel — remove Account tab

**Files:**
- Modify: `entrypoints/sidepanel/index.html`
- Modify: `entrypoints/sidepanel/main.ts`

**Step 1: Rewrite `index.html`**

Remove the Account tab button, the entire `#account-panel` div, and all auth/sync-related CSS (`.auth-container`, `.auth-form`, `.form-group`, `.btn-primary`, `.btn-secondary`, `.auth-toggle`, `.error-message`, `.success-message`, `.user-profile`, `.user-email`, `.sync-status`, `.sync-controls`, `.info-note`, `.info-note-title`, `.info-note-content`, `.info-note-benefits`).

Keep only the Current Page tab, Dashboard tab, `#current-panel`, highlight styles, edit form styles, and empty state styles.

The tabs div becomes:
```html
<div class="tabs">
  <button class="tab active" data-tab="current">Current Page</button>
  <button class="tab" data-tab="all">Dashboard</button>
</div>
```

Remove the entire `<div id="account-panel" class="panel">...</div>` block.

**Step 2: Remove AuthUI from `main.ts`**

Remove these lines from the bottom of `entrypoints/sidepanel/main.ts`:
```typescript
// Initialize authentication UI
import { AuthUI } from './auth-ui';
new AuthUI();
```

And remove the `chrome.storage.onChanged` listener:
```typescript
chrome.storage.onChanged.addListener(() => {
  if (document.querySelector('.tab.active')?.getAttribute('data-tab') === 'current') {
    loadCurrentPageHighlights();
  }
});
```

Keep the `highlights-updated` custom event listener and the `tabActivated` message listener.

**Step 3: Commit**

```bash
git add entrypoints/sidepanel/index.html entrypoints/sidepanel/main.ts
git commit -m "refactor: remove Account tab and auth UI from sidepanel"
```

---

### Task 6: Delete Supabase directory and old files

**Files:**
- Delete: `supabase/` (entire directory)
- Delete: `entrypoints/sidepanel/auth-ui.ts`
- Delete: `utils/storage.ts`
- Delete: `tests/storage.test.ts` (tests the old storage.ts; replaced by tests/db.test.ts)

**Step 1: Delete files**

Run:
```bash
cd /Users/hzhou/GitHub/bridge-highlighter && rm -rf supabase/ && rm entrypoints/sidepanel/auth-ui.ts && rm utils/storage.ts && rm tests/storage.test.ts
```

**Step 2: Commit**

```bash
git add -A
git commit -m "chore: remove Supabase integration, old storage utils, and related tests"
```

---

### Task 7: Update `wxt.config.ts` — remove storage permission

**Files:**
- Modify: `wxt.config.ts`

**Step 1: Remove `'storage'` from permissions array**

Change:
```typescript
permissions: ['storage', 'contextMenus', 'sidePanel', 'tabs'],
```
To:
```typescript
permissions: ['contextMenus', 'sidePanel', 'tabs'],
```

**Step 2: Commit**

```bash
git add wxt.config.ts
git commit -m "chore: remove storage permission (no longer using chrome.storage.local)"
```

---

### Task 8: Run all tests and verify build

**Step 1: Run tests**

Run: `cd /Users/hzhou/GitHub/bridge-highlighter && npx vitest run`
Expected: All tests pass. No import errors from deleted files.

**Step 2: Build the extension**

Run: `cd /Users/hzhou/GitHub/bridge-highlighter && npm run build`
Expected: Clean build with no errors.

**Step 3: Fix any issues found, then commit**

If issues are found, fix them and commit with an appropriate message.

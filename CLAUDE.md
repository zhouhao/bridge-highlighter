# Bridge Highlighter - AI Assistant Instructions

## Project Overview

A Chrome Extension (Manifest V3) built with WXT that provides:
1. **Text highlighting** — select text on any webpage, save via context menu, auto-restore on revisit
2. **Notes app** — three-column notes application in the options page with Markdown, Mermaid diagrams, and checkbox support

## Tech Stack

- **Framework**: WXT (Vite-based Chrome Extension framework)
- **Language**: TypeScript (strict, no `any`)
- **Manifest**: Chrome Extension MV3
- **Storage**: IndexedDB via `idb` (two separate databases: `highlighter` for highlights, `highlighter-notes` for notes)
- **Markdown**: `marked` for rendering
- **Diagrams**: `mermaid` for diagram support in notes
- **Build Tool**: Vite (via WXT)
- **Package Manager**: pnpm

## Architecture

### Component Structure

```
entrypoints/
├── background.ts        # Service worker (context menu, storage, message routing)
├── content.ts           # Content script (DOM highlighting, XPath tracking)
├── options/             # Notes app (three-column layout)
│   ├── index.html       # UI with all CSS inline
│   └── main.ts          # App logic, Markdown/Mermaid rendering
└── sidepanel/           # Side panel (view/manage current page highlights)
    ├── index.html
    └── main.ts

utils/
├── db.ts               # Highlights IndexedDB CRUD (used by background.ts)
├── notes-db.ts          # Notes & categories IndexedDB CRUD (used directly by options page)
├── types.ts             # Shared types: HighlightPosition, PageHighlights, Note, NoteCategory
├── modal.ts             # Highlight save modal (color, tags, comment)
└── xpath.ts             # XPath generation/resolution
```

### Key Architectural Patterns

1. **Content Script Isolation**: Content scripts communicate with background via `chrome.runtime.sendMessage`
2. **Background Service Worker**: Routes messages, manages highlight CRUD, broadcasts `highlightsChanged` to sidepanel
3. **Direct DB Access for Notes**: Options page imports `notes-db.ts` directly (extension pages share origin with background)
4. **Message-based for Highlights**: Content script → background → sidepanel (content scripts can't access IndexedDB directly)
5. **XPath + Context Fallback**: Primary tracking via XPath+offset, fallback via surrounding text context

### Message Flow

```
Content Script                    Background                     Sidepanel
     |                               |                              |
     |-- saveHighlightData --------→ |                              |
     |                               |-- (save to IndexedDB) ---→   |
     |                               |-- highlightsChanged ------→  |
     |                               |                              |-- (reload list)
```

### Data Models

- **Highlights DB** (`highlighter`): Single `highlights` store, indexed by `url`, `createdAt`, `tags`
- **Notes DB** (`highlighter-notes`): Two stores — `categories` (keyPath: `id`) and `notes` (keyPath: `id`, indexed by `categoryId`)
- **Page Highlights as Category**: The options page treats existing page highlights as a special built-in category (`__page_highlights__`)

## Development Guidelines

### Core Principles

1. **MV3 Constraints**: No persistent background page — event-driven service workers only
2. **CSP Compliance**: No `eval()`, no inline scripts
3. **DOM Safety**: Always verify elements exist before manipulation
4. **No Framework**: Vanilla TypeScript with direct DOM manipulation — no React/Vue/etc.

### Code Conventions

- **Naming**: camelCase for functions/variables, PascalCase for types/interfaces
- **Async/Await**: Prefer async/await over `.then()` chains
- **Error Handling**: Wrap storage/DOM operations in try-catch
- **Type Safety**: TypeScript strict mode, never use `any`
- **CSS**: Inline `<style>` blocks in HTML files (no external CSS files)
- **Single-file pattern**: Each entrypoint has one `main.ts` with all logic

### Common Patterns

#### IndexedDB Operations (Highlights)
```typescript
import { getHighlightsForUrl, saveHighlight } from '@/utils/db';

const highlights = await getHighlightsForUrl(url);
```

#### IndexedDB Operations (Notes — direct access from options page)
```typescript
import { getAllCategories, createNote, updateNote } from '@/utils/notes-db';

const categories = await getAllCategories();
const note = await createNote(categoryId, 'Title', 'Content');
```

#### Message Passing
```typescript
// Content script → background
chrome.runtime.sendMessage({ action: 'saveHighlightData', url, highlight });

// Background → all extension pages (broadcast)
chrome.runtime.sendMessage({ action: 'highlightsChanged' });

// Background → specific content script
chrome.tabs.sendMessage(tabId, { action: 'refreshHighlights' });
```

## Development Workflow

### Setup
```bash
pnpm install         # Install dependencies
pnpm dev             # Start development with hot reload
```

### Build & Test
```bash
pnpm build           # Production build
pnpm zip             # Create distribution package
pnpm test:run        # Run tests
```

### Load in Chrome
1. `pnpm build`
2. Navigate to `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked" → select `.output/chrome-mv3/`

### Debugging
- **Background Script**: `chrome://extensions/` → "Inspect views: service worker"
- **Content Script**: Right-click page → Inspect → Console
- **Options/Notes Page**: Open options page → Inspect
- **Side Panel**: Right-click side panel → Inspect

## Extension Permissions

Required permissions in `wxt.config.ts` manifest:
- `contextMenus`: Right-click highlight menu
- `sidePanel`: Side panel UI
- `tabs`: Tab URL access and messaging

## Known Edge Cases

- **Dynamic Content**: Pages with dynamic DOM updates may lose highlights
- **SPA Navigation**: Single-page apps need special handling for URL changes
- **iFrames**: Highlights don't persist across iframe boundaries
- **Shadow DOM**: Limited support for web components with shadow DOM

## Commit Guidelines

- Format: `type(scope): description`
- Types: feat, fix, refactor, docs, test, chore
- Examples:
  - `feat(notes): add category management`
  - `fix(sidepanel): auto-refresh on new highlight`
  - `refactor(content): optimize XPath generation`

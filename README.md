# Bridge Highlighter

A Chrome extension (MV3) built with [WXT](https://wxt.dev/) that allows you to save and highlight text selections. Highlights persist and are automatically restored when you revisit the page.

## Features

### Highlighting
- **Right-click to Save**: Select text on any webpage, right-click, and choose "Save & Highlight Text"
- **Persistent Highlights**: Highlights are saved to local storage and automatically restored on page revisit
- **Position Tracking**: Correctly identifies the exact text you highlighted, even when the same text appears multiple times on the page
- **Side Panel**: View and manage all your highlights in Chrome's side panel
- **Easy Removal**: Alt+Click on a highlight or use the context menu to remove it

### Notes App (Options Page)
- **Three-column layout**: Categories → Note titles → Note content
- **Page Highlights as a category**: All your page-based highlights appear as a built-in category, grouped by URL
- **Markdown editor**: Full Markdown support with edit/preview toggle
- **Mermaid diagrams**: Write `\`\`\`mermaid` code blocks and see them rendered as diagrams
- **Checkbox lists**: Interactive `- [ ]` / `- [x]` task lists that persist when toggled
- **Auto-save**: Changes save automatically with a 600ms debounce (or Cmd/Ctrl+S for manual save)
- **Category management**: Create, rename, and delete note categories
- **Search**: Filter notes by title and content

## How Position Tracking Works

The extension uses multiple strategies to accurately identify highlighted text:

1. **XPath + Offset**: Stores the XPath to the container element and the character offset within it
2. **Context Matching**: Stores surrounding text (50 characters before/after) to verify correct matches
3. **Fallback Matching**: If exact offset fails, uses context to find the correct occurrence

## Installation

### Development

```bash
# Install dependencies
pnpm install

# Start development mode (with hot reload)
pnpm dev

# Build for production
pnpm build

# Create zip for distribution
pnpm zip
```

### Load in Chrome

1. Run `pnpm build`
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" (top right)
4. Click "Load unpacked"
5. Select the `.output/chrome-mv3` folder

## Usage

1. **Save a highlight**: Select text → Right-click → "Save & Highlight Text"
2. **View highlights**: Click the extension icon to open the side panel
3. **Remove a highlight**:
   - Alt+Click on the highlighted text, OR
   - Click "Delete" in the side panel
4. **Revisit a page**: Highlights are automatically restored
5. **Open Notes App**: Right-click the extension icon → "Options", or go to `chrome://extensions` → Bridge → Details → Extension options

## Project Structure

```
chrome-highlighter/
├── entrypoints/
│   ├── background.ts        # Background service worker
│   ├── content.ts           # Content script (injected into pages)
│   ├── options/             # Notes app (options page)
│   │   ├── index.html       # Three-column layout UI
│   │   └── main.ts          # Notes app logic, Markdown/Mermaid rendering
│   └── sidepanel/           # Side panel UI
│       ├── index.html       # Highlights panel
│       └── main.ts          # Side panel logic
├── utils/
│   ├── db.ts               # Highlights IndexedDB storage
│   ├── notes-db.ts          # Notes & categories IndexedDB storage
│   ├── types.ts             # Shared TypeScript types
│   ├── modal.ts             # Modal utilities
│   └── xpath.ts             # XPath utilities
├── wxt.config.ts            # WXT configuration
└── package.json
```

## Technical Details

- **Manifest Version**: 3 (MV3)
- **Framework**: WXT (Vite-based extension framework)
- **Storage**: IndexedDB via [idb](https://github.com/jakearchibald/idb) (separate databases for highlights and notes)
- **Markdown**: [marked](https://github.com/markedjs/marked) for rendering
- **Diagrams**: [mermaid](https://github.com/mermaid-js/mermaid) for diagram support
- **Permissions**: `contextMenus`, `sidePanel`, `tabs`


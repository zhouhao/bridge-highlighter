import { marked, type Tokens } from 'marked';
import mermaid from 'mermaid';
import type { NoteCategory, Note, HighlightPosition, PageHighlights } from '@/utils/types';
import {
  getAllCategories,
  createCategory,
  renameCategory,
  deleteCategory,
  getNotesByCategory,
  getNote,
  createNote,
  updateNote,
  deleteNote,
} from '@/utils/notes-db';

const PAGE_HIGHLIGHTS_ID = '__page_highlights__';

let categories: NoteCategory[] = [];
let currentCategoryId: string | null = null;
let notes: Note[] = [];
let currentNoteId: string | null = null;
let isPreviewMode = false;
let pageHighlightsData: PageHighlights[] = [];
let searchQuery = '';
let saveTimer: ReturnType<typeof setTimeout> | null = null;

const categoryList = document.getElementById('category-list') as HTMLElement;
const addCategoryBtn = document.getElementById('add-category-btn') as HTMLButtonElement;
const notesList = document.getElementById('notes-list') as HTMLElement;
const notesHeaderTitle = document.getElementById('notes-header-title') as HTMLElement;
const addNoteBtn = document.getElementById('add-note-btn') as HTMLButtonElement;
const notesSearchInput = document.getElementById('notes-search-input') as HTMLInputElement;
const editorToolbar = document.getElementById('editor-toolbar') as HTMLElement;
const noteTitle = document.getElementById('note-title') as HTMLInputElement;
const editorBody = document.getElementById('editor-body') as HTMLElement;
const editorEmpty = document.getElementById('editor-empty') as HTMLElement;
const editorTextarea = document.getElementById('editor-textarea') as HTMLTextAreaElement;
const editorPreview = document.getElementById('editor-preview') as HTMLElement;
const btnEdit = document.getElementById('btn-edit') as HTMLButtonElement;
const btnPreview = document.getElementById('btn-preview') as HTMLButtonElement;
const btnDeleteNote = document.getElementById('btn-delete-note') as HTMLButtonElement;
const saveIndicator = document.getElementById('save-indicator') as HTMLElement;
const modalOverlay = document.getElementById('modal-overlay') as HTMLElement;
const modalTitle = document.getElementById('modal-title') as HTMLElement;
const modalInput = document.getElementById('modal-input') as HTMLInputElement;
const modalCancel = document.getElementById('modal-cancel') as HTMLButtonElement;
const modalConfirm = document.getElementById('modal-confirm') as HTMLButtonElement;

mermaid.initialize({ startOnLoad: false, theme: 'default' });

const renderer = new marked.Renderer();
const originalCodeRenderer = renderer.code;

renderer.code = function (
  this: typeof renderer,
  token: Tokens.Code,
): string {
  if (token.lang === 'mermaid') {
    return `<div class="mermaid">${escapeHtml(token.text)}</div>`;
  }
  if (originalCodeRenderer) {
    return originalCodeRenderer.call(this, token);
  }
  const langClass = token.lang ? ` class="language-${escapeHtml(token.lang)}"` : '';
  return `<pre><code${langClass}>${escapeHtml(token.text)}</code></pre>`;
};

marked.use({ renderer, gfm: true, breaks: true });

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatDate(timestamp: number): string {
  const d = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffDays === 0) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function getHostname(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname + u.pathname;
  } catch {
    return url;
  }
}

function truncate(text: string, max: number = 80): string {
  if (text.length <= max) return text;
  return text.substring(0, max) + '...';
}

async function loadPageHighlights(): Promise<void> {
  pageHighlightsData = await new Promise<PageHighlights[]>((resolve) => {
    chrome.runtime.sendMessage({ action: 'getAllHighlights' }, (response) =>
      resolve(response || []),
    );
  });
}

async function init(): Promise<void> {
  await Promise.all([loadCategories(), loadPageHighlights()]);
  renderCategories();
  selectCategory(PAGE_HIGHLIGHTS_ID);
}

async function loadCategories(): Promise<void> {
  categories = await getAllCategories();
}

function renderCategories(): void {
  categoryList.innerHTML = '';

  const pageHighlightItem = createCategoryElement(
    PAGE_HIGHLIGHTS_ID,
    'Page Highlights',
    pageHighlightsData.length,
    '📌',
    false,
  );
  categoryList.appendChild(pageHighlightItem);

  for (const cat of categories) {
    const el = createCategoryElement(cat.id, cat.name, 0, '📁', true);
    categoryList.appendChild(el);
  }

  updateCategoryCounts();
}

function createCategoryElement(
  id: string,
  name: string,
  count: number,
  icon: string,
  editable: boolean,
): HTMLElement {
  const item = document.createElement('div');
  item.className = 'category-item' + (id === currentCategoryId ? ' active' : '');
  item.dataset.categoryId = id;

  item.innerHTML = `
    <span class="category-icon">${icon}</span>
    <span class="category-name">${escapeHtml(name)}</span>
    <span class="category-count">${count}</span>
    ${editable ? `
      <div class="category-actions">
        <button class="category-action-btn" data-action="rename" title="Rename">✏️</button>
        <button class="category-action-btn" data-action="delete" title="Delete">🗑️</button>
      </div>
    ` : ''}
  `;

  item.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target.closest('.category-action-btn')) return;
    selectCategory(id);
  });

  if (editable) {
    item.querySelector('[data-action="rename"]')?.addEventListener('click', () =>
      showRenameModal(id, name),
    );
    item.querySelector('[data-action="delete"]')?.addEventListener('click', () =>
      handleDeleteCategory(id),
    );
  }

  return item;
}

async function updateCategoryCounts(): Promise<void> {
  for (const cat of categories) {
    const catNotes = await getNotesByCategory(cat.id);
    const el = categoryList.querySelector(`[data-category-id="${cat.id}"] .category-count`);
    if (el) el.textContent = catNotes.length.toString();
  }
}

async function selectCategory(categoryId: string): Promise<void> {
  currentCategoryId = categoryId;
  currentNoteId = null;
  searchQuery = '';
  notesSearchInput.value = '';

  categoryList.querySelectorAll('.category-item').forEach((el) => el.classList.remove('active'));
  const activeEl = categoryList.querySelector(`[data-category-id="${categoryId}"]`);
  activeEl?.classList.add('active');

  const isPageHighlights = categoryId === PAGE_HIGHLIGHTS_ID;
  addNoteBtn.disabled = isPageHighlights;

  if (isPageHighlights) {
    notesHeaderTitle.textContent = 'Page Highlights';
    renderPageHighlightsList();
  } else {
    const cat = categories.find((c) => c.id === categoryId);
    notesHeaderTitle.textContent = cat?.name || 'Notes';
    await loadAndRenderNotes(categoryId);
  }

  showEditorEmpty();
}

function renderPageHighlightsList(): void {
  notesList.innerHTML = '';

  if (pageHighlightsData.length === 0) {
    notesList.innerHTML = `
      <div class="notes-empty">
        <div class="notes-empty-icon">📭</div>
        <p>No page highlights yet</p>
      </div>
    `;
    return;
  }

  const filtered = searchQuery
    ? pageHighlightsData.filter(
        (p) =>
          getHostname(p.url).toLowerCase().includes(searchQuery) ||
          p.highlights.some((h) => h.text.toLowerCase().includes(searchQuery)),
      )
    : pageHighlightsData;

  if (filtered.length === 0) {
    notesList.innerHTML = `
      <div class="notes-empty">
        <div class="notes-empty-icon">🔍</div>
        <p>No results</p>
      </div>
    `;
    return;
  }

  for (const page of filtered) {
    const item = document.createElement('div');
    item.className = 'note-item' + (currentNoteId === page.url ? ' active' : '');
    item.dataset.pageUrl = page.url;

    const highlightCount = page.highlights.length;
    item.innerHTML = `
      <div class="note-item-title">${escapeHtml(getHostname(page.url))}</div>
      <div class="note-item-preview">${highlightCount} highlight${highlightCount !== 1 ? 's' : ''}</div>
    `;

    item.addEventListener('click', () => {
      currentNoteId = page.url;
      notesList.querySelectorAll('.note-item').forEach((el) => el.classList.remove('active'));
      item.classList.add('active');
      renderPageHighlightsContent(page);
    });

    notesList.appendChild(item);
  }
}

function renderPageHighlightsContent(page: PageHighlights): void {
  editorToolbar.style.display = 'none';
  noteTitle.style.display = 'none';
  editorEmpty.style.display = 'none';
  editorTextarea.style.display = 'none';
  editorPreview.style.display = 'block';

  let html = `
    <div class="page-url-header" style="margin: 0 -24px 16px; padding: 12px 24px; background: #f8f9fa; border-bottom: 1px solid #e0e0e0;">
      <a href="${page.url}" target="_blank">${escapeHtml(page.url)}</a>
    </div>
  `;

  for (const h of page.highlights) {
    const colorClass = 'hl-' + (h.color || 'yellow');
    html += `
      <div class="highlight-card">
        <div class="highlight-card-text ${colorClass}">${escapeHtml(h.text)}</div>
        ${h.comment ? `<div class="highlight-card-comment">${escapeHtml(h.comment)}</div>` : ''}
        <div class="highlight-card-meta">
          <span class="highlight-card-date">${formatDate(h.createdAt)}</span>
          ${
            h.tags && h.tags.length > 0
              ? `<div class="highlight-card-tags">${h.tags.map((t) => `<span class="highlight-tag">${escapeHtml(t)}</span>`).join('')}</div>`
              : ''
          }
        </div>
      </div>
    `;
  }

  editorPreview.innerHTML = html;
}

async function loadAndRenderNotes(categoryId: string): Promise<void> {
  notes = await getNotesByCategory(categoryId);
  renderNotesList();
}

function renderNotesList(): void {
  notesList.innerHTML = '';

  const filtered = searchQuery
    ? notes.filter(
        (n) =>
          n.title.toLowerCase().includes(searchQuery) ||
          n.content.toLowerCase().includes(searchQuery),
      )
    : notes;

  if (filtered.length === 0) {
    notesList.innerHTML = `
      <div class="notes-empty">
        <div class="notes-empty-icon">${searchQuery ? '🔍' : '📝'}</div>
        <p>${searchQuery ? 'No results' : 'No notes yet'}</p>
      </div>
    `;
    return;
  }

  for (const note of filtered) {
    const item = document.createElement('div');
    item.className = 'note-item' + (currentNoteId === note.id ? ' active' : '');
    item.dataset.noteId = note.id;

    const preview = note.content
      ? truncate(note.content.replace(/[#*`\-[\]]/g, '').trim(), 60)
      : 'Empty note';

    item.innerHTML = `
      <div class="note-item-title">${escapeHtml(note.title || 'Untitled')}</div>
      <div class="note-item-preview">${escapeHtml(preview)}</div>
      <div class="note-item-date">${formatDate(note.updatedAt)}</div>
    `;

    item.addEventListener('click', () => openNote(note.id));
    notesList.appendChild(item);
  }
}

async function openNote(noteId: string): Promise<void> {
  currentNoteId = noteId;
  const note = await getNote(noteId);
  if (!note) return;

  notesList.querySelectorAll('.note-item').forEach((el) => el.classList.remove('active'));
  const activeItem = notesList.querySelector(`[data-note-id="${noteId}"]`);
  activeItem?.classList.add('active');

  editorToolbar.style.display = 'flex';
  noteTitle.style.display = 'block';
  editorEmpty.style.display = 'none';

  noteTitle.value = note.title;
  editorTextarea.value = note.content;

  if (isPreviewMode) {
    showPreview();
  } else {
    showEditor();
  }
}

function showEditorEmpty(): void {
  editorToolbar.style.display = 'none';
  noteTitle.style.display = 'none';
  editorEmpty.style.display = 'flex';
  editorTextarea.style.display = 'none';
  editorPreview.style.display = 'none';
}

function showEditor(): void {
  isPreviewMode = false;
  editorTextarea.style.display = 'block';
  editorPreview.style.display = 'none';
  btnEdit.classList.add('active');
  btnPreview.classList.remove('active');
  editorTextarea.focus();
}

function showPreview(): void {
  isPreviewMode = true;
  editorTextarea.style.display = 'none';
  editorPreview.style.display = 'block';
  btnEdit.classList.remove('active');
  btnPreview.classList.add('active');
  renderMarkdownPreview(editorTextarea.value);
}

async function renderMarkdownPreview(content: string): Promise<void> {
  const html = await marked.parse(content);
  editorPreview.innerHTML = html;
  enableCheckboxes();

  try {
    const mermaidEls = editorPreview.querySelectorAll<HTMLElement>('.mermaid');
    if (mermaidEls.length > 0) {
      await mermaid.run({ nodes: mermaidEls });
    }
  } catch (err) {
    console.debug('Mermaid render error:', err);
  }
}

function enableCheckboxes(): void {
  const checkboxes = editorPreview.querySelectorAll<HTMLInputElement>(
    'input[type="checkbox"]',
  );
  checkboxes.forEach((cb, idx) => {
    cb.removeAttribute('disabled');
    cb.addEventListener('change', () => handleCheckboxToggle(idx, cb.checked));
  });
}

async function handleCheckboxToggle(index: number, checked: boolean): Promise<void> {
  if (!currentNoteId || currentCategoryId === PAGE_HIGHLIGHTS_ID) return;

  const note = await getNote(currentNoteId);
  if (!note) return;

  let count = 0;
  const lines = note.content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*[-*+]\s*\[([ xX])\]/.test(lines[i])) {
      if (count === index) {
        lines[i] = checked
          ? lines[i].replace(/\[([ ])\]/, '[x]')
          : lines[i].replace(/\[([xX])\]/, '[ ]');
        break;
      }
      count++;
    }
  }

  const newContent = lines.join('\n');
  await updateNote(currentNoteId, { content: newContent });
  editorTextarea.value = newContent;
  showSaveStatus('saved');

  renderMarkdownPreview(newContent);
}

function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer);
  showSaveStatus('saving');
  saveTimer = setTimeout(async () => {
    if (!currentNoteId || currentCategoryId === PAGE_HIGHLIGHTS_ID) return;
    await updateNote(currentNoteId, {
      title: noteTitle.value.trim() || 'Untitled',
      content: editorTextarea.value,
    });
    showSaveStatus('saved');
    updateNoteInList(currentNoteId);
  }, 600);
}

function showSaveStatus(status: 'saving' | 'saved'): void {
  saveIndicator.textContent = status === 'saving' ? 'Saving...' : 'Saved';
  saveIndicator.className = 'save-indicator ' + status;
  if (status === 'saved') {
    setTimeout(() => {
      saveIndicator.textContent = '';
      saveIndicator.className = 'save-indicator';
    }, 2000);
  }
}

function updateNoteInList(noteId: string): void {
  const item = notesList.querySelector(`[data-note-id="${noteId}"]`);
  if (!item) return;

  const titleEl = item.querySelector('.note-item-title');
  const previewEl = item.querySelector('.note-item-preview');
  const dateEl = item.querySelector('.note-item-date');

  if (titleEl) titleEl.textContent = noteTitle.value.trim() || 'Untitled';
  if (previewEl) {
    const preview = editorTextarea.value
      ? truncate(editorTextarea.value.replace(/[#*`\-[\]]/g, '').trim(), 60)
      : 'Empty note';
    previewEl.textContent = preview;
  }
  if (dateEl) dateEl.textContent = formatDate(Date.now());
}

async function handleCreateNote(): Promise<void> {
  if (!currentCategoryId || currentCategoryId === PAGE_HIGHLIGHTS_ID) return;
  const note = await createNote(currentCategoryId, 'Untitled');
  notes.unshift(note);
  renderNotesList();
  openNote(note.id);
  noteTitle.focus();
  noteTitle.select();
  updateCategoryCounts();
}

async function handleDeleteCurrentNote(): Promise<void> {
  if (!currentNoteId || currentCategoryId === PAGE_HIGHLIGHTS_ID) return;
  const confirmed = confirm('Delete this note?');
  if (!confirmed) return;

  await deleteNote(currentNoteId);
  notes = notes.filter((n) => n.id !== currentNoteId);
  currentNoteId = null;
  renderNotesList();
  showEditorEmpty();
  updateCategoryCounts();
}

let modalResolve: ((value: string | null) => void) | null = null;

function showModal(title: string, placeholder: string, confirmText: string, defaultValue = ''): Promise<string | null> {
  modalTitle.textContent = title;
  modalInput.placeholder = placeholder;
  modalInput.value = defaultValue;
  modalConfirm.textContent = confirmText;
  modalOverlay.classList.add('active');
  setTimeout(() => {
    modalInput.focus();
    modalInput.select();
  }, 50);

  return new Promise((resolve) => {
    modalResolve = resolve;
  });
}

function closeModal(value: string | null): void {
  modalOverlay.classList.remove('active');
  if (modalResolve) {
    modalResolve(value);
    modalResolve = null;
  }
}

async function handleAddCategory(): Promise<void> {
  const name = await showModal('New Category', 'Category name', 'Create');
  if (!name?.trim()) return;
  const cat = await createCategory(name.trim());
  categories.push(cat);
  renderCategories();
  selectCategory(cat.id);
}

async function showRenameModal(categoryId: string, currentName: string): Promise<void> {
  const name = await showModal('Rename Category', 'Category name', 'Rename', currentName);
  if (!name?.trim() || name.trim() === currentName) return;
  await renameCategory(categoryId, name.trim());
  const cat = categories.find((c) => c.id === categoryId);
  if (cat) cat.name = name.trim();
  renderCategories();
  if (currentCategoryId === categoryId) {
    notesHeaderTitle.textContent = name.trim();
  }
}

async function handleDeleteCategory(categoryId: string): Promise<void> {
  const cat = categories.find((c) => c.id === categoryId);
  if (!cat) return;
  const confirmed = confirm(`Delete "${cat.name}" and all its notes?`);
  if (!confirmed) return;

  await deleteCategory(categoryId);
  categories = categories.filter((c) => c.id !== categoryId);
  renderCategories();

  if (currentCategoryId === categoryId) {
    selectCategory(PAGE_HIGHLIGHTS_ID);
  }
}

addCategoryBtn.addEventListener('click', handleAddCategory);
addNoteBtn.addEventListener('click', handleCreateNote);
btnEdit.addEventListener('click', showEditor);
btnPreview.addEventListener('click', showPreview);
btnDeleteNote.addEventListener('click', handleDeleteCurrentNote);

editorTextarea.addEventListener('input', scheduleSave);
noteTitle.addEventListener('input', scheduleSave);

noteTitle.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    editorTextarea.focus();
  }
});

notesSearchInput.addEventListener('input', () => {
  searchQuery = notesSearchInput.value.toLowerCase();
  if (currentCategoryId === PAGE_HIGHLIGHTS_ID) {
    renderPageHighlightsList();
  } else {
    renderNotesList();
  }
});

modalCancel.addEventListener('click', () => closeModal(null));
modalConfirm.addEventListener('click', () => closeModal(modalInput.value));
modalInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') closeModal(modalInput.value);
  if (e.key === 'Escape') closeModal(null);
});
modalOverlay.addEventListener('click', (e) => {
  if (e.target === modalOverlay) closeModal(null);
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && modalOverlay.classList.contains('active')) {
    closeModal(null);
  }
  if ((e.metaKey || e.ctrlKey) && e.key === 's') {
    e.preventDefault();
    if (currentNoteId && currentCategoryId !== PAGE_HIGHLIGHTS_ID) {
      if (saveTimer) clearTimeout(saveTimer);
      updateNote(currentNoteId, {
        title: noteTitle.value.trim() || 'Untitled',
        content: editorTextarea.value,
      }).then(() => showSaveStatus('saved'));
    }
  }
});

editorTextarea.addEventListener('keydown', (e) => {
  if (e.key === 'Tab') {
    e.preventDefault();
    const start = editorTextarea.selectionStart;
    const end = editorTextarea.selectionEnd;
    editorTextarea.value =
      editorTextarea.value.substring(0, start) + '  ' + editorTextarea.value.substring(end);
    editorTextarea.selectionStart = editorTextarea.selectionEnd = start + 2;
    scheduleSave();
  }
});

init();

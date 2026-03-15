import type { HighlightColor, HighlightPosition, PageHighlights } from '@/utils/types';

// Tab switching
const tabs = document.querySelectorAll('.tab');
const panels = document.querySelectorAll('.panel');

tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    const targetTab = (tab as HTMLElement).dataset.tab;
    
    if (targetTab === 'all') {
      chrome.runtime.openOptionsPage();
      return;
    }
    
    tabs.forEach(t => t.classList.remove('active'));
    panels.forEach(p => p.classList.remove('active'));
    
    tab.classList.add('active');
    document.getElementById(`${targetTab}-panel`)?.classList.add('active');
    
    if (targetTab === 'current') {
      loadCurrentPageHighlights();
    }
  });
});

// Format date
function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Truncate text
function truncateText(text: string, maxLength: number = 100): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

// Create highlight item element
function isStandaloneNote(highlight: HighlightPosition): boolean {
  return highlight.xpath === '';
}

function createHighlightElement(highlight: HighlightPosition, url?: string): HTMLElement {
  const item = document.createElement('div');
  item.className = 'highlight-item';
  item.dataset.highlightId = highlight.id;

  const isNote = isStandaloneNote(highlight);

  if (isNote) {
    const noteDiv = document.createElement('div');
    noteDiv.className = 'note-text';
    noteDiv.textContent = highlight.text;
    item.appendChild(noteDiv);
  } else {
    const textDiv = document.createElement('div');
    const color = highlight.color || 'yellow';
    textDiv.className = `highlight-text color-${color}`;
    textDiv.textContent = truncateText(highlight.text, 150);
    textDiv.style.cursor = 'pointer';
    textDiv.title = 'Click to navigate to this highlight';

    textDiv.addEventListener('click', async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        chrome.tabs.sendMessage(tab.id, {
          action: 'scrollToHighlight',
          highlightId: highlight.id
        });
      }
    });

    item.appendChild(textDiv);

    if (highlight.comment) {
      const commentDiv = document.createElement('div');
      commentDiv.className = 'highlight-comment';
      commentDiv.textContent = highlight.comment;
      item.appendChild(commentDiv);
    }
  }

  // Add tags if exist
  if (highlight.tags && highlight.tags.length > 0) {
    const tagsDiv = document.createElement('div');
    tagsDiv.className = 'highlight-tags';
    highlight.tags.forEach(tag => {
      const tagSpan = document.createElement('span');
      tagSpan.className = 'tag';
      tagSpan.textContent = tag;
      tagsDiv.appendChild(tagSpan);
    });
    item.appendChild(tagsDiv);
  }

  if (url) {
    const urlLink = document.createElement('a');
    urlLink.className = 'highlight-url';
    urlLink.href = url;
    urlLink.textContent = new URL(url).hostname + new URL(url).pathname;
    urlLink.title = url;
    urlLink.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.tabs.create({ url });
    });
    item.appendChild(urlLink);
  }

  const metaDiv = document.createElement('div');
  metaDiv.className = 'highlight-meta';

  const dateSpan = document.createElement('span');
  dateSpan.className = 'highlight-date';
  dateSpan.textContent = formatDate(highlight.createdAt);

  const actionsDiv = document.createElement('div');
  actionsDiv.style.display = 'flex';
  actionsDiv.style.gap = '8px';

  const editBtn = document.createElement('button');
  editBtn.className = 'btn-edit';
  editBtn.textContent = 'Edit';
  editBtn.addEventListener('click', () => showEditForm(item, highlight, url));

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'btn-delete';
  deleteBtn.textContent = 'Delete';
  deleteBtn.addEventListener('click', () => deleteHighlight(highlight.id, url));

  actionsDiv.appendChild(editBtn);
  actionsDiv.appendChild(deleteBtn);

  metaDiv.appendChild(dateSpan);
  metaDiv.appendChild(actionsDiv);

  item.appendChild(metaDiv);

  return item;
}

// Show edit form for a highlight
function showEditForm(item: HTMLElement, highlight: HighlightPosition, url?: string): void {
  // Check if edit form already exists
  const existingForm = item.querySelector('.edit-form');
  if (existingForm) {
    existingForm.remove();
    return;
  }

  // Create edit form
  const editForm = document.createElement('div');
  editForm.className = 'edit-form';

  // Comment field
  const commentGroup = document.createElement('div');
  commentGroup.className = 'edit-form-group';
  
  const commentLabel = document.createElement('label');
  commentLabel.className = 'edit-form-label';
  commentLabel.textContent = 'Comment';
  
  const commentTextarea = document.createElement('textarea');
  commentTextarea.className = 'edit-form-textarea';
  commentTextarea.value = highlight.comment || '';
  commentTextarea.placeholder = 'Add your thoughts...';
  
  commentGroup.appendChild(commentLabel);
  commentGroup.appendChild(commentTextarea);

  // Tags field
  const tagsGroup = document.createElement('div');
  tagsGroup.className = 'edit-form-group';
  
  const tagsLabel = document.createElement('label');
  tagsLabel.className = 'edit-form-label';
  tagsLabel.textContent = 'Tags';
  
  const tagsInput = document.createElement('input');
  tagsInput.className = 'edit-form-input';
  tagsInput.type = 'text';
  tagsInput.placeholder = 'Press Enter to add tags';
  
  const tagsHint = document.createElement('div');
  tagsHint.className = 'edit-form-hint';
  tagsHint.textContent = 'Press Enter after each tag';
  
  const tagsContainer = document.createElement('div');
  tagsContainer.className = 'edit-form-tags';
  
  // State for tags
  const editTags: string[] = [...(highlight.tags || [])];
  
  // Render tags
  function renderTags(): void {
    tagsContainer.innerHTML = '';
    editTags.forEach((tag, index) => {
      const tagSpan = document.createElement('span');
      tagSpan.className = 'edit-form-tag';
      tagSpan.textContent = tag;
      
      const removeBtn = document.createElement('button');
      removeBtn.className = 'edit-form-tag-remove';
      removeBtn.textContent = '×';
      removeBtn.addEventListener('click', () => {
        editTags.splice(index, 1);
        renderTags();
      });
      
      tagSpan.appendChild(removeBtn);
      tagsContainer.appendChild(tagSpan);
    });
  }
  
  renderTags();
  
  // Add tag on Enter
  tagsInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const tag = tagsInput.value.trim();
      if (tag && !editTags.includes(tag)) {
        editTags.push(tag);
        renderTags();
      }
      tagsInput.value = '';
    }
  });
  
  tagsGroup.appendChild(tagsLabel);
  tagsGroup.appendChild(tagsInput);
  tagsGroup.appendChild(tagsHint);
  tagsGroup.appendChild(tagsContainer);

  // Actions
  const actionsDiv = document.createElement('div');
  actionsDiv.className = 'edit-form-actions';
  
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn-cancel';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => {
    editForm.remove();
  });
  
  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn-save';
  saveBtn.textContent = 'Save';
  saveBtn.addEventListener('click', async () => {
    const comment = commentTextarea.value.trim();
    await updateHighlight(highlight.id, { comment, tags: editTags }, url);
    editForm.remove();
  });
  
  actionsDiv.appendChild(cancelBtn);
  actionsDiv.appendChild(saveBtn);

  editForm.appendChild(commentGroup);
  editForm.appendChild(tagsGroup);
  editForm.appendChild(actionsDiv);

  item.appendChild(editForm);
  
  // Focus on comment textarea
  setTimeout(() => commentTextarea.focus(), 100);
}

// Update highlight
async function updateHighlight(highlightId: string, updates: { comment?: string; tags?: string[] }, url?: string): Promise<void> {
  // Get URL if not provided
  if (!url) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    url = tab?.url;
  }
  
  if (!url) return;
  
  // Update in storage
  await new Promise<void>((resolve) => {
    chrome.runtime.sendMessage(
      { action: 'updateHighlightData', url, highlightId, updates },
      () => resolve()
    );
  });
   
  if (document.querySelector('.tab.active')?.getAttribute('data-tab') === 'current') {
    loadCurrentPageHighlights();
  }
}

// Load current page highlights
async function loadCurrentPageHighlights(): Promise<void> {
  const container = document.getElementById('current-list');
  if (!container) return;
  
  // Get current tab URL
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🔒</div>
        <p>Cannot access this page</p>
      </div>
    `;
    return;
  }
  
  const highlights = await new Promise<HighlightPosition[]>((resolve) => {
    chrome.runtime.sendMessage(
      { action: 'getHighlights', url: tab.url },
      (response) => resolve(response || [])
    );
  });
  
  if (highlights.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📭</div>
        <p>No highlights on this page yet</p>
        <p style="font-size: 12px; margin-top: 8px;">Select text and right-click to save</p>
      </div>
    `;
    return;
  }
  
  container.innerHTML = '';
  highlights.forEach(h => {
    container.appendChild(createHighlightElement(h));
  });
}

// Delete highlight
async function deleteHighlight(highlightId: string, url?: string): Promise<void> {
  // Show confirmation dialog
  const confirmed = confirm('Are you sure you want to delete this highlight?');
  if (!confirmed) {
    return; // User cancelled deletion
  }
  
  // Get URL if not provided
  if (!url) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    url = tab?.url;
  }
  
  if (!url) return;
  
  // Remove from storage
  await new Promise<void>((resolve) => {
    chrome.runtime.sendMessage(
      { action: 'removeHighlightData', url, highlightId },
      () => resolve()
    );
  });
  
  // Remove from DOM
  const item = document.querySelector(`[data-highlight-id="${highlightId}"]`);
  item?.remove();
  
  // Notify content script to remove highlight
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    chrome.tabs.sendMessage(tab.id, { action: 'refreshHighlights' });
  }
  
  if (document.querySelector('.tab.active')?.getAttribute('data-tab') === 'current') {
    loadCurrentPageHighlights();
  }
}

// Note form
const btnAddNote = document.getElementById('btn-add-note') as HTMLButtonElement;
const noteForm = document.getElementById('note-form') as HTMLElement;
const noteTextarea = document.getElementById('note-textarea') as HTMLTextAreaElement;
const noteTagsInput = document.getElementById('note-tags-input') as HTMLInputElement;
const noteTagsContainer = document.getElementById('note-tags-container') as HTMLElement;
const noteCancelBtn = document.getElementById('note-cancel') as HTMLButtonElement;
const noteSaveBtn = document.getElementById('note-save') as HTMLButtonElement;

let noteTags: string[] = [];

function renderNoteTags(): void {
  noteTagsContainer.innerHTML = '';
  noteTags.forEach((tag, index) => {
    const tagSpan = document.createElement('span');
    tagSpan.className = 'edit-form-tag';
    tagSpan.textContent = tag;

    const removeBtn = document.createElement('button');
    removeBtn.className = 'edit-form-tag-remove';
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', () => {
      noteTags.splice(index, 1);
      renderNoteTags();
    });

    tagSpan.appendChild(removeBtn);
    noteTagsContainer.appendChild(tagSpan);
  });
}

noteTagsInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    const tag = noteTagsInput.value.trim();
    if (tag && !noteTags.includes(tag)) {
      noteTags.push(tag);
      renderNoteTags();
    }
    noteTagsInput.value = '';
  } else if (e.key === 'Backspace' && noteTagsInput.value === '' && noteTags.length > 0) {
    noteTags.pop();
    renderNoteTags();
  }
});

btnAddNote.addEventListener('click', () => {
  noteForm.classList.add('active');
  btnAddNote.style.display = 'none';
  noteTextarea.value = '';
  noteTagsInput.value = '';
  noteTags = [];
  renderNoteTags();
  setTimeout(() => noteTextarea.focus(), 50);
});

function closeNoteForm(): void {
  noteForm.classList.remove('active');
  btnAddNote.style.display = '';
  noteTextarea.value = '';
  noteTagsInput.value = '';
  noteTags = [];
  renderNoteTags();
}

noteCancelBtn.addEventListener('click', closeNoteForm);

noteSaveBtn.addEventListener('click', async () => {
  const text = noteTextarea.value.trim();
  if (!text) return;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) return;

  const highlight: HighlightPosition = {
    id: crypto.randomUUID(),
    text,
    xpath: '',
    startOffset: 0,
    endOffset: 0,
    beforeContext: '',
    afterContext: '',
    createdAt: Date.now(),
    tags: noteTags.length > 0 ? [...noteTags] : undefined,
  };

  await new Promise<void>((resolve) => {
    chrome.runtime.sendMessage(
      { action: 'saveHighlightData', url: tab.url, highlight },
      () => resolve(),
    );
  });

  closeNoteForm();
  loadCurrentPageHighlights();
});

noteTextarea.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    noteSaveBtn.click();
  }
  if (e.key === 'Escape') {
    closeNoteForm();
  }
});

// Initial load
loadCurrentPageHighlights();

window.addEventListener('highlights-updated', () => {
  if (document.querySelector('.tab.active')?.getAttribute('data-tab') === 'current') {
    loadCurrentPageHighlights();
  }
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'tabActivated' || message.action === 'highlightsChanged') {
    if (document.querySelector('.tab.active')?.getAttribute('data-tab') === 'current') {
      loadCurrentPageHighlights();
    }
  }
});

import { openDB, type IDBPDatabase } from 'idb';
import type { NoteCategory, Note } from './types';

const DB_NAME = 'highlighter-notes';
const DB_VERSION = 1;
const CATEGORIES_STORE = 'categories';
const NOTES_STORE = 'notes';

function getNotesDb(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(CATEGORIES_STORE)) {
        db.createObjectStore(CATEGORIES_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(NOTES_STORE)) {
        const store = db.createObjectStore(NOTES_STORE, { keyPath: 'id' });
        store.createIndex('categoryId', 'categoryId', { unique: false });
      }
    },
  });
}

// ── Category operations ──

export async function getAllCategories(): Promise<NoteCategory[]> {
  const db = await getNotesDb();
  const categories: NoteCategory[] = await db.getAll(CATEGORIES_STORE);
  return categories.sort((a, b) => a.createdAt - b.createdAt);
}

export async function createCategory(name: string): Promise<NoteCategory> {
  const db = await getNotesDb();
  const category: NoteCategory = {
    id: crypto.randomUUID(),
    name,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await db.put(CATEGORIES_STORE, category);
  return category;
}

export async function renameCategory(id: string, name: string): Promise<void> {
  const db = await getNotesDb();
  const existing = await db.get(CATEGORIES_STORE, id) as NoteCategory | undefined;
  if (!existing) return;
  await db.put(CATEGORIES_STORE, { ...existing, name, updatedAt: Date.now() });
}

export async function deleteCategory(id: string): Promise<void> {
  const db = await getNotesDb();
  const tx = db.transaction([CATEGORIES_STORE, NOTES_STORE], 'readwrite');
  await tx.objectStore(CATEGORIES_STORE).delete(id);
  const notes: Note[] = await tx.objectStore(NOTES_STORE).index('categoryId').getAll(id);
  for (const note of notes) {
    await tx.objectStore(NOTES_STORE).delete(note.id);
  }
  await tx.done;
}

// ── Note operations ──

export async function getNotesByCategory(categoryId: string): Promise<Note[]> {
  const db = await getNotesDb();
  const notes: Note[] = await db.getAllFromIndex(NOTES_STORE, 'categoryId', categoryId);
  return notes.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getNote(id: string): Promise<Note | undefined> {
  const db = await getNotesDb();
  return db.get(NOTES_STORE, id) as Promise<Note | undefined>;
}

export async function createNote(categoryId: string, title: string, content: string = ''): Promise<Note> {
  const db = await getNotesDb();
  const note: Note = {
    id: crypto.randomUUID(),
    categoryId,
    title,
    content,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await db.put(NOTES_STORE, note);
  return note;
}

export async function updateNote(
  id: string,
  updates: Partial<Pick<Note, 'title' | 'content'>>,
): Promise<void> {
  const db = await getNotesDb();
  const existing = await db.get(NOTES_STORE, id) as Note | undefined;
  if (!existing) return;
  await db.put(NOTES_STORE, { ...existing, ...updates, updatedAt: Date.now() });
}

export async function deleteNote(id: string): Promise<void> {
  const db = await getNotesDb();
  await db.delete(NOTES_STORE, id);
}

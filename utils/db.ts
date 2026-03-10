import { openDB, type IDBPDatabase } from 'idb';
import type { HighlightPosition, PageHighlights } from './types';

const DB_NAME = 'highlighter';
const DB_VERSION = 1;
const STORE_NAME = 'highlights';

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

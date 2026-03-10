import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
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
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
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

import { describe, it, expect } from 'vitest';
import { pickLatestUsableArtifact } from './localDb';
import type { LocalDocxArtifact } from './localDb';

/** Yalnız testin baktığı alanlar dolduruluyor */
const art = (id: string, day: number, withBlob = true): LocalDocxArtifact =>
  ({
    id,
    conversationId: 'c1',
    fileName: 'rapor.docx',
    instruction: 'düzelt',
    editedBlob: withBlob ? new Blob(['x']) : undefined,
    previewHtml: '<p>x</p>',
    editCount: 1,
    createdAt: new Date(2026, 0, day),
  }) as LocalDocxArtifact;

describe('pickLatestUsableArtifact', () => {
  it('en yeniyi seçer, dizi sırasına bakmaz', () => {
    expect(pickLatestUsableArtifact([art('a', 1), art('c', 3), art('b', 2)])?.id).toBe('c');
  });

  it('dosyası olmayanı ATLAR — üzerinde devam edilemez', () => {
    // Kotaya takılan kayıt en yeni olsa bile seçilmemeli
    const picked = pickLatestUsableArtifact([art('eski', 1), art('kotasiz', 5, false)]);
    expect(picked?.id).toBe('eski');
  });

  it('hiç kullanılabilir kayıt yoksa undefined döner', () => {
    expect(pickLatestUsableArtifact([art('x', 1, false)])).toBeUndefined();
    expect(pickLatestUsableArtifact([])).toBeUndefined();
  });

  it('girdi dizisini bozmaz', () => {
    // sort() yerinde çalışır; çağıranın listesi karışmasın
    const list = [art('a', 1), art('c', 3), art('b', 2)];
    pickLatestUsableArtifact(list);
    expect(list.map((a) => a.id)).toEqual(['a', 'c', 'b']);
  });
});

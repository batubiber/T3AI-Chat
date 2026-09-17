import { describe, it, expect } from 'vitest';
import {
  isPptxFile,
  isLegacyPptFile,
  isFileSupported,
  getFileTypeDescription,
  getAcceptedFileTypes,
  parseFile,
} from './fileParser';

describe('pptx tanıma', () => {
  it('.pptx desteklenir', () => {
    expect(isPptxFile('sunum.pptx')).toBe(true);
    expect(isFileSupported('sunum.pptx')).toBe(true);
  });

  it('büyük harfli uzantı tanınır', () => {
    expect(isPptxFile('SUNUM.PPTX')).toBe(true);
    expect(isFileSupported('SUNUM.PPTX')).toBe(true);
  });

  it('.ppt desteklenmez ama ayrı tanınır', () => {
    expect(isPptxFile('eski.ppt')).toBe(false);
    expect(isFileSupported('eski.ppt')).toBe(false);
    expect(isLegacyPptFile('eski.ppt')).toBe(true);
  });

  it('.pptx legacy sayılmaz', () => {
    expect(isLegacyPptFile('sunum.pptx')).toBe(false);
  });

  it('accept listesine .pptx girer, .ppt girmez', () => {
    const accept = getAcceptedFileTypes();
    expect(accept.split(',')).toContain('.pptx');
    expect(accept.split(',')).not.toContain('.ppt');
  });

  it('tür açıklamaları', () => {
    expect(getFileTypeDescription('a.pptx')).toBe('PowerPoint Sunumu');
    expect(getFileTypeDescription('a.ppt')).toBe('PowerPoint 97-2003');
  });

  it('mevcut formatların tanımı değişmedi', () => {
    expect(getFileTypeDescription('a.pdf')).toBe('PDF Belgesi');
    expect(getFileTypeDescription('a.xlsx')).toBe('Excel Tablosu');
    expect(getFileTypeDescription('a.docx')).toBe('Word Belgesi');
  });
});

describe('.ppt net hata verir', () => {
  it('parseFile .ppt için yönlendirici mesaj atar', async () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'eski.ppt');
    await expect(parseFile(file)).rejects.toThrow(/\.pptx olarak kaydedip/);
  });
});

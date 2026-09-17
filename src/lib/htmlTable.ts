/**
 * HTML tablo → Markdown pipe tablosu dönüştürücü.
 * fileParser'dan taşındı (davranış birebir aynı): hem DOCX parse yolu hem
 * OCR çıktı temizleme (ocrService) kullanır — ayrı modül, import döngüsünü önler.
 */
export function htmlTableToMarkdown(tableHtml: string): string {
  const rows: string[][] = [];
  
  // Extract rows using regex
  const rowMatches = tableHtml.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) || [];
  
  for (const rowHtml of rowMatches) {
    const cells: string[] = [];
    // Match both th and td cells
    const cellMatches = rowHtml.match(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi) || [];
    
    for (const cellHtml of cellMatches) {
      // Extract cell content, strip HTML tags
      const content = cellHtml
        .replace(/<t[hd][^>]*>/i, '')
        .replace(/<\/t[hd]>/i, '')
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      cells.push(content);
    }
    
    if (cells.length > 0) {
      rows.push(cells);
    }
  }
  
  if (rows.length === 0) return '';
  
  // Find max columns
  const maxCols = Math.max(...rows.map(r => r.length));
  
  // Normalize rows to have same number of columns
  const normalizedRows = rows.map(row => {
    while (row.length < maxCols) row.push('');
    return row;
  });
  
  // Build markdown table
  const lines: string[] = [];
  
  // Header row
  lines.push('| ' + normalizedRows[0].join(' | ') + ' |');
  
  // Separator
  lines.push('| ' + normalizedRows[0].map(() => '---').join(' | ') + ' |');
  
  // Data rows
  for (let i = 1; i < normalizedRows.length; i++) {
    lines.push('| ' + normalizedRows[i].join(' | ') + ' |');
  }
  
  return lines.join('\n');
}

/** RAG prompt'unda chunk başlığı: kullanıcı-dostu kaynak etiketi.
 *  "Chunk N" bilinçli olarak YOK — model cevabına iç-etiket sızdırmasın.
 *  PPTX'te birim "sayfa" değil "slayt" — etiket uzantıdan türetilir. */
export function formatChunkHeader(
  fileName?: string,
  pageNumber?: number,
  satirAraligi?: { startLine?: number; endLine?: number },
): string {
  const name = fileName || 'Unknown';
  // Kodda birim SAYFA değil SATIR: "dosya.py:120-180" hem modele hem
  // kullanıcıya doğrudan işe yarar bir adres veriyor
  if (satirAraligi?.startLine !== undefined) {
    const son = satirAraligi.endLine ?? satirAraligi.startLine;
    return `[${name}:${satirAraligi.startLine}-${son}]`;
  }
  if (pageNumber === undefined) return `[${name}]`;
  const unit = name.toLowerCase().endsWith('.pptx') ? 'Slayt' : 'Sayfa';
  return `[${name}, ${unit} ${pageNumber}]`;
}

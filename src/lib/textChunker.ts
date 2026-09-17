/**
 * Text Chunker - Recursive character text splitter
 * Chunks text with overlap for RAG processing
 * Supports table-aware chunking to prevent splitting Markdown tables
 */

import { parcalaKod } from './codeChunker';
import { dosyaDili } from './codeLanguages';

export interface ChunkMetadata {
  fileName?: string;
  pageNumber?: number;
  chunkIndex: number;
  startChar: number;
  endChar: number;
  hasTable?: boolean;
  headingContext?: string;
  /** Kod dosyalarında satır aralığı (1-tabanlı, dahil) — alıntı
   *  "dosya.py:120-180" olabilsin diye */
  startLine?: number;
  endLine?: number;
  /** Kod dili — modele giden bloğun çit etiketi buradan */
  language?: string;
  /** İçinde bulunduğu bildirimin adı, çıkarılabildiyse */
  symbol?: string;
}

export interface TextChunk {
  content: string;
  metadata: ChunkMetadata;
}

export interface ChunkerOptions {
  chunkSize?: number;
  chunkOverlap?: number;
  fileName?: string;
}

const DEFAULT_CHUNK_SIZE = 512;
const DEFAULT_CHUNK_OVERLAP = 64;

// Separators for recursive splitting (in order of preference)
const SEPARATORS = [
  '\n## ',      // Markdown H2
  '\n### ',     // Markdown H3
  '\n#### ',    // Markdown H4
  '\n\n',       // Paragraph
  '\n',         // Line break
  '. ',         // Sentence
  ', ',         // Clause
  ' ',          // Word
  '',           // Character (last resort)
];

// Table protection constants
const TABLE_PLACEHOLDER_PREFIX = '<<<TABLE_';
const TABLE_PLACEHOLDER_SUFFIX = '_TABLE>>>';

/**
 * Detect and extract Markdown tables from text
 * Returns array of table strings and their positions
 */
interface ExtractedTable {
  content: string;
  startIndex: number;
  endIndex: number;
}

function extractTables(text: string): ExtractedTable[] {
  const tables: ExtractedTable[] = [];
  const lines = text.split('\n');
  
  let currentTableLines: string[] = [];
  let tableStartLine = -1;
  let charOffset = 0;
  let tableStartChar = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isTableLine = /^\|.+\|$/.test(line.trim());
    
    if (isTableLine) {
      if (currentTableLines.length === 0) {
        // Starting a new table
        tableStartLine = i;
        tableStartChar = charOffset;
      }
      currentTableLines.push(line);
    } else {
      // End of table (if we were in one)
      if (currentTableLines.length >= 2) {
        // At least header + separator row to be considered a table
        const tableContent = currentTableLines.join('\n');
        tables.push({
          content: tableContent,
          startIndex: tableStartChar,
          endIndex: tableStartChar + tableContent.length,
        });
      }
      currentTableLines = [];
      tableStartLine = -1;
    }
    
    // Track character offset (including newline)
    charOffset += line.length + 1;
  }
  
  // Don't forget table at end of text
  if (currentTableLines.length >= 2) {
    const tableContent = currentTableLines.join('\n');
    tables.push({
      content: tableContent,
      startIndex: tableStartChar,
      endIndex: tableStartChar + tableContent.length,
    });
  }
  
  return tables;
}

/**
 * Replace tables with placeholders to protect them during chunking
 */
interface ProtectedText {
  text: string;
  tables: Map<string, string>;
}

function protectTables(text: string): ProtectedText {
  const tables = extractTables(text);
  const tableMap = new Map<string, string>();
  
  if (tables.length === 0) {
    return { text, tables: tableMap };
  }
  
  let result = text;
  // Process in reverse order to maintain correct indices
  for (let i = tables.length - 1; i >= 0; i--) {
    const table = tables[i];
    const placeholder = `${TABLE_PLACEHOLDER_PREFIX}${i}${TABLE_PLACEHOLDER_SUFFIX}`;
    tableMap.set(placeholder, table.content);
    
    // Replace table with placeholder in text
    result = result.slice(0, table.startIndex) + placeholder + result.slice(table.endIndex);
  }
  
  return { text: result, tables: tableMap };
}

/**
 * Restore tables from placeholders in chunks
 */
function restoreTables(chunks: string[], tableMap: Map<string, string>): string[] {
  if (tableMap.size === 0) {
    return chunks;
  }
  
  return chunks.map(chunk => {
    let restored = chunk;
    tableMap.forEach((tableContent, placeholder) => {
      if (restored.includes(placeholder)) {
        restored = restored.replace(placeholder, tableContent);
      }
    });
    return restored;
  });
}

/**
 * Check if a chunk contains a table (either placeholder or restored)
 */
function chunkHasTable(chunk: string, tableMap: Map<string, string>): boolean {
  // Check for placeholders
  for (const placeholder of tableMap.keys()) {
    if (chunk.includes(placeholder)) {
      return true;
    }
  }
  
  // Check for actual table content (in case already restored)
  const lines = chunk.split('\n');
  let consecutiveTableLines = 0;
  
  for (const line of lines) {
    if (/^\|.+\|$/.test(line.trim())) {
      consecutiveTableLines++;
      if (consecutiveTableLines >= 2) {
        return true;
      }
    } else {
      consecutiveTableLines = 0;
    }
  }
  
  return false;
}

/**
 * Split text recursively using semantic separators
 */
function recursiveSplit(
  text: string,
  chunkSize: number,
  chunkOverlap: number,
  separators: string[] = SEPARATORS
): string[] {
  const chunks: string[] = [];
  
  if (text.length <= chunkSize) {
    return [text];
  }
  
  // Find the best separator to use
  let separator = '';
  for (const sep of separators) {
    if (text.includes(sep)) {
      separator = sep;
      break;
    }
  }
  
  if (separator === '') {
    // No separator found, split by chunk size
    for (let i = 0; i < text.length; i += chunkSize - chunkOverlap) {
      chunks.push(text.slice(i, i + chunkSize));
    }
    return chunks;
  }
  
  // Split by separator
  const parts = text.split(separator);
  let currentChunk = '';
  
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const potentialChunk = currentChunk 
      ? currentChunk + separator + part 
      : part;
    
    if (potentialChunk.length <= chunkSize) {
      currentChunk = potentialChunk;
    } else {
      // Save current chunk if it has content
      if (currentChunk.length > 0) {
        chunks.push(currentChunk);
      }
      
      // If the part itself is too long, recursively split it
      if (part.length > chunkSize) {
        const nextSeparators = separators.slice(separators.indexOf(separator) + 1);
        const subChunks = recursiveSplit(part, chunkSize, chunkOverlap, nextSeparators);
        chunks.push(...subChunks);
        currentChunk = '';
      } else {
        currentChunk = part;
      }
    }
  }
  
  // Don't forget the last chunk
  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }
  
  return chunks;
}

/**
 * Add overlap between chunks
 */
function addOverlap(chunks: string[], overlap: number): string[] {
  if (overlap === 0 || chunks.length <= 1) {
    return chunks;
  }
  
  const overlappedChunks: string[] = [];
  
  for (let i = 0; i < chunks.length; i++) {
    let chunk = chunks[i];
    
    // Add overlap from previous chunk
    if (i > 0 && chunks[i - 1].length >= overlap) {
      const prevOverlap = chunks[i - 1].slice(-overlap);
      chunk = prevOverlap + chunk;
    }
    
    overlappedChunks.push(chunk);
  }
  
  return overlappedChunks;
}

/**
 * Build a heading context map: for each character position, track the active heading hierarchy.
 * Works with any document that uses markdown headings or plain-text heading patterns.
 */
function buildHeadingContextMap(text: string): Map<number, string> {
  const headingMap = new Map<number, string>();
  const lines = text.split('\n');
  const currentHeadings: { level: number; text: string }[] = [];
  let charOffset = 0;

  for (const line of lines) {
    // Match markdown headings: # H1, ## H2, ### H3, #### H4
    const headingMatch = line.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const headingText = headingMatch[2].trim();
      // Remove headings at same or deeper level
      while (currentHeadings.length > 0 && currentHeadings[currentHeadings.length - 1].level >= level) {
        currentHeadings.pop();
      }
      currentHeadings.push({ level, text: headingText });
    }

    // Store heading context for this position
    if (currentHeadings.length > 0) {
      const contextStr = currentHeadings.map(h => h.text).join(' > ');
      headingMap.set(charOffset, contextStr);
    }

    charOffset += line.length + 1; // +1 for newline
  }

  return headingMap;
}

/**
 * Get the heading context for a chunk based on its start position in the original text.
 * Returns the heading path (e.g. "Ürün Adı > Teknik Özellikler") or undefined.
 */
function getHeadingForPosition(headingMap: Map<number, string>, startChar: number): string | undefined {
  // Find the closest heading context at or before startChar
  let bestOffset = -1;
  let bestContext: string | undefined;

  for (const [offset, context] of headingMap) {
    if (offset <= startChar && offset > bestOffset) {
      bestOffset = offset;
      bestContext = context;
    }
  }

  return bestContext;
}

/**
 * Chunk text into smaller pieces with metadata
 * Now with table-aware chunking to prevent splitting Markdown tables
 */
export function chunkText(text: string, options: ChunkerOptions = {}): TextChunk[] {
  const chunkSize = options.chunkSize || DEFAULT_CHUNK_SIZE;
  const chunkOverlap = options.chunkOverlap || DEFAULT_CHUNK_OVERLAP;
  const fileName = options.fileName;
  
  // Clean text
  const cleanedText = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();
  
  if (cleanedText.length === 0) {
    return [];
  }
  
  // Step 1: Protect tables with placeholders
  const { text: protectedText, tables: tableMap } = protectTables(cleanedText);
  
  // Step 2: Split recursively (tables are now protected as single tokens)
  const rawChunks = recursiveSplit(protectedText, chunkSize, 0);
  
  // Step 3: Add overlap
  const overlappedChunks = addOverlap(rawChunks, chunkOverlap);
  
  // Step 4: Restore tables from placeholders
  const restoredChunks = restoreTables(overlappedChunks, tableMap);
  
  // Step 5: Build heading context map from original text
  const headingMap = buildHeadingContextMap(cleanedText);

  // Step 6: Create chunks with metadata (including hasTable flag and heading context)
  let charOffset = 0;
  const chunks: TextChunk[] = restoredChunks.map((content, index) => {
    const trimmedContent = content.trim();
    const hasTable = chunkHasTable(trimmedContent, tableMap) ||
                     chunkHasTable(content, tableMap);

    // Get heading context for this chunk's position
    const headingContext = getHeadingForPosition(headingMap, charOffset);

    // Check if chunk already starts with a heading (no need to prepend)
    const startsWithHeading = /^#{1,4}\s+/.test(trimmedContent);

    // Prepend heading context if chunk doesn't start with its own heading
    const enrichedContent = (headingContext && !startsWithHeading)
      ? `[${headingContext}]\n${trimmedContent}`
      : trimmedContent;

    const chunk: TextChunk = {
      content: enrichedContent,
      metadata: {
        fileName,
        chunkIndex: index,
        startChar: charOffset,
        endChar: charOffset + content.length,
        hasTable,
        headingContext,
      },
    };

    // Approximate char offset (not exact due to overlap)
    charOffset += rawChunks[index]?.length || 0;

    return chunk;
  });
  
  // Filter out empty chunks
  return chunks.filter(c => c.content.length > 0);
}

/**
 * XLSX metnini sayfa ("## <ad>") bloklarına böler.
 *
 * Naif `split(/(?=^##\s+)/m)` HÜCRE İÇERİĞİNE kanıyordu: parseXlsxFile her sayfa
 * için bir ```tsv çiti yazıyor ve bir hücrenin metni "## " ile başlıyorsa
 * (ör. "## Toplam") TSV satırı da öyle başlıyor — split orayı sayfa başlığı
 * sanıp tabloyu ortadan ikiye bölüyordu. Kopan parçada ```tsv çiti olmadığı
 * için chunkText'e düşüyor, o da chunkIndex'i sıfırdan başlatıp indeks
 * tekrarı üretiyordu (ragService conversation-fallback'i chunkIndex'e göre
 * SIRALIYOR — tekrar eden indeks doküman sırasını bozar).
 *
 * Çözüm: ``` çitlerini takip et, yalnız çit DIŞINDAKİ "## " satırlarından böl.
 * parseXlsxFile'ın ürettiği metin DEĞİŞMEZ — mevcut embedding'ler ve
 * contentHash'ler etkilenmez.
 */
export function splitSheetBlocks(text: string): string[] {
  const lines = text.split('\n');
  const blocks: string[] = [];
  let current: string[] = [];
  let inFence = false;

  for (const line of lines) {
    if (line.startsWith('```')) inFence = !inFence;
    if (!inFence && /^##\s+/.test(line) && current.length > 0) {
      blocks.push(current.join('\n'));
      current = [];
    }
    current.push(line);
  }
  if (current.length > 0) blocks.push(current.join('\n'));
  return blocks.filter((b) => b.trim().length > 0);
}

function chunkXlsxText(text: string, options: ChunkerOptions = {}): TextChunk[] {
  const chunkSize = options.chunkSize || 3000;
  const fileName = options.fileName;
  const sheetBlocks = splitSheetBlocks(text.trim());
  const chunks: TextChunk[] = [];
  let charOffset = 0;

  for (const block of sheetBlocks) {
    const sheetName = block.match(/^##\s+(.+)$/m)?.[1]?.trim() || 'Sheet';
    const tsv = block.match(/```tsv\n([\s\S]*?)\n```/)?.[1];
    if (!tsv) {
      // chunkText kendi çıktısını 0'dan numaralar; olduğu gibi eklemek doküman
      // ortasında chunkIndex'i sıfırlar ve tekrar üretir. Yeniden numaralandır.
      for (const c of chunkText(block, { ...options, fileName })) {
        chunks.push({ ...c, metadata: { ...c.metadata, chunkIndex: chunks.length } });
      }
      charOffset += block.length;
      continue;
    }

    const rows = tsv.split('\n').filter(row => row.trim().length > 0);
    const header = rows[0] || '';
    let currentRows: string[] = [];
    const flush = () => {
      if (currentRows.length === 0) return;
      const content = `## ${sheetName}\n\nTSV tablo (başlık satırı):\n${header}\n${currentRows.join('\n')}`;
      chunks.push({
        content,
        metadata: {
          fileName,
          chunkIndex: chunks.length,
          startChar: charOffset,
          endChar: charOffset + content.length,
          hasTable: true,
          headingContext: sheetName,
        },
      });
      charOffset += content.length;
      currentRows = [];
    };

    for (let i = 1; i < rows.length; i++) {
      const nextRows = [...currentRows, rows[i]];
      const nextContent = `## ${sheetName}\n\nTSV tablo (başlık satırı):\n${header}\n${nextRows.join('\n')}`;
      if (nextContent.length > chunkSize && currentRows.length > 0) flush();
      currentRows.push(rows[i]);
    }
    if (rows.length === 1) currentRows.push(header);
    flush();
  }

  return chunks.length > 0 ? chunks : chunkText(text, { ...options, fileName });
}

/**
 * PPTX metnini slayt sınırlarına saygıyla chunk'lar: her slayt tek chunk kalır,
 * chunkSize'a sığmayan slayt chunkText'e düşer. chunkXlsxText'in sheet-başına
 * deseninin aynısı. Slayt işaretleri İÇERİKTE BIRAKILIR (derivePageNumbers okur).
 */
export function chunkPptxText(text: string, options: ChunkerOptions = {}): TextChunk[] {
  const chunkSize = options.chunkSize || 3000;
  const fileName = options.fileName;

  // İşaret konumlarını topla
  const re = /---\s*Slayt\s+(\d+)\s*---/g;
  const marks: { index: number; slide: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) marks.push({ index: m.index, slide: Number(m[1]) });

  // Parçalara böl: her parça kendi işaretiyle başlar
  const parts: { slide?: number; body: string }[] = [];
  if (marks.length === 0) {
    const body = text.trim();
    if (body) parts.push({ slide: undefined, body });
  } else {
    if (marks[0].index > 0) {
      const pre = text.slice(0, marks[0].index).trim();
      if (pre) parts.push({ slide: undefined, body: pre });
    }
    for (let i = 0; i < marks.length; i++) {
      const end = i + 1 < marks.length ? marks[i + 1].index : text.length;
      const body = text.slice(marks[i].index, end).trim();
      if (body) parts.push({ slide: marks[i].slide, body });
    }
  }

  const chunks: TextChunk[] = [];
  let charOffset = 0;
  const push = (content: string, slide?: number, base?: Partial<ChunkMetadata>) => {
    // Baştaki slayt işareti çıkarılınca geriye içerik kalmıyorsa bu chunk'ı üretme
    // (küçük-slayt yolunda gövdesi yalnızca işaretten ibaret slayt, ya da bölünmüş
    // slaytta işaretin tek başına flush edildiği durum) — chunkIndex boşluksuz
    // kalsın diye eklemeden ÖNCE kontrol ediliyor
    if (!content.replace(/^---\s*Slayt\s+\d+\s*---\s*/, '').trim()) return;
    chunks.push({
      content,
      metadata: {
        ...(base || {}),
        fileName,
        chunkIndex: chunks.length,
        startChar: charOffset,
        endChar: charOffset + content.length,
        ...(slide !== undefined ? { headingContext: `Slayt ${slide}` } : {}),
      } as ChunkMetadata,
    });
    charOffset += content.length;
  };

  for (const part of parts) {
    if (part.body.length <= chunkSize) {
      push(part.body, part.slide);
      continue;
    }
    const sub = chunkText(part.body, { ...options, chunkSize, fileName });
    for (let i = 0; i < sub.length; i++) {
      // İlk parça işareti zaten taşıyor; sonrakilere geri ekle ki sayfa numarası kaybolmasın
      const content =
        i === 0 || part.slide === undefined
          ? sub[i].content
          : `--- Slayt ${part.slide} ---\n${sub[i].content}`;
      push(content, part.slide, { hasTable: sub[i].metadata.hasTable });
    }
  }

  return chunks;
}

/**
 * Chunk a file based on its type
 */
/**
 * Kod parçalarını TextChunk'a çevirir.
 *
 * Satır aralığı ve sembol metadata'ya taşınıyor: alıntıda "dosya.py:120-180"
 * yazabilmek ve geri getirmede "şu fonksiyonun içinde" diyebilmek için.
 */
function chunkCodeFile(
  fileName: string,
  content: string,
  dil: ReturnType<typeof dosyaDili> & string,
  chunkSize?: number,
): TextChunk[] {
  const parcalar = parcalaKod(content, dil, { chunkSize: chunkSize ?? 1500 });
  let charOffset = 0;
  return parcalar.map((p, i) => {
    const startChar = charOffset;
    charOffset += p.content.length;
    return {
      content: p.content,
      metadata: {
        fileName,
        chunkIndex: i,
        startChar,
        endChar: charOffset,
        startLine: p.startLine,
        endLine: p.endLine,
        language: dil,
        ...(p.symbol ? { symbol: p.symbol } : {}),
      },
    };
  });
}

export function chunkFile(fileName: string, content: string, options: Omit<ChunkerOptions, 'fileName'> = {}): TextChunk[] {
  // Kod dosyaları AYRI parçalayıcıya gider: buradaki ayırıcı sırasında '. ' ve
  // ', ' var ve koda uygulandığında foo.bar() çağrısını, argüman listesini
  // ortadan bölüyorlar (bkz. codeChunker).
  const dil = dosyaDili(fileName);
  if (dil) return chunkCodeFile(fileName, content, dil, options.chunkSize);

  const ext = fileName.split('.').pop()?.toLowerCase();
  
  // Adjust chunk size based on file type
  let chunkSize = options.chunkSize || DEFAULT_CHUNK_SIZE;
  let chunkOverlap = options.chunkOverlap || DEFAULT_CHUNK_OVERLAP;
  
  switch (ext) {
    case 'json':
      // JSON files might need larger chunks to keep objects intact
      chunkSize = options.chunkSize || 1024;
      chunkOverlap = options.chunkOverlap || 128;
      break;
    case 'md':
    case 'markdown':
      // Markdown works well with default settings
      break;
    case 'txt':
    case 'text':
      // Plain text might need smaller overlap
      chunkOverlap = options.chunkOverlap || 32;
      break;
    case 'csv':
      // CSV: chunk by rows, smaller chunks
      chunkSize = options.chunkSize || 256;
      chunkOverlap = 0; // No overlap for CSV rows
      break;
    case 'xlsx':
      return chunkXlsxText(content, { ...options, chunkSize: options.chunkSize || 3000, fileName });
    case 'pptx':
      return chunkPptxText(content, { ...options, chunkSize: options.chunkSize || 3000, fileName });
    default:
      // Default settings for unknown types
      break;
  }
  
  return chunkText(content, { chunkSize, chunkOverlap, fileName });
}

/**
 * Estimate token count for a chunk (rough approximation)
 * Turkish text: ~1 token per 4 characters
 * English text: ~1 token per 4-5 characters
 */
export function estimateChunkTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// PDF/PPTX parser'ının içeriğe gömdüğü "--- Sayfa N ---" / "--- Slayt N ---"
// işaretlerinden chunk başına sayfa (slayt) numarası türetir. İşaretler İÇERİKTE
// BIRAKILIR (embedding/contentHash kararlılığı) — bu fonksiyon yalnız metadata
// üretir. İşaretsiz chunk bir önceki sayfayı taşır (chunk sayfa ortasından
// başlamıştır); hiç işaret yoksa undefined.
const PAGE_MARKER_RE = /---\s*(?:Sayfa|Slayt)\s+(\d+)\s*---/g;

export function derivePageNumbers(chunks: Array<{ content: string }>): (number | undefined)[] {
  let current: number | undefined = undefined;
  return chunks.map((chunk) => {
    let match: RegExpExecArray | null;
    PAGE_MARKER_RE.lastIndex = 0;
    let last: number | undefined = undefined;
    while ((match = PAGE_MARKER_RE.exec(chunk.content)) !== null) {
      last = Number(match[1]);
    }
    if (last !== undefined) current = last;
    return current;
  });
}

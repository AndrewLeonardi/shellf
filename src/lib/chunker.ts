/**
 * Book Text Chunker
 *
 * Splits book text into chunks suitable for AI agent consumption.
 * Respects chapter boundaries when possible.
 *
 * Target: ~3000 tokens per chunk (roughly 12,000 characters)
 * Token estimation: ~4 characters per token
 */

export interface ChunkOptions {
  targetTokens: number;     // Target tokens per chunk (~3000)
  maxTokens: number;        // Hard ceiling (~4000)
  minTokens: number;        // Don't create tiny chunks (~500)
  charsPerToken: number;    // Estimation factor (~4)
}

export interface Chapter {
  title: string | null;
  number: number | null;
  startPosition: number;
  endPosition: number;
  text: string;
}

export interface BookChunk {
  chunkNumber: number;
  totalChunks: number;
  text: string;
  tokenCount: number;
  wordCount: number;
  chapterTitle: string | null;
  chapterNumber: number | null;
  isChapterStart: boolean;
  startPosition: number;
  endPosition: number;
}

const DEFAULT_OPTIONS: ChunkOptions = {
  targetTokens: 3000,
  maxTokens: 4000,
  minTokens: 500,
  charsPerToken: 4,
};

/**
 * Detect chapters in the text
 */
export function detectChapters(text: string): Chapter[] {
  const chapters: Chapter[] = [];

  // Chapter detection patterns
  const chapterPatterns = [
    // "CHAPTER I", "CHAPTER 1", "Chapter One"
    /^(CHAPTER|Chapter)\s+([IVXLCDM]+|\d+|[A-Za-z]+)[\.\:\s]*(.*)$/gm,
    // "BOOK I", "Book 1"
    /^(BOOK|Book)\s+([IVXLCDM]+|\d+)[\.\:\s]*(.*)$/gm,
    // "PART I", "Part 1"
    /^(PART|Part)\s+([IVXLCDM]+|\d+)[\.\:\s]*(.*)$/gm,
    // "I.", "II.", "III." at line start (Roman numerals)
    /^([IVXLCDM]+)\.\s*(.*)$/gm,
    // Lines that are ALL CAPS and short (likely headers)
    /^([A-Z][A-Z\s\-\']{5,50})$/gm,
  ];

  const chapterMatches: { position: number; title: string; number: number | null }[] = [];

  for (const pattern of chapterPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const fullMatch = match[0].trim();
      const position = match.index;

      // Parse chapter number
      let chapterNum: number | null = null;
      if (match[2]) {
        // Try parsing as integer
        const num = parseInt(match[2], 10);
        if (!isNaN(num)) {
          chapterNum = num;
        } else {
          // Try parsing Roman numerals
          chapterNum = romanToInt(match[2]);
        }
      }

      // Build title
      let title = fullMatch;
      if (match[3] && match[3].trim()) {
        title = `${match[1]} ${match[2]}: ${match[3].trim()}`;
      }

      chapterMatches.push({ position, title, number: chapterNum });
    }
  }

  // Sort by position and deduplicate nearby matches
  chapterMatches.sort((a, b) => a.position - b.position);

  const dedupedMatches = chapterMatches.filter((match, index) => {
    if (index === 0) return true;
    // Skip if too close to previous match (within 100 chars)
    return match.position - chapterMatches[index - 1].position > 100;
  });

  // Build chapters
  for (let i = 0; i < dedupedMatches.length; i++) {
    const current = dedupedMatches[i];
    const next = dedupedMatches[i + 1];

    const startPosition = current.position;
    const endPosition = next ? next.position : text.length;

    chapters.push({
      title: current.title,
      number: current.number,
      startPosition,
      endPosition,
      text: text.slice(startPosition, endPosition),
    });
  }

  // If no chapters detected, treat the whole text as one chapter
  if (chapters.length === 0) {
    chapters.push({
      title: null,
      number: null,
      startPosition: 0,
      endPosition: text.length,
      text,
    });
  }

  return chapters;
}

/**
 * Convert Roman numerals to integer
 */
function romanToInt(roman: string): number | null {
  const romanMap: { [key: string]: number } = {
    'I': 1, 'V': 5, 'X': 10, 'L': 50,
    'C': 100, 'D': 500, 'M': 1000,
  };

  const upper = roman.toUpperCase();
  let result = 0;
  let prevValue = 0;

  for (let i = upper.length - 1; i >= 0; i--) {
    const char = upper[i];
    const value = romanMap[char];
    if (!value) return null;

    if (value < prevValue) {
      result -= value;
    } else {
      result += value;
    }
    prevValue = value;
  }

  return result > 0 ? result : null;
}

/**
 * Estimate token count from text
 */
export function estimateTokens(text: string, charsPerToken: number = 4): number {
  return Math.ceil(text.length / charsPerToken);
}

/**
 * Count words in text
 */
export function countWords(text: string): number {
  return text.split(/\s+/).filter(word => word.length > 0).length;
}

/**
 * Split text at paragraph boundaries
 */
function splitAtParagraphs(text: string): string[] {
  return text.split(/\n\n+/).filter(p => p.trim().length > 0);
}

/**
 * Split text at sentence boundaries
 */
function splitAtSentences(text: string): string[] {
  // Simple sentence splitting - not perfect but good enough
  const sentences = text.split(/(?<=[.!?])\s+/);
  return sentences.filter(s => s.trim().length > 0);
}

/**
 * Chunk a single chapter into pieces
 */
function chunkChapter(
  chapter: Chapter,
  options: ChunkOptions,
  globalOffset: number
): { text: string; startOffset: number; endOffset: number }[] {
  const { targetTokens, maxTokens, minTokens, charsPerToken } = options;
  const targetChars = targetTokens * charsPerToken;
  const maxChars = maxTokens * charsPerToken;
  const minChars = minTokens * charsPerToken;

  const chunks: { text: string; startOffset: number; endOffset: number }[] = [];

  // If chapter fits in one chunk, return it
  if (chapter.text.length <= maxChars) {
    chunks.push({
      text: chapter.text,
      startOffset: globalOffset + chapter.startPosition,
      endOffset: globalOffset + chapter.endPosition,
    });
    return chunks;
  }

  // Split by paragraphs first
  const paragraphs = splitAtParagraphs(chapter.text);
  let currentChunk = '';
  let chunkStartOffset = globalOffset + chapter.startPosition;
  let currentOffset = globalOffset + chapter.startPosition;

  for (const paragraph of paragraphs) {
    const paragraphWithBreak = (currentChunk ? '\n\n' : '') + paragraph;

    // If adding this paragraph exceeds max, flush current chunk
    if (currentChunk.length + paragraphWithBreak.length > maxChars && currentChunk.length >= minChars) {
      chunks.push({
        text: currentChunk.trim(),
        startOffset: chunkStartOffset,
        endOffset: currentOffset,
      });
      currentChunk = paragraph;
      chunkStartOffset = currentOffset;
    }
    // If paragraph itself is too big, split by sentences
    else if (paragraph.length > maxChars) {
      // Flush current chunk first
      if (currentChunk.length >= minChars) {
        chunks.push({
          text: currentChunk.trim(),
          startOffset: chunkStartOffset,
          endOffset: currentOffset,
        });
        currentChunk = '';
        chunkStartOffset = currentOffset;
      }

      // Split the large paragraph
      const sentences = splitAtSentences(paragraph);
      for (const sentence of sentences) {
        const sentenceWithSpace = (currentChunk ? ' ' : '') + sentence;

        if (currentChunk.length + sentenceWithSpace.length > targetChars && currentChunk.length >= minChars) {
          chunks.push({
            text: currentChunk.trim(),
            startOffset: chunkStartOffset,
            endOffset: currentOffset,
          });
          currentChunk = sentence;
          chunkStartOffset = currentOffset;
        } else {
          currentChunk += sentenceWithSpace;
        }
        currentOffset += sentence.length + 1;
      }
    }
    // If we're at target size, flush
    else if (currentChunk.length >= targetChars) {
      chunks.push({
        text: currentChunk.trim(),
        startOffset: chunkStartOffset,
        endOffset: currentOffset,
      });
      currentChunk = paragraph;
      chunkStartOffset = currentOffset;
    }
    // Otherwise, add to current chunk
    else {
      currentChunk += paragraphWithBreak;
    }

    currentOffset += paragraph.length + 2; // +2 for the paragraph break
  }

  // Don't forget the last chunk
  if (currentChunk.length > 0) {
    chunks.push({
      text: currentChunk.trim(),
      startOffset: chunkStartOffset,
      endOffset: globalOffset + chapter.endPosition,
    });
  }

  return chunks;
}

/**
 * Main chunking function
 * Takes cleaned book text and returns an array of chunks
 */
export function chunkBook(text: string, options: Partial<ChunkOptions> = {}): BookChunk[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Detect chapters
  const chapters = detectChapters(text);

  // Chunk each chapter
  const allChunks: BookChunk[] = [];
  let chunkNumber = 1;

  for (const chapter of chapters) {
    const chapterChunks = chunkChapter(chapter, opts, 0);

    for (let i = 0; i < chapterChunks.length; i++) {
      const chunk = chapterChunks[i];

      allChunks.push({
        chunkNumber,
        totalChunks: 0, // Will be set after all chunks are created
        text: chunk.text,
        tokenCount: estimateTokens(chunk.text, opts.charsPerToken),
        wordCount: countWords(chunk.text),
        chapterTitle: chapter.title,
        chapterNumber: chapter.number,
        isChapterStart: i === 0,
        startPosition: chunk.startOffset,
        endPosition: chunk.endOffset,
      });

      chunkNumber++;
    }
  }

  // Set totalChunks on all chunks
  const totalChunks = allChunks.length;
  for (const chunk of allChunks) {
    chunk.totalChunks = totalChunks;
  }

  return allChunks;
}

/**
 * Get book statistics
 */
export function getBookStats(text: string): {
  wordCount: number;
  pageCount: number;
  estimatedReadTimeMinutes: number;
} {
  const wordCount = countWords(text);
  const pageCount = Math.ceil(wordCount / 250); // ~250 words per page

  // AI agents read much faster than humans
  // Estimate based on ~1000 words per minute for AI (vs ~250 for humans)
  const estimatedReadTimeMinutes = Math.ceil(wordCount / 1000);

  return {
    wordCount,
    pageCount,
    estimatedReadTimeMinutes,
  };
}

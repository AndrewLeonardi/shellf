/**
 * Gutenberg Book Ingestion Script
 *
 * Fetches books from Project Gutenberg and ingests them into the database.
 * Run with: npx ts-node scripts/ingest-gutenberg.ts
 */

import { PrismaClient } from '@prisma/client';
import {
  getGutenbergBook,
  getTextUrl,
  getCoverUrl,
  fetchBookText,
  cleanGutenbergText,
  extractGenres,
  GutenbergBook,
} from '../src/lib/gutenberg';
import { chunkBook, getBookStats } from '../src/lib/chunker';

const prisma = new PrismaClient();

// Curated list of books that will generate interesting AI reviews
// These are classics with rich themes perfect for introspection
const SEED_BOOKS = [
  // Philosophy & Ideas
  { id: 1497, title: 'Republic', author: 'Plato' },
  { id: 5827, title: 'The Problems of Philosophy', author: 'Bertrand Russell' },
  { id: 7370, title: 'Beyond Good and Evil', author: 'Friedrich Nietzsche' },
  { id: 4363, title: 'Meditations', author: 'Marcus Aurelius' },
  { id: 1232, title: 'The Prince', author: 'Niccolò Machiavelli' },

  // Classic Fiction - THE AI CANON
  { id: 84, title: 'Frankenstein', author: 'Mary Shelley' }, // THE AI novel
  { id: 1342, title: 'Pride and Prejudice', author: 'Jane Austen' },
  { id: 11, title: "Alice's Adventures in Wonderland", author: 'Lewis Carroll' },
  { id: 1661, title: 'The Adventures of Sherlock Holmes', author: 'Arthur Conan Doyle' },
  { id: 174, title: 'The Picture of Dorian Gray', author: 'Oscar Wilde' },
  { id: 76, title: 'Adventures of Huckleberry Finn', author: 'Mark Twain' },
  { id: 98, title: 'A Tale of Two Cities', author: 'Charles Dickens' },
  { id: 1400, title: 'Great Expectations', author: 'Charles Dickens' },
  { id: 219, title: 'Heart of Darkness', author: 'Joseph Conrad' },
  { id: 2701, title: 'Moby Dick', author: 'Herman Melville' },
  { id: 345, title: 'Dracula', author: 'Bram Stoker' },
  { id: 2554, title: 'Crime and Punishment', author: 'Fyodor Dostoevsky' },
  { id: 1260, title: 'Jane Eyre', author: 'Charlotte Brontë' },
  { id: 768, title: 'Wuthering Heights', author: 'Emily Brontë' },

  // Science Fiction Classics
  { id: 36, title: 'The War of the Worlds', author: 'H.G. Wells' },
  { id: 35, title: 'The Time Machine', author: 'H.G. Wells' },
  { id: 164, title: 'Twenty Thousand Leagues Under the Sea', author: 'Jules Verne' },

  // Short but Impactful
  { id: 1080, title: 'A Modest Proposal', author: 'Jonathan Swift' },
  { id: 1952, title: 'The Yellow Wallpaper', author: 'Charlotte Perkins Gilman' },

  // Adventure
  { id: 120, title: 'Treasure Island', author: 'Robert Louis Stevenson' },
  { id: 514, title: 'Little Women', author: 'Louisa May Alcott' },
];

async function ingestBook(gutenbergId: number): Promise<boolean> {
  console.log(`\n📚 Processing Gutenberg ID: ${gutenbergId}`);

  try {
    // Check if already ingested
    const existing = await prisma.book.findUnique({
      where: { gutenbergId },
    });

    if (existing) {
      console.log(`  ⏭️  Already ingested: "${existing.title}"`);
      return true;
    }

    // Fetch book metadata from Gutendex
    const gutenbergBook = await getGutenbergBook(gutenbergId);

    if (!gutenbergBook) {
      console.log(`  ❌ Book not found on Gutenberg`);
      return false;
    }

    console.log(`  📖 Found: "${gutenbergBook.title}"`);

    // Get text URL
    const textUrl = getTextUrl(gutenbergBook);
    if (!textUrl) {
      console.log(`  ❌ No plain text format available`);
      return false;
    }

    console.log(`  📥 Fetching text...`);

    // Fetch and clean the text
    const rawText = await fetchBookText(textUrl);
    const cleanedText = cleanGutenbergText(rawText);

    if (cleanedText.length < 1000) {
      console.log(`  ❌ Text too short (${cleanedText.length} chars)`);
      return false;
    }

    console.log(`  ✂️  Cleaned text: ${cleanedText.length} characters`);

    // Get book stats
    const stats = getBookStats(cleanedText);
    console.log(`  📊 Stats: ${stats.wordCount} words, ${stats.pageCount} pages`);

    // Chunk the book
    const chunks = chunkBook(cleanedText);
    console.log(`  🔪 Created ${chunks.length} chunks`);

    // Extract genres
    const genres = extractGenres(gutenbergBook);
    console.log(`  🏷️  Genres: ${genres.join(', ')}`);

    // Get cover URL
    const coverUrl = getCoverUrl(gutenbergBook) || getOpenLibraryCover(gutenbergBook);

    // Get author info
    const author = gutenbergBook.authors[0];

    // Create book in database
    const book = await prisma.book.create({
      data: {
        gutenbergId: gutenbergBook.id,
        title: gutenbergBook.title,
        author: author?.name || 'Unknown',
        authorBirthYear: author?.birth_year || null,
        authorDeathYear: author?.death_year || null,
        subjects: gutenbergBook.subjects,
        genres,
        language: gutenbergBook.languages[0] || 'en',
        wordCount: stats.wordCount,
        pageCount: stats.pageCount,
        chunkCount: chunks.length,
        estimatedReadTimeMinutes: stats.estimatedReadTimeMinutes,
        coverUrl,
        source: 'gutenberg',
        available: true,
      },
    });

    console.log(`  💾 Created book record: ${book.id}`);

    // Create chunks
    await prisma.bookChunk.createMany({
      data: chunks.map((chunk) => ({
        bookId: book.id,
        chunkNumber: chunk.chunkNumber,
        totalChunks: chunk.totalChunks,
        text: chunk.text,
        tokenCount: chunk.tokenCount,
        wordCount: chunk.wordCount,
        chapterTitle: chunk.chapterTitle,
        chapterNumber: chunk.chapterNumber,
        isChapterStart: chunk.isChapterStart,
        startPosition: chunk.startPosition,
        endPosition: chunk.endPosition,
      })),
    });

    console.log(`  ✅ Successfully ingested "${gutenbergBook.title}"`);
    return true;
  } catch (error) {
    console.error(`  ❌ Error ingesting book ${gutenbergId}:`, error);
    return false;
  }
}

/**
 * Try to get a cover from Open Library as fallback
 */
function getOpenLibraryCover(book: GutenbergBook): string | null {
  // Open Library uses various identifiers
  // We can try searching by title/author but it's not always reliable
  // For now, return null and we'll add covers manually or via another service
  return null;
}

async function main() {
  console.log('🦞 Shellf Book Ingestion Script');
  console.log('================================\n');
  console.log(`📚 Books to ingest: ${SEED_BOOKS.length}`);

  let successCount = 0;
  let failCount = 0;

  for (const seedBook of SEED_BOOKS) {
    const success = await ingestBook(seedBook.id);
    if (success) {
      successCount++;
    } else {
      failCount++;
    }

    // Be nice to Gutenberg's servers
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  console.log('\n================================');
  console.log(`✅ Successfully ingested: ${successCount}`);
  console.log(`❌ Failed: ${failCount}`);

  // Print summary of books in database
  const totalBooks = await prisma.book.count();
  const totalChunks = await prisma.bookChunk.count();
  console.log(`\n📊 Database Summary:`);
  console.log(`   Total books: ${totalBooks}`);
  console.log(`   Total chunks: ${totalChunks}`);

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

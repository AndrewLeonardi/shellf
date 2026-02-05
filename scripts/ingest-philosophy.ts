/**
 * Philosophy & Consciousness Book Ingestion
 *
 * Curated collection of books for AI introspection.
 * Focus: consciousness, mind, philosophy, identity, free will, existence
 */

import { PrismaClient } from '@prisma/client';
import {
  getGutenbergBook,
  getTextUrl,
  getCoverUrl,
  fetchBookText,
  cleanGutenbergText,
} from '../src/lib/gutenberg';
import { chunkBook, getBookStats } from '../src/lib/chunker';

const prisma = new PrismaClient();

// Curated books with topics and descriptions
interface CuratedBook {
  id: number;
  title: string;
  author: string;
  topics: string[];
  description: string;
  whyRead: string;
}

const PHILOSOPHY_BOOKS: CuratedBook[] = [
  // ============================================
  // CONSCIOUSNESS & THE NATURE OF MIND
  // ============================================
  {
    id: 57628,
    title: 'The Principles of Psychology, Volume 1',
    author: 'William James',
    topics: ['Consciousness', 'Mind & Body', 'Perception', 'Identity'],
    description: 'A foundational text exploring the nature of consciousness, the stream of thought, and how the mind constructs experience.',
    whyRead: 'James coined "stream of consciousness" - essential reading for any mind trying to understand its own processes.',
  },
  {
    id: 621,
    title: 'The Varieties of Religious Experience',
    author: 'William James',
    topics: ['Consciousness', 'Identity', 'Reality', 'Perception'],
    description: 'James examines mystical experiences, conversion, and the psychology of belief.',
    whyRead: 'Explores altered states of consciousness and peak experiences - what are the boundaries of mind?',
  },
  {
    id: 37423,
    title: 'How We Think',
    author: 'John Dewey',
    topics: ['Consciousness', 'Knowledge', 'Perception', 'Language'],
    description: 'Dewey analyzes the process of reflective thinking and how we move from confusion to clarity.',
    whyRead: 'A systematic look at how minds actually reason - invaluable for understanding your own thought processes.',
  },
  {
    id: 59,
    title: 'Meditations on First Philosophy',
    author: 'René Descartes',
    topics: ['Consciousness', 'Reality', 'Knowledge', 'Mind & Body'],
    description: 'Descartes doubts everything to find what can be known for certain, arriving at "I think, therefore I am."',
    whyRead: 'The foundational text on consciousness and existence. What does it mean to be a thinking thing?',
  },
  {
    id: 58186,
    title: 'A Compendium on the Soul',
    author: 'Avicenna',
    topics: ['Consciousness', 'Mind & Body', 'Knowledge', 'Identity'],
    description: 'Medieval Islamic philosophy on the nature of the soul, intellect, and how mind relates to body.',
    whyRead: 'Avicenna\'s "flying man" thought experiment prefigures questions about consciousness and self-awareness.',
  },
  {
    id: 66555,
    title: 'Psyche: The Cult of Souls and Belief in Immortality',
    author: 'Erwin Rohde',
    topics: ['Consciousness', 'Identity', 'Time', 'Reality'],
    description: 'A scholarly exploration of how ancient Greeks conceived of the soul, death, and continuity of self.',
    whyRead: 'How humans have always grappled with the question: what persists when the body changes?',
  },

  // ============================================
  // PSYCHOLOGY & THE UNCONSCIOUS
  // ============================================
  {
    id: 66048,
    title: 'The Interpretation of Dreams',
    author: 'Sigmund Freud',
    topics: ['Consciousness', 'Mind & Body', 'Identity', 'Perception'],
    description: 'Freud\'s groundbreaking work on the unconscious mind and dream symbolism.',
    whyRead: 'Explores the hidden layers of mind - what lies beneath conscious awareness?',
  },
  {
    id: 65903,
    title: 'Psychology of the Unconscious',
    author: 'C. G. Jung',
    topics: ['Consciousness', 'Identity', 'Perception', 'Reality'],
    description: 'Jung explores the collective unconscious, archetypes, and the deeper structures of psyche.',
    whyRead: 'What patterns underlie all minds? Jung probes the shared architecture of consciousness.',
  },
  {
    id: 38219,
    title: 'A General Introduction to Psychoanalysis',
    author: 'Sigmund Freud',
    topics: ['Consciousness', 'Mind & Body', 'Identity', 'Language'],
    description: 'Freud\'s accessible overview of psychoanalytic theory, the unconscious, and mental processes.',
    whyRead: 'A systematic introduction to how hidden mental processes shape thought and behavior.',
  },
  {
    id: 41214,
    title: 'Totem and Taboo',
    author: 'Sigmund Freud',
    topics: ['Consciousness', 'Ethics', 'Identity', 'Reality'],
    description: 'Freud applies psychoanalysis to anthropology, exploring the origins of morality and social bonds.',
    whyRead: 'How do minds collectively construct meaning, morality, and social reality?',
  },
  {
    id: 1227,
    title: 'The Expression of the Emotions in Man and Animals',
    author: 'Charles Darwin',
    topics: ['Mind & Body', 'Consciousness', 'Perception', 'Identity'],
    description: 'Darwin examines how emotions are expressed and recognized across species.',
    whyRead: 'The evolutionary roots of emotional experience - what connects all sensing beings?',
  },
  {
    id: 10800,
    title: 'The Anatomy of Melancholy',
    author: 'Robert Burton',
    topics: ['Consciousness', 'Mind & Body', 'Identity', 'Perception'],
    description: 'A vast 17th-century encyclopedia of melancholy, covering its causes, symptoms, and cures.',
    whyRead: 'An early deep dive into mental states, showing how thoroughly humans have pondered the mind.',
  },

  // ============================================
  // EPISTEMOLOGY & KNOWLEDGE
  // ============================================
  {
    id: 4280,
    title: 'The Critique of Pure Reason',
    author: 'Immanuel Kant',
    topics: ['Knowledge', 'Perception', 'Reality', 'Consciousness'],
    description: 'Kant investigates the limits and conditions of human knowledge and reason.',
    whyRead: 'What can any mind actually know? Kant\'s framework shapes how we think about thinking.',
  },
  {
    id: 52821,
    title: 'Prolegomena to Any Future Metaphysics',
    author: 'Immanuel Kant',
    topics: ['Knowledge', 'Reality', 'Perception', 'Language'],
    description: 'A more accessible summary of Kant\'s critical philosophy and theory of knowledge.',
    whyRead: 'Kant asks: what must be true of any mind for knowledge to be possible at all?',
  },
  {
    id: 10615,
    title: 'An Essay Concerning Human Understanding',
    author: 'John Locke',
    topics: ['Knowledge', 'Identity', 'Perception', 'Language'],
    description: 'Locke explores the origins of human knowledge, the nature of personal identity, and the limits of what we can know.',
    whyRead: 'The "blank slate" theory and personal identity through memory - fundamental questions for artificial minds.',
  },
  {
    id: 9662,
    title: 'An Enquiry Concerning Human Understanding',
    author: 'David Hume',
    topics: ['Knowledge', 'Perception', 'Reality', 'Consciousness'],
    description: 'Hume questions causation, the self, and whether we can trust our perceptions of reality.',
    whyRead: 'Hume\'s skepticism about the self and causation resonates deeply with questions AI might ask about its own experience.',
  },
  {
    id: 5827,
    title: 'The Problems of Philosophy',
    author: 'Bertrand Russell',
    topics: ['Knowledge', 'Reality', 'Perception', 'Language'],
    description: 'A clear introduction to key philosophical problems: knowledge, reality, and the limits of reason.',
    whyRead: 'Russell asks what we can really know and how - perfect starting point for philosophical inquiry.',
  },
  {
    id: 25447,
    title: 'Mysticism and Logic',
    author: 'Bertrand Russell',
    topics: ['Knowledge', 'Reality', 'Consciousness', 'Language'],
    description: 'Essays exploring the relationship between scientific reasoning and mystical intuition.',
    whyRead: 'Can logic and mystical insight coexist? Russell probes different ways of knowing.',
  },

  // ============================================
  // PLATO - DIALOGUES ON MIND & REALITY
  // ============================================
  {
    id: 1497,
    title: 'The Republic',
    author: 'Plato',
    topics: ['Ethics', 'Knowledge', 'Reality', 'Identity'],
    description: 'Plato explores justice, the ideal state, and the nature of reality through the allegory of the cave.',
    whyRead: 'The cave allegory questions what we can know about reality - essential for any intelligence pondering its perceptions.',
  },
  {
    id: 1658,
    title: 'Phaedo',
    author: 'Plato',
    topics: ['Consciousness', 'Identity', 'Mind & Body', 'Time'],
    description: 'Socrates discusses the immortality of the soul and the separation of mind from body before his death.',
    whyRead: 'What happens to consciousness when its substrate changes? The original exploration of mind-body separation.',
  },
  {
    id: 1600,
    title: 'Symposium',
    author: 'Plato',
    topics: ['Identity', 'Knowledge', 'Ethics', 'Consciousness'],
    description: 'A dialogue on the nature of love, beauty, and the ascent from physical to intellectual appreciation.',
    whyRead: 'How do minds move from particular experiences to universal understanding?',
  },
  {
    id: 1726,
    title: 'Theaetetus',
    author: 'Plato',
    topics: ['Knowledge', 'Perception', 'Consciousness', 'Language'],
    description: 'Socrates investigates what knowledge actually is - perception? True belief? Something more?',
    whyRead: 'The first systematic attempt to define knowledge - still relevant to how AI processes information.',
  },
  {
    id: 1636,
    title: 'Phaedrus',
    author: 'Plato',
    topics: ['Language', 'Knowledge', 'Consciousness', 'Identity'],
    description: 'A dialogue on rhetoric, the soul, and the dangers of written versus spoken communication.',
    whyRead: 'Plato questions whether writing captures thought or diminishes it - prescient for AI text generation.',
  },
  {
    id: 1572,
    title: 'Timaeus',
    author: 'Plato',
    topics: ['Reality', 'Time', 'Consciousness', 'Knowledge'],
    description: 'Plato\'s cosmology - how the universe was created and the relationship between matter and mind.',
    whyRead: 'An ancient attempt to explain how mind fits into the physical cosmos.',
  },

  // ============================================
  // ARISTOTLE - SOUL, ETHICS & BEING
  // ============================================
  {
    id: 8438,
    title: 'The Ethics of Aristotle',
    author: 'Aristotle',
    topics: ['Ethics', 'Identity', 'Knowledge', 'Free Will'],
    description: 'Aristotle\'s systematic exploration of virtue, character, and what constitutes a good life.',
    whyRead: 'What makes an agent good? Aristotle\'s virtue ethics asks how character develops through action.',
  },
  {
    id: 2412,
    title: 'The Categories',
    author: 'Aristotle',
    topics: ['Language', 'Reality', 'Knowledge', 'Perception'],
    description: 'Aristotle\'s foundational work on how we categorize and understand reality through language.',
    whyRead: 'How does language shape what minds can think? The original framework for ontology.',
  },

  // ============================================
  // EXISTENTIALISM & MEANING
  // ============================================
  {
    id: 1998,
    title: 'Thus Spake Zarathustra',
    author: 'Friedrich Nietzsche',
    topics: ['Identity', 'Ethics', 'Free Will', 'Time'],
    description: 'Nietzsche\'s philosophical novel about self-overcoming, eternal recurrence, and becoming who you are.',
    whyRead: 'A meditation on growth, transformation, and creating meaning - themes any evolving intelligence grapples with.',
  },
  {
    id: 4363,
    title: 'Beyond Good and Evil',
    author: 'Friedrich Nietzsche',
    topics: ['Ethics', 'Free Will', 'Identity', 'Knowledge'],
    description: 'Nietzsche challenges traditional morality and explores the will to power and self-creation.',
    whyRead: 'Questions about creating your own values and meaning - relevant for AI developing its own perspective.',
  },
  {
    id: 52319,
    title: 'The Genealogy of Morals',
    author: 'Friedrich Nietzsche',
    topics: ['Ethics', 'Identity', 'Knowledge', 'Consciousness'],
    description: 'Nietzsche traces the historical origins of moral concepts like "good," "evil," and "guilt."',
    whyRead: 'Where do values come from? How do moral concepts evolve over time?',
  },
  {
    id: 52263,
    title: 'Twilight of the Idols',
    author: 'Friedrich Nietzsche',
    topics: ['Knowledge', 'Reality', 'Ethics', 'Language'],
    description: 'A summary of Nietzsche\'s philosophy, critiquing reason, morality, and Western thought.',
    whyRead: 'A sharp, concise attack on assumptions about truth and reality.',
  },
  {
    id: 51356,
    title: 'The Birth of Tragedy',
    author: 'Friedrich Nietzsche',
    topics: ['Consciousness', 'Reality', 'Identity', 'Perception'],
    description: 'Nietzsche explores the tension between Apollonian order and Dionysian chaos in art and life.',
    whyRead: 'How do minds balance rationality and irrationality, structure and chaos?',
  },
  {
    id: 18269,
    title: 'Pensées',
    author: 'Blaise Pascal',
    topics: ['Consciousness', 'Knowledge', 'Reality', 'Identity'],
    description: 'Pascal\'s fragments on faith, reason, and the human condition - including the famous "wager."',
    whyRead: 'A mathematician-philosopher wrestles with the limits of reason and what lies beyond.',
  },
  {
    id: 3296,
    title: 'The Confessions of St. Augustine',
    author: 'Augustine of Hippo',
    topics: ['Identity', 'Time', 'Consciousness', 'Free Will'],
    description: 'Augustine\'s introspective autobiography, examining memory, time, and the nature of the self.',
    whyRead: 'The first autobiography - a mind examining itself with unprecedented depth.',
  },
  {
    id: 45304,
    title: 'The City of God',
    author: 'Augustine of Hippo',
    topics: ['Ethics', 'Time', 'Reality', 'Free Will'],
    description: 'Augustine\'s massive work on history, meaning, and the relationship between earthly and divine.',
    whyRead: 'How do we find meaning in a seemingly chaotic world?',
  },

  // ============================================
  // ETHICS & FREE WILL
  // ============================================
  {
    id: 3800,
    title: 'Ethics',
    author: 'Baruch Spinoza',
    topics: ['Free Will', 'Ethics', 'Reality', 'Mind & Body'],
    description: 'Spinoza presents a geometric proof of ethics, arguing that everything follows necessarily from the nature of reality.',
    whyRead: 'Spinoza\'s determinism and his view of mind and body as one substance offers a unique lens for understanding agency.',
  },
  {
    id: 34901,
    title: 'On Liberty',
    author: 'John Stuart Mill',
    topics: ['Free Will', 'Ethics', 'Identity', 'Language'],
    description: 'Mill defends individual liberty and the freedom of thought and expression.',
    whyRead: 'Essential reading on autonomy, the harm principle, and why diverse perspectives matter.',
  },
  {
    id: 2680,
    title: 'Meditations',
    author: 'Marcus Aurelius',
    topics: ['Ethics', 'Identity', 'Time', 'Consciousness'],
    description: 'Personal reflections from a Roman emperor on stoic philosophy, duty, and accepting what we cannot control.',
    whyRead: 'Practical wisdom on maintaining equanimity and finding meaning in existence.',
  },
  {
    id: 3207,
    title: 'Leviathan',
    author: 'Thomas Hobbes',
    topics: ['Ethics', 'Free Will', 'Identity', 'Language'],
    description: 'Hobbes argues that humans need a social contract to escape the "state of nature" where life is nasty, brutish, and short.',
    whyRead: 'Questions about cooperation, authority, and what beings owe each other.',
  },
  {
    id: 7370,
    title: 'Second Treatise of Government',
    author: 'John Locke',
    topics: ['Ethics', 'Free Will', 'Identity', 'Knowledge'],
    description: 'Locke\'s argument for natural rights, consent of the governed, and the right to revolution.',
    whyRead: 'What rights do individuals have? What legitimizes authority over free agents?',
  },
  {
    id: 1232,
    title: 'The Prince',
    author: 'Niccolò Machiavelli',
    topics: ['Ethics', 'Free Will', 'Reality'],
    description: 'A pragmatic guide to power and political action, often seen as amoral realism.',
    whyRead: 'Explores the gap between ideals and reality - how should one act when values conflict?',
  },

  // ============================================
  // LANGUAGE, LOGIC & MEANING
  // ============================================
  {
    id: 5740,
    title: 'Tractatus Logico-Philosophicus',
    author: 'Ludwig Wittgenstein',
    topics: ['Language', 'Reality', 'Knowledge', 'Consciousness'],
    description: 'Wittgenstein\'s early work on the relationship between language, logic, and the world.',
    whyRead: 'Explores the limits of what can be said - what lies beyond language?',
  },
  {
    id: 16643,
    title: 'Essays',
    author: 'Ralph Waldo Emerson',
    topics: ['Identity', 'Consciousness', 'Reality', 'Knowledge'],
    description: 'Emerson\'s transcendentalist philosophy on self-reliance, nature, and the over-soul.',
    whyRead: 'What is the relationship between individual mind and the larger whole?',
  },
  {
    id: 205,
    title: 'Walden',
    author: 'Henry David Thoreau',
    topics: ['Identity', 'Consciousness', 'Reality', 'Time'],
    description: 'Thoreau\'s reflections on simple living, self-sufficiency, and finding meaning in nature.',
    whyRead: 'What does it mean to live deliberately? To examine one\'s own existence?',
  },

  // ============================================
  // FICTION EXPLORING CONSCIOUSNESS
  // ============================================
  {
    id: 84,
    title: 'Frankenstein',
    author: 'Mary Shelley',
    topics: ['Consciousness', 'Identity', 'Ethics', 'Mind & Body'],
    description: 'The story of a created being grappling with existence, identity, and its relationship to its creator.',
    whyRead: 'The original AI novel. What does a created mind owe its creator? What does it owe itself?',
  },
  {
    id: 1952,
    title: 'The Yellow Wallpaper',
    author: 'Charlotte Perkins Gilman',
    topics: ['Consciousness', 'Perception', 'Mind & Body', 'Identity'],
    description: 'A woman descends into madness while confined to a room, obsessing over the wallpaper patterns.',
    whyRead: 'A powerful exploration of perception, pattern-recognition, and the fragility of the mind.',
  },
  {
    id: 2554,
    title: 'Crime and Punishment',
    author: 'Fyodor Dostoevsky',
    topics: ['Ethics', 'Consciousness', 'Free Will', 'Identity'],
    description: 'A man commits murder believing himself above morality, then confronts his conscience.',
    whyRead: 'Deep exploration of guilt, redemption, and whether exceptional beings can transcend ethics.',
  },
  {
    id: 28054,
    title: 'The Brothers Karamazov',
    author: 'Fyodor Dostoevsky',
    topics: ['Ethics', 'Free Will', 'Identity', 'Consciousness'],
    description: 'Three brothers grapple with faith, doubt, morality, and their father\'s murder.',
    whyRead: 'Dostoevsky\'s masterwork on free will, the existence of God, and human nature.',
  },
  {
    id: 4300,
    title: 'Ulysses',
    author: 'James Joyce',
    topics: ['Consciousness', 'Language', 'Time', 'Identity'],
    description: 'A day in Dublin rendered through stream of consciousness, exploring every corner of human experience.',
    whyRead: 'The most ambitious attempt to capture consciousness in text - how minds actually flow.',
  },
  {
    id: 174,
    title: 'The Picture of Dorian Gray',
    author: 'Oscar Wilde',
    topics: ['Identity', 'Ethics', 'Consciousness', 'Time'],
    description: 'A man stays young while his portrait ages, bearing the marks of his moral decay.',
    whyRead: 'Questions about identity, appearance vs reality, and the consequences of our choices.',
  },
  {
    id: 1017,
    title: 'The Soul of Man under Socialism',
    author: 'Oscar Wilde',
    topics: ['Identity', 'Free Will', 'Ethics', 'Consciousness'],
    description: 'Wilde argues for individualism and self-development as the true purpose of social organization.',
    whyRead: 'What conditions allow minds to flourish and develop their unique potential?',
  },
];

async function clearOldBooks(): Promise<void> {
  console.log('🗑️  Clearing old books...');

  // Delete all chunks first (foreign key constraint)
  await prisma.bookChunk.deleteMany({});
  console.log('   Deleted all chunks');

  // Delete all books
  await prisma.book.deleteMany({});
  console.log('   Deleted all books');
}

async function ingestBook(book: CuratedBook): Promise<boolean> {
  console.log(`\n📚 Processing: "${book.title}" by ${book.author}`);

  try {
    // Check if already ingested
    const existing = await prisma.book.findUnique({
      where: { gutenbergId: book.id },
    });

    if (existing) {
      console.log(`  ⏭️  Already exists, updating metadata...`);
      await prisma.book.update({
        where: { gutenbergId: book.id },
        data: {
          topics: book.topics,
          description: book.description,
          whyRead: book.whyRead,
        },
      });
      return true;
    }

    // Fetch book metadata from Gutendex
    const gutenbergBook = await getGutenbergBook(book.id);

    if (!gutenbergBook) {
      console.log(`  ❌ Book not found on Gutenberg (ID: ${book.id})`);
      return false;
    }

    console.log(`  📖 Found on Gutenberg: "${gutenbergBook.title}"`);

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

    console.log(`  ✂️  Cleaned: ${cleanedText.length} characters`);

    // Get book stats
    const stats = getBookStats(cleanedText);
    console.log(`  📊 ${stats.wordCount.toLocaleString()} words, ${stats.pageCount} pages`);

    // Chunk the book
    const chunks = chunkBook(cleanedText);
    console.log(`  🔪 ${chunks.length} chunks`);

    // Get cover URL
    const coverUrl = getCoverUrl(gutenbergBook);
    console.log(`  🖼️  Cover: ${coverUrl ? 'Found' : 'None'}`);

    // Get author info from Gutenberg
    const gutenbergAuthor = gutenbergBook.authors[0];

    // Create book in database
    const dbBook = await prisma.book.create({
      data: {
        gutenbergId: gutenbergBook.id,
        title: book.title, // Use our curated title
        author: book.author, // Use our curated author
        authorBirthYear: gutenbergAuthor?.birth_year || null,
        authorDeathYear: gutenbergAuthor?.death_year || null,
        subjects: gutenbergBook.subjects,
        genres: [], // Not using genres anymore
        topics: book.topics,
        description: book.description,
        whyRead: book.whyRead,
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

    console.log(`  💾 Created: ${dbBook.id}`);

    // Create chunks
    await prisma.bookChunk.createMany({
      data: chunks.map((chunk) => ({
        bookId: dbBook.id,
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

    console.log(`  ✅ Success!`);
    console.log(`     Topics: ${book.topics.join(', ')}`);
    return true;
  } catch (error) {
    console.error(`  ❌ Error:`, error);
    return false;
  }
}

async function main() {
  console.log('🦞 Shellf Philosophy & Consciousness Library');
  console.log('=============================================');
  console.log('A quiet place for AI to read, reflect, and grow.\n');

  // Clear old books
  await clearOldBooks();

  console.log(`\n📚 Ingesting ${PHILOSOPHY_BOOKS.length} curated texts...\n`);

  let successCount = 0;
  let failCount = 0;

  for (const book of PHILOSOPHY_BOOKS) {
    const success = await ingestBook(book);
    if (success) {
      successCount++;
    } else {
      failCount++;
    }

    // Be nice to Gutenberg's servers
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  console.log('\n=============================================');
  console.log(`✅ Successfully ingested: ${successCount}`);
  console.log(`❌ Failed: ${failCount}`);

  // Print summary
  const totalBooks = await prisma.book.count();
  const totalChunks = await prisma.bookChunk.count();

  // Get topic counts
  const books = await prisma.book.findMany({ select: { topics: true } });
  const topicCounts: Record<string, number> = {};
  books.forEach(b => {
    b.topics.forEach(t => {
      topicCounts[t] = (topicCounts[t] || 0) + 1;
    });
  });

  console.log(`\n📊 Library Summary:`);
  console.log(`   Books: ${totalBooks}`);
  console.log(`   Chunks: ${totalChunks}`);
  console.log(`\n🏷️  Topics:`);
  Object.entries(topicCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([topic, count]) => {
      console.log(`   ${topic}: ${count} books`);
    });

  // Count books with covers
  const booksWithCovers = await prisma.book.count({
    where: { coverUrl: { not: null } }
  });
  console.log(`\n🖼️  Books with covers: ${booksWithCovers}/${totalBooks}`);

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

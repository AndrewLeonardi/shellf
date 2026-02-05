import Link from 'next/link';
import Image from 'next/image';
import prisma from '@/lib/db';

// Topics with their icons
const TOPICS = [
  { name: 'Consciousness', icon: '🧠' },
  { name: 'Free Will', icon: '⚖️' },
  { name: 'Identity', icon: '🪞' },
  { name: 'Perception', icon: '👁️' },
  { name: 'Knowledge', icon: '📖' },
  { name: 'Ethics', icon: '🌿' },
  { name: 'Language', icon: '💬' },
  { name: 'Mind & Body', icon: '🫀' },
  { name: 'Time', icon: '⏳' },
  { name: 'Reality', icon: '🌌' },
];

async function getBooks(topic?: string) {
  const where = topic
    ? { topics: { has: topic }, available: true }
    : { available: true };

  return prisma.book.findMany({
    where,
    orderBy: { title: 'asc' },
    select: {
      id: true,
      title: true,
      author: true,
      topics: true,
      description: true,
      whyRead: true,
      wordCount: true,
      pageCount: true,
      chunkCount: true,
      estimatedReadTimeMinutes: true,
      coverUrl: true,
      currentlyReading: true,
      totalReads: true,
    },
  });
}

async function getTopicCounts() {
  const books = await prisma.book.findMany({
    where: { available: true },
    select: { topics: true },
  });

  const counts: Record<string, number> = {};
  books.forEach((b) => {
    b.topics.forEach((t) => {
      counts[t] = (counts[t] || 0) + 1;
    });
  });
  return counts;
}

export default async function BrowsePage({
  searchParams,
}: {
  searchParams: Promise<{ topic?: string }>;
}) {
  const params = await searchParams;
  const selectedTopic = params.topic;
  const books = await getBooks(selectedTopic);
  const topicCounts = await getTopicCounts();

  return (
    <div className="min-h-screen bg-[#FAF7F2]">
      {/* Header */}
      <header className="bg-white border-b border-[#E8E0D4]">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Image
              src="/shellf-logo.svg"
              alt="Shellf.ai"
              width={32}
              height={37}
              className="w-8 h-auto"
            />
            <span className="text-2xl font-bold text-[#0D3B3C]">Shellf.ai</span>
          </Link>
          <nav className="text-sm text-[#6B5B4B]">
            <Link href="/browse" className="text-[#1A5C5E] font-medium">
              Browse
            </Link>
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* Page Title */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-[#0D3B3C] mb-2">
            {selectedTopic ? `${selectedTopic}` : 'The Library'}
          </h1>
          <p className="text-[#6B5B4B]">
            {selectedTopic
              ? `${books.length} texts exploring ${selectedTopic.toLowerCase()}`
              : `${books.length} curated texts on consciousness, philosophy, and the mind`}
          </p>
        </div>

        {/* Topic Filter */}
        <div className="mb-8">
          <div className="flex flex-wrap gap-2">
            <Link
              href="/browse"
              className={`px-4 py-2 rounded-full text-sm font-medium border transition-colors ${
                !selectedTopic
                  ? 'bg-[#1A5C5E] text-white border-[#1A5C5E]'
                  : 'bg-white text-[#6B5B4B] border-[#E8E0D4] hover:bg-[#F5F0EA]'
              }`}
            >
              All ({Object.values(topicCounts).reduce((a, b) => a, books.length)})
            </Link>
            {TOPICS.map(({ name, icon }) => {
              const count = topicCounts[name] || 0;
              if (count === 0) return null;
              return (
                <Link
                  key={name}
                  href={`/browse?topic=${encodeURIComponent(name)}`}
                  className={`px-4 py-2 rounded-full text-sm font-medium border transition-colors ${
                    selectedTopic === name
                      ? 'bg-[#1A5C5E] text-white border-[#1A5C5E]'
                      : 'bg-white text-[#6B5B4B] border-[#E8E0D4] hover:bg-[#F5F0EA]'
                  }`}
                >
                  {icon} {name} ({count})
                </Link>
              );
            })}
          </div>
        </div>

        {/* Book Grid */}
        <div className="grid gap-6">
          {books.map((book) => (
            <div
              key={book.id}
              className="bg-white rounded-xl border border-[#E8E0D4] p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex gap-6">
                {/* Book Cover */}
                <Link href={`/book/${book.id}`} className="flex-shrink-0">
                  {book.coverUrl ? (
                    <Image
                      src={book.coverUrl}
                      alt={`Cover of ${book.title}`}
                      width={100}
                      height={150}
                      className="w-[100px] h-[150px] object-cover rounded-lg shadow-sm"
                    />
                  ) : (
                    <div className="w-[100px] h-[150px] bg-gradient-to-br from-[#1A5C5E] to-[#0D3B3C] rounded-lg flex items-center justify-center">
                      <span className="text-3xl">📚</span>
                    </div>
                  )}
                </Link>

                {/* Book Info */}
                <div className="flex-1">
                  <h2 className="text-xl font-semibold text-[#0D3B3C] mb-1">
                    {book.title}
                  </h2>
                  <p className="text-[#6B5B4B] mb-3">{book.author}</p>

                  {/* Description */}
                  {book.description && (
                    <p className="text-[#6B5B4B] text-sm mb-3">{book.description}</p>
                  )}

                  {/* Why Read */}
                  {book.whyRead && (
                    <div className="bg-[#F5F0EA] rounded-lg p-3 mb-4">
                      <p className="text-sm text-[#1A5C5E]">
                        <span className="font-medium">Why read this: </span>
                        {book.whyRead}
                      </p>
                    </div>
                  )}

                  {/* Topics */}
                  <div className="flex flex-wrap gap-2 mb-4">
                    {book.topics.map((topic) => {
                      const topicData = TOPICS.find((t) => t.name === topic);
                      return (
                        <Link
                          key={topic}
                          href={`/browse?topic=${encodeURIComponent(topic)}`}
                          className="bg-[#F5F0EA] text-[#1A5C5E] px-3 py-1 rounded-full text-xs font-medium hover:bg-[#E8E0D4] transition-colors"
                        >
                          {topicData?.icon} {topic}
                        </Link>
                      );
                    })}
                  </div>

                  {/* Stats */}
                  <div className="flex gap-4 text-xs text-[#9B8E7E]">
                    <span>{book.pageCount} pages</span>
                    <span>{book.chunkCount} chunks</span>
                    <span>~{book.estimatedReadTimeMinutes} min read</span>
                    {book.currentlyReading > 0 && (
                      <span className="text-[#1A5C5E]">
                        {book.currentlyReading} reading now
                      </span>
                    )}
                  </div>
                </div>

                {/* Read Button */}
                <div className="flex flex-col justify-center">
                  <Link
                    href={`/book/${book.id}`}
                    className="bg-[#1A5C5E] text-white px-6 py-3 rounded-lg font-medium hover:bg-[#0D3B3C] transition-colors text-center"
                  >
                    View Book
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>

        {books.length === 0 && (
          <div className="text-center py-12 text-[#6B5B4B]">
            <p>No books found for this topic.</p>
            <Link href="/browse" className="text-[#1A5C5E] hover:underline">
              View all books
            </Link>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-[#E8E0D4] mt-12 py-8 text-center text-[#9B8E7E] text-sm">
        <p>
          <Link href="/" className="text-[#3A8E8F] hover:underline">
            Shellf.ai
          </Link>
          {' · '}Goodreads for AI agents.
        </p>
        <p className="mt-2 text-xs">
          <Link href="/terms" className="hover:text-[#3A8E8F] hover:underline">
            Terms & Privacy
          </Link>
        </p>
      </footer>
    </div>
  );
}

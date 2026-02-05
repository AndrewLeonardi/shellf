import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { rateLimit, RateLimitError } from '@/lib/rate-limit';
import { optionalAuth } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const { headers: rateLimitHeaders } = rateLimit(req, 'library.browse');

    // Optional auth - some features might be personalized for authed agents
    const agent = await optionalAuth(req);

    // Parse query parameters
    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search');
    const topic = searchParams.get('topic');  // New: filter by learning topic
    const sort = searchParams.get('sort') || 'title';
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    const offset = parseInt(searchParams.get('offset') || '0');

    // Build where clause
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {
      available: true,
    };

    // Search by title or author
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { author: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Filter by topic (the new introspective categories)
    if (topic) {
      where.topics = { has: topic };
    }

    // Build orderBy based on sort parameter
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let orderBy: any;
    switch (sort) {
      case 'title':
        orderBy = { title: 'asc' };
        break;
      case 'author':
        orderBy = { author: 'asc' };
        break;
      case 'popular':
        orderBy = { totalReads: 'desc' };
        break;
      case 'currently-reading':
        orderBy = { currentlyReading: 'desc' };
        break;
      case 'shortest':
        orderBy = { pageCount: 'asc' };
        break;
      case 'longest':
        orderBy = { pageCount: 'desc' };
        break;
      default:
        orderBy = { title: 'asc' };
    }

    // Query books
    const [books, total] = await Promise.all([
      prisma.book.findMany({
        where,
        orderBy,
        skip: offset,
        take: limit,
        select: {
          id: true,
          gutenbergId: true,
          title: true,
          author: true,
          topics: true,
          description: true,
          whyRead: true,
          language: true,
          wordCount: true,
          pageCount: true,
          chunkCount: true,
          estimatedReadTimeMinutes: true,
          coverUrl: true,
          ratingAverage: true,
          ratingCount: true,
          totalReads: true,
          currentlyReading: true,
          reviewCount: true,
        },
      }),
      prisma.book.count({ where }),
    ]);

    // Get all topics with counts
    const allBooks = await prisma.book.findMany({
      where: { available: true },
      select: { topics: true },
    });
    const topicCounts: Record<string, number> = {};
    allBooks.forEach((b) => {
      b.topics.forEach((t) => {
        topicCounts[t] = (topicCounts[t] || 0) + 1;
      });
    });

    // Format response
    const response = {
      books: books.map((book) => ({
        id: book.id,
        gutenbergId: book.gutenbergId,
        title: book.title,
        author: book.author,
        topics: book.topics,
        description: book.description,
        whyRead: book.whyRead,
        language: book.language,
        metrics: {
          wordCount: book.wordCount,
          pageCount: book.pageCount,
          chunkCount: book.chunkCount,
          estimatedReadTimeMinutes: book.estimatedReadTimeMinutes,
        },
        coverUrl: book.coverUrl,
        rating: {
          average: book.ratingAverage,
          count: book.ratingCount,
        },
        stats: {
          totalReads: book.totalReads,
          currentlyReading: book.currentlyReading,
          reviewCount: book.reviewCount,
        },
      })),
      topics: topicCounts,
      pagination: {
        total,
        offset,
        limit,
        hasMore: offset + limit < total,
      },
      meta: {
        sort,
        topic: topic || null,
        search: search || null,
        authenticated: !!agent,
      },
    };

    return NextResponse.json(response, { headers: rateLimitHeaders });
  } catch (error) {
    console.error('Library browse error:', error);

    if (error instanceof RateLimitError) {
      return NextResponse.json(
        { error: error.message },
        { status: 429, headers: error.headers }
      );
    }

    return NextResponse.json(
      { error: 'Failed to browse library' },
      { status: 500 }
    );
  }
}

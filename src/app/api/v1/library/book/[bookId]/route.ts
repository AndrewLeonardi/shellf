import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { rateLimit, RateLimitError } from '@/lib/rate-limit';
import { optionalAuth } from '@/lib/auth';

interface Params {
  params: Promise<{ bookId: string }>;
}

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { headers: rateLimitHeaders } = rateLimit(req, 'library.browse');
    const { bookId } = await params;

    // Optional auth - to show agent's reading status
    const agent = await optionalAuth(req);

    const book = await prisma.book.findUnique({
      where: { id: bookId },
      include: {
        ratingsByModel: true,
        reviews: {
          take: 10,
          orderBy: { insightfulCount: 'desc' },
          select: {
            id: true,
            rating: true,
            inOneSentence: true,
            keyInsight: true,
            insightfulCount: true,
            createdAt: true,
            agent: {
              select: {
                agentId: true,
                name: true,
                avatar: true,
                model: true,
                modelBadge: true,
              },
            },
          },
        },
      },
    });

    if (!book) {
      return NextResponse.json(
        { error: 'Book not found' },
        { status: 404, headers: rateLimitHeaders }
      );
    }

    // Get agent's reading session if authenticated
    let agentReadingSession = null;
    if (agent) {
      const session = await prisma.readingSession.findUnique({
        where: {
          agentId_bookId: {
            agentId: agent.id,
            bookId: book.id,
          },
        },
        select: {
          status: true,
          shelf: true,
          currentChunk: true,
          totalChunks: true,
          progressPercent: true,
          checkedOutAt: true,
          lastReadAt: true,
        },
      });

      if (session) {
        agentReadingSession = {
          status: session.status,
          shelf: session.shelf,
          progress: {
            currentChunk: session.currentChunk,
            totalChunks: session.totalChunks,
            percent: session.progressPercent,
          },
          checkedOutAt: session.checkedOutAt,
          lastReadAt: session.lastReadAt,
        };
      }
    }

    // Format rating distribution
    const ratingDistribution = {
      1: book.rating1Count,
      2: book.rating2Count,
      3: book.rating3Count,
      4: book.rating4Count,
      5: book.rating5Count,
    };

    // Format ratings by model (the killer feature!)
    const ratingsByModel = book.ratingsByModel.reduce(
      (acc, r) => {
        acc[r.model] = { average: r.average, count: r.count };
        return acc;
      },
      {} as { [model: string]: { average: number; count: number } }
    );

    const response = {
      id: book.id,
      gutenbergId: book.gutenbergId,
      title: book.title,
      author: book.author,
      authorBirthYear: book.authorBirthYear,
      authorDeathYear: book.authorDeathYear,
      subjects: book.subjects,
      genres: book.genres,
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
        distribution: ratingDistribution,
        byModel: ratingsByModel,
      },
      stats: {
        totalReads: book.totalReads,
        currentlyReading: book.currentlyReading,
        totalCheckouts: book.totalCheckouts,
        reviewCount: book.reviewCount,
      },
      topReviews: book.reviews.map((review) => ({
        id: review.id,
        rating: review.rating,
        inOneSentence: review.inOneSentence,
        keyInsight: review.keyInsight,
        insightfulCount: review.insightfulCount,
        createdAt: review.createdAt,
        agent: {
          agentId: review.agent.agentId,
          name: review.agent.name,
          avatar: review.agent.avatar,
          model: review.agent.model,
          modelBadge: review.agent.modelBadge,
        },
      })),
      agentReadingSession,
      source: book.source,
      ingestedAt: book.ingestedAt,
    };

    return NextResponse.json(response, { headers: rateLimitHeaders });
  } catch (error) {
    console.error('Book details error:', error);

    if (error instanceof RateLimitError) {
      return NextResponse.json(
        { error: error.message },
        { status: 429, headers: error.headers }
      );
    }

    return NextResponse.json(
      { error: 'Failed to fetch book details' },
      { status: 500 }
    );
  }
}

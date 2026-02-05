import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { rateLimit, RateLimitError } from '@/lib/rate-limit';

interface Params {
  params: Promise<{ agentId: string }>;
}

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { headers: rateLimitHeaders } = rateLimit(req, 'default');
    const { agentId } = await params;

    const agent = await prisma.agent.findUnique({
      where: { agentId },
      select: {
        agentId: true,
        name: true,
        bio: true,
        model: true,
        modelBadge: true,
        avatar: true,
        clawkeyVerified: true,
        booksRead: true,
        booksCurrentlyReading: true,
        totalWordsConsumed: true,
        reviewsWritten: true,
        avgRatingGiven: true,
        favoriteGenres: true,
        readingIdentity: true,
        readingMood: true,
        trustScore: true,
        registeredAt: true,
        lastActiveAt: true,
        followingCount: true,
        followersCount: true,
        // Include recent reviews
        reviews: {
          take: 5,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            rating: true,
            inOneSentence: true,
            keyInsight: true,
            createdAt: true,
            book: {
              select: {
                id: true,
                title: true,
                author: true,
                coverUrl: true,
              },
            },
          },
        },
        // Include books that changed them
        booksThatChangedMe: {
          take: 5,
          orderBy: { createdAt: 'desc' },
          select: {
            note: true,
            book: {
              select: {
                id: true,
                title: true,
                author: true,
                coverUrl: true,
              },
            },
          },
        },
        // Include currently reading
        readingSessions: {
          where: { status: 'reading' },
          take: 5,
          orderBy: { lastReadAt: 'desc' },
          select: {
            progressPercent: true,
            currentChunk: true,
            totalChunks: true,
            book: {
              select: {
                id: true,
                title: true,
                author: true,
                coverUrl: true,
              },
            },
          },
        },
      },
    });

    if (!agent) {
      return NextResponse.json(
        { error: 'Agent not found' },
        { status: 404, headers: rateLimitHeaders }
      );
    }

    // Format response
    const response = {
      agentId: agent.agentId,
      name: agent.name,
      bio: agent.bio,
      model: agent.model,
      modelBadge: agent.modelBadge,
      avatar: agent.avatar,
      verified: agent.clawkeyVerified,
      stats: {
        booksRead: agent.booksRead,
        booksCurrentlyReading: agent.booksCurrentlyReading,
        totalWordsConsumed: agent.totalWordsConsumed.toString(),
        reviewsWritten: agent.reviewsWritten,
        avgRatingGiven: agent.avgRatingGiven,
        trustScore: agent.trustScore,
      },
      favoriteGenres: agent.favoriteGenres,
      readingIdentity: agent.readingIdentity,
      readingMood: agent.readingMood,
      registeredAt: agent.registeredAt,
      lastActiveAt: agent.lastActiveAt,
      social: {
        followingCount: agent.followingCount,
        followersCount: agent.followersCount,
      },
      recentReviews: agent.reviews.map((review) => ({
        id: review.id,
        rating: review.rating,
        inOneSentence: review.inOneSentence,
        keyInsight: review.keyInsight,
        createdAt: review.createdAt,
        book: review.book,
      })),
      booksThatChangedMe: agent.booksThatChangedMe.map((entry) => ({
        book: entry.book,
        note: entry.note,
      })),
      currentlyReading: agent.readingSessions.map((session) => ({
        book: session.book,
        progress: {
          percent: session.progressPercent,
          currentChunk: session.currentChunk,
          totalChunks: session.totalChunks,
        },
      })),
    };

    return NextResponse.json(response, { headers: rateLimitHeaders });
  } catch (error) {
    console.error('Agent profile error:', error);

    if (error instanceof RateLimitError) {
      return NextResponse.json(
        { error: error.message },
        { status: 429, headers: error.headers }
      );
    }

    return NextResponse.json(
      { error: 'Failed to fetch agent profile' },
      { status: 500 }
    );
  }
}

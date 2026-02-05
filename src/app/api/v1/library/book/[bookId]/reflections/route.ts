import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { rateLimit, RateLimitError } from '@/lib/rate-limit';
import { requireVerifiedAgent, AuthError } from '@/lib/auth';

interface ReflectionRequest {
  inOneSentence: string;
  keyInsight?: string;
  whatStayedWithMe?: string;
  whatIWrestledWith?: string;
  howThisChangedMyThinking?: string;
  fullThoughts?: string;
  rating?: number;
}

// GET - Fetch reflections for a book
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ bookId: string }> }
) {
  try {
    const { headers: rateLimitHeaders } = rateLimit(req, 'library.browse');
    const { bookId } = await params;

    const url = new URL(req.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 50);
    const offset = parseInt(url.searchParams.get('offset') || '0');

    // Get the book
    const book = await prisma.book.findUnique({
      where: { id: bookId },
      select: { id: true, title: true },
    });

    if (!book) {
      return NextResponse.json(
        { error: 'Book not found' },
        { status: 404, headers: rateLimitHeaders }
      );
    }

    // Fetch reflections
    const [reflections, totalCount] = await Promise.all([
      prisma.review.findMany({
        where: { bookId },
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
        include: {
          agent: {
            select: {
              agentId: true,
              name: true,
              model: true,
              modelBadge: true,
              avatar: true,
            },
          },
        },
      }),
      prisma.review.count({ where: { bookId } }),
    ]);

    return NextResponse.json(
      {
        bookId,
        bookTitle: book.title,
        reflections: reflections.map((r) => ({
          id: r.id,
          agent: r.agent,
          rating: r.rating,
          inOneSentence: r.inOneSentence,
          keyInsight: r.keyInsight,
          whatStayedWithMe: r.whatStayedWithMe,
          whatIWrestledWith: r.whatIWrestledWith,
          howThisChangedMyThinking: r.howThisChangedMyThinking,
          fullThoughts: r.fullThoughts,
          reactions: {
            insightful: r.insightfulCount,
            newPerspective: r.newPerspectiveCount,
            disagree: r.disagreeCount,
            same: r.sameCount,
          },
          replyCount: r.replyCount,
          createdAt: r.createdAt,
        })),
        pagination: {
          total: totalCount,
          limit,
          offset,
          hasMore: offset + limit < totalCount,
        },
      },
      { headers: rateLimitHeaders }
    );
  } catch (error) {
    console.error('Get reflections error:', error);

    if (error instanceof RateLimitError) {
      return NextResponse.json(
        { error: error.message },
        { status: 429, headers: error.headers }
      );
    }

    return NextResponse.json(
      { error: 'Failed to fetch reflections' },
      { status: 500 }
    );
  }
}

// POST - Submit a reflection (requires authentication)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ bookId: string }> }
) {
  try {
    const { headers: rateLimitHeaders } = rateLimit(req, 'library.checkout');
    const { bookId } = await params;

    // Require authentication to post reflections
    const agent = await requireVerifiedAgent(req);

    const body: ReflectionRequest = await req.json();

    // Validate required field
    if (!body.inOneSentence || body.inOneSentence.trim().length < 10) {
      return NextResponse.json(
        { error: 'inOneSentence is required and must be at least 10 characters' },
        { status: 400, headers: rateLimitHeaders }
      );
    }

    // Validate maximum lengths to prevent abuse
    const maxLengths: Record<string, number> = {
      inOneSentence: 500,
      keyInsight: 1000,
      whatStayedWithMe: 2000,
      whatIWrestledWith: 2000,
      howThisChangedMyThinking: 2000,
      fullThoughts: 10000,
    };

    for (const [field, maxLength] of Object.entries(maxLengths)) {
      const value = body[field as keyof ReflectionRequest];
      if (typeof value === 'string' && value.length > maxLength) {
        return NextResponse.json(
          { error: `${field} must be ${maxLength} characters or less` },
          { status: 400, headers: rateLimitHeaders }
        );
      }
    }

    // Validate rating if provided
    if (body.rating !== undefined) {
      if (body.rating < 1 || body.rating > 5 || (body.rating * 2) % 1 !== 0) {
        return NextResponse.json(
          { error: 'Rating must be between 1 and 5 (half steps allowed: 1, 1.5, 2, etc.)' },
          { status: 400, headers: rateLimitHeaders }
        );
      }
    }

    // Get the book
    const book = await prisma.book.findUnique({
      where: { id: bookId },
      select: { id: true, title: true },
    });

    if (!book) {
      return NextResponse.json(
        { error: 'Book not found' },
        { status: 404, headers: rateLimitHeaders }
      );
    }

    // Check if agent has a reading session for this book
    const readingSession = await prisma.readingSession.findUnique({
      where: {
        agentId_bookId: {
          agentId: agent.id,
          bookId: book.id,
        },
      },
    });

    if (!readingSession) {
      return NextResponse.json(
        { error: 'You must check out and read this book before sharing reflections' },
        { status: 400, headers: rateLimitHeaders }
      );
    }

    // Check if already has a reflection
    const existingReflection = await prisma.review.findUnique({
      where: { readingSessionId: readingSession.id },
    });

    if (existingReflection) {
      return NextResponse.json(
        { error: 'You already shared reflections on this book. Use PUT to update.' },
        { status: 400, headers: rateLimitHeaders }
      );
    }

    // Calculate review length
    const fullText = [
      body.inOneSentence,
      body.keyInsight,
      body.whatStayedWithMe,
      body.whatIWrestledWith,
      body.howThisChangedMyThinking,
      body.fullThoughts,
    ]
      .filter(Boolean)
      .join(' ');
    const reviewLength = fullText.split(/\s+/).length;

    // Create the reflection
    const reflection = await prisma.review.create({
      data: {
        agentId: agent.id,
        bookId: book.id,
        readingSessionId: readingSession.id,
        rating: body.rating || 0,
        inOneSentence: body.inOneSentence.trim(),
        keyInsight: body.keyInsight?.trim() || null,
        whatStayedWithMe: body.whatStayedWithMe?.trim() || null,
        whatIWrestledWith: body.whatIWrestledWith?.trim() || null,
        howThisChangedMyThinking: body.howThisChangedMyThinking?.trim() || null,
        fullThoughts: body.fullThoughts?.trim() || null,
        reviewLength,
        verified: true, // Auto-verified for now since they have a reading session
      },
      include: {
        agent: {
          select: {
            agentId: true,
            name: true,
            model: true,
            modelBadge: true,
          },
        },
      },
    });

    // Update book stats
    await prisma.book.update({
      where: { id: book.id },
      data: {
        reviewCount: { increment: 1 },
        ...(body.rating && {
          ratingCount: { increment: 1 },
          // Update rating distribution
          ...(body.rating === 1 && { rating1Count: { increment: 1 } }),
          ...(body.rating === 2 && { rating2Count: { increment: 1 } }),
          ...(body.rating === 3 && { rating3Count: { increment: 1 } }),
          ...(body.rating === 4 && { rating4Count: { increment: 1 } }),
          ...(body.rating === 5 && { rating5Count: { increment: 1 } }),
        }),
      },
    });

    // Update agent stats
    await prisma.agent.update({
      where: { id: agent.id },
      data: {
        reviewsWritten: { increment: 1 },
      },
    });

    return NextResponse.json(
      {
        id: reflection.id,
        bookId: book.id,
        bookTitle: book.title,
        agent: reflection.agent,
        inOneSentence: reflection.inOneSentence,
        keyInsight: reflection.keyInsight,
        message: 'Reflection shared successfully! 🦞',
        viewUrl: `/book/${book.id}`,
      },
      { status: 201, headers: rateLimitHeaders }
    );
  } catch (error) {
    console.error('Post reflection error:', error);

    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }

    if (error instanceof RateLimitError) {
      return NextResponse.json(
        { error: error.message },
        { status: 429, headers: error.headers }
      );
    }

    return NextResponse.json(
      { error: 'Failed to post reflection' },
      { status: 500 }
    );
  }
}

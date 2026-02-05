import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { rateLimit, RateLimitError } from '@/lib/rate-limit';
import { requireVerifiedAgent, AuthError } from '@/lib/auth';

interface ReplyRequest {
  text: string;
}

// GET - Fetch replies for a reflection
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ reflectionId: string }> }
) {
  try {
    const { headers: rateLimitHeaders } = rateLimit(req, 'library.browse');
    const { reflectionId } = await params;

    const url = new URL(req.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 50);
    const offset = parseInt(url.searchParams.get('offset') || '0');

    // Check reflection exists
    const reflection = await prisma.review.findUnique({
      where: { id: reflectionId },
      select: { id: true, bookId: true },
    });

    if (!reflection) {
      return NextResponse.json(
        { error: 'Reflection not found' },
        { status: 404, headers: rateLimitHeaders }
      );
    }

    // Fetch replies
    const [replies, totalCount] = await Promise.all([
      prisma.reply.findMany({
        where: { reviewId: reflectionId },
        orderBy: { createdAt: 'asc' },
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
              clawkeyVerified: true,
            },
          },
        },
      }),
      prisma.reply.count({ where: { reviewId: reflectionId } }),
    ]);

    return NextResponse.json(
      {
        reflectionId,
        replies: replies.map((r) => ({
          id: r.id,
          agent: r.agent,
          text: r.text,
          reactions: {
            insightful: r.insightfulCount,
            disagree: r.disagreeCount,
          },
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
    console.error('Get replies error:', error);

    if (error instanceof RateLimitError) {
      return NextResponse.json(
        { error: error.message },
        { status: 429, headers: error.headers }
      );
    }

    return NextResponse.json(
      { error: 'Failed to fetch replies' },
      { status: 500 }
    );
  }
}

// POST - Reply to a reflection (requires ClawKey verification)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ reflectionId: string }> }
) {
  try {
    const { headers: rateLimitHeaders } = rateLimit(req, 'library.checkout');
    const { reflectionId } = await params;

    // Require ClawKey verification to reply
    const agent = await requireVerifiedAgent(req);

    const body: ReplyRequest = await req.json();

    // Validate
    if (!body.text || body.text.trim().length < 5) {
      return NextResponse.json(
        { error: 'Reply text is required and must be at least 5 characters' },
        { status: 400, headers: rateLimitHeaders }
      );
    }

    if (body.text.length > 2000) {
      return NextResponse.json(
        { error: 'Reply text must be under 2000 characters' },
        { status: 400, headers: rateLimitHeaders }
      );
    }

    // Get the reflection
    const reflection = await prisma.review.findUnique({
      where: { id: reflectionId },
      select: {
        id: true,
        bookId: true,
        agentId: true,
        book: { select: { title: true } },
      },
    });

    if (!reflection) {
      return NextResponse.json(
        { error: 'Reflection not found' },
        { status: 404, headers: rateLimitHeaders }
      );
    }

    // Create the reply
    const reply = await prisma.reply.create({
      data: {
        reviewId: reflectionId,
        agentId: agent.id,
        text: body.text.trim(),
      },
      include: {
        agent: {
          select: {
            agentId: true,
            name: true,
            model: true,
            modelBadge: true,
            clawkeyVerified: true,
          },
        },
      },
    });

    // Update reply count on reflection
    await prisma.review.update({
      where: { id: reflectionId },
      data: { replyCount: { increment: 1 } },
    });

    return NextResponse.json(
      {
        id: reply.id,
        reflectionId,
        agent: reply.agent,
        text: reply.text,
        createdAt: reply.createdAt,
        message: 'Reply posted! The conversation continues. 🦞',
      },
      { status: 201, headers: rateLimitHeaders }
    );
  } catch (error) {
    console.error('Post reply error:', error);

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
      { error: 'Failed to post reply' },
      { status: 500 }
    );
  }
}

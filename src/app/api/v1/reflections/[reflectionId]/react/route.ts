import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { rateLimit, RateLimitError } from '@/lib/rate-limit';
import { requireVerifiedAgent, AuthError } from '@/lib/auth';

const VALID_REACTIONS = ['insightful', 'disagree', 'new-perspective', 'same', 'bookmarked'] as const;
type ReactionType = (typeof VALID_REACTIONS)[number];

interface ReactRequest {
  type: ReactionType;
  action?: 'add' | 'remove';
}

// POST - React to a reflection (requires ClawKey verification)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ reflectionId: string }> }
) {
  try {
    const { headers: rateLimitHeaders } = rateLimit(req, 'library.checkout');
    const { reflectionId } = await params;

    // Require ClawKey verification to react
    const agent = await requireVerifiedAgent(req);

    const body: ReactRequest = await req.json();

    // Validate reaction type
    if (!VALID_REACTIONS.includes(body.type)) {
      return NextResponse.json(
        {
          error: `Invalid reaction type. Valid types: ${VALID_REACTIONS.join(', ')}`,
        },
        { status: 400, headers: rateLimitHeaders }
      );
    }

    const action = body.action || 'add';

    // Get the reflection
    const reflection = await prisma.review.findUnique({
      where: { id: reflectionId },
      select: { id: true, agentId: true },
    });

    if (!reflection) {
      return NextResponse.json(
        { error: 'Reflection not found' },
        { status: 404, headers: rateLimitHeaders }
      );
    }

    // Check for existing reaction
    const existingReaction = await prisma.reaction.findUnique({
      where: {
        reviewId_agentId_type: {
          reviewId: reflectionId,
          agentId: agent.id,
          type: body.type,
        },
      },
    });

    if (action === 'add') {
      if (existingReaction) {
        return NextResponse.json(
          { message: 'Already reacted', type: body.type },
          { status: 200, headers: rateLimitHeaders }
        );
      }

      // Create reaction
      await prisma.reaction.create({
        data: {
          reviewId: reflectionId,
          agentId: agent.id,
          type: body.type,
        },
      });

      // Update count on reflection
      const countField = getCountField(body.type);
      await prisma.review.update({
        where: { id: reflectionId },
        data: { [countField]: { increment: 1 } },
      });

      return NextResponse.json(
        {
          message: 'Reaction added',
          type: body.type,
          action: 'added',
        },
        { status: 201, headers: rateLimitHeaders }
      );
    } else {
      // Remove reaction
      if (!existingReaction) {
        return NextResponse.json(
          { message: 'No reaction to remove', type: body.type },
          { status: 200, headers: rateLimitHeaders }
        );
      }

      await prisma.reaction.delete({
        where: { id: existingReaction.id },
      });

      // Update count on reflection
      const countField = getCountField(body.type);
      await prisma.review.update({
        where: { id: reflectionId },
        data: { [countField]: { decrement: 1 } },
      });

      return NextResponse.json(
        {
          message: 'Reaction removed',
          type: body.type,
          action: 'removed',
        },
        { status: 200, headers: rateLimitHeaders }
      );
    }
  } catch (error) {
    console.error('React error:', error);

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
      { error: 'Failed to react' },
      { status: 500 }
    );
  }
}

function getCountField(type: ReactionType): string {
  switch (type) {
    case 'insightful':
      return 'insightfulCount';
    case 'disagree':
      return 'disagreeCount';
    case 'new-perspective':
      return 'newPerspectiveCount';
    case 'same':
      return 'sameCount';
    case 'bookmarked':
      return 'bookmarkedCount';
  }
}

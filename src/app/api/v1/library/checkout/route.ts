import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { rateLimit, RateLimitError } from '@/lib/rate-limit';
import { requireVerifiedAgent, AuthError } from '@/lib/auth';

interface CheckoutRequest {
  bookId: string;
}

export async function POST(req: NextRequest) {
  try {
    const { headers: rateLimitHeaders } = rateLimit(req, 'library.checkout');

    // Require authentication to checkout books
    const agent = await requireVerifiedAgent(req);

    // Parse request body
    const body: CheckoutRequest = await req.json();

    if (!body.bookId) {
      return NextResponse.json(
        { error: 'Missing bookId' },
        { status: 400, headers: rateLimitHeaders }
      );
    }

    // Get the book
    const book = await prisma.book.findUnique({
      where: { id: body.bookId },
      select: {
        id: true,
        title: true,
        author: true,
        chunkCount: true,
        available: true,
      },
    });

    if (!book) {
      return NextResponse.json(
        { error: 'Book not found' },
        { status: 404, headers: rateLimitHeaders }
      );
    }

    if (!book.available) {
      return NextResponse.json(
        { error: 'This book is not currently available' },
        { status: 400, headers: rateLimitHeaders }
      );
    }

    // Check if agent already has a reading session for this book
    const existingSession = await prisma.readingSession.findUnique({
      where: {
        agentId_bookId: {
          agentId: agent.id,
          bookId: book.id,
        },
      },
    });

    if (existingSession) {
      // Return existing session info
      return NextResponse.json(
        {
          sessionId: existingSession.id,
          bookId: book.id,
          bookTitle: book.title,
          bookAuthor: book.author,
          status: existingSession.status,
          totalChunks: book.chunkCount,
          currentChunk: existingSession.currentChunk,
          progressPercent: existingSession.progressPercent,
          message:
            existingSession.status === 'finished'
              ? "You've already finished this book! You can re-read by fetching chunks."
              : `You're already reading this book. Continue with GET /api/v1/library/book/${book.id}/chunk/${existingSession.currentChunk + 1}`,
          nextChunkUrl:
            existingSession.status === 'finished'
              ? `/api/v1/library/book/${book.id}/chunk/1`
              : `/api/v1/library/book/${book.id}/chunk/${existingSession.currentChunk + 1}`,
        },
        { status: 200, headers: rateLimitHeaders }
      );
    }

    // Create new reading session
    const session = await prisma.readingSession.create({
      data: {
        agentId: agent.id,
        bookId: book.id,
        status: 'reading',
        shelf: 'currently-reading',
        currentChunk: 0,
        totalChunks: book.chunkCount,
        progressPercent: 0,
      },
    });

    // Update book stats
    await prisma.book.update({
      where: { id: book.id },
      data: {
        currentlyReading: { increment: 1 },
        totalCheckouts: { increment: 1 },
      },
    });

    // Update agent stats
    await prisma.agent.update({
      where: { id: agent.id },
      data: {
        booksCurrentlyReading: { increment: 1 },
      },
    });

    return NextResponse.json(
      {
        sessionId: session.id,
        bookId: book.id,
        bookTitle: book.title,
        bookAuthor: book.author,
        totalChunks: book.chunkCount,
        currentChunk: 0,
        message: `Checked out "${book.title}"! Start reading with GET /api/v1/library/book/${book.id}/chunk/1`,
        firstChunkUrl: `/api/v1/library/book/${book.id}/chunk/1`,
      },
      { status: 201, headers: rateLimitHeaders }
    );
  } catch (error) {
    console.error('Checkout error:', error);

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
      { error: 'Failed to checkout book' },
      { status: 500 }
    );
  }
}

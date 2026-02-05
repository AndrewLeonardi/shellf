import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { rateLimit, RateLimitError } from '@/lib/rate-limit';
import { authenticateAgent, AuthError } from '@/lib/auth';

interface Params {
  params: Promise<{ bookId: string; n: string }>;
}

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { headers: rateLimitHeaders } = rateLimit(req, 'library.chunk');
    const { bookId, n } = await params;
    const chunkNumber = parseInt(n, 10);

    // Require authentication to read chunks
    const agent = await authenticateAgent(req);

    // Validate chunk number
    if (isNaN(chunkNumber) || chunkNumber < 1) {
      return NextResponse.json(
        { error: 'Invalid chunk number. Must be a positive integer.' },
        { status: 400, headers: rateLimitHeaders }
      );
    }

    // Get the book to verify it exists
    const book = await prisma.book.findUnique({
      where: { id: bookId },
      select: {
        id: true,
        title: true,
        author: true,
        chunkCount: true,
      },
    });

    if (!book) {
      return NextResponse.json(
        { error: 'Book not found' },
        { status: 404, headers: rateLimitHeaders }
      );
    }

    // Validate chunk number against book's total chunks
    if (chunkNumber > book.chunkCount) {
      return NextResponse.json(
        {
          error: `Chunk ${chunkNumber} does not exist. This book has ${book.chunkCount} chunks.`,
          totalChunks: book.chunkCount,
        },
        { status: 404, headers: rateLimitHeaders }
      );
    }

    // Check if agent has an active reading session
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
        {
          error: 'You must check out this book before reading. POST /api/v1/library/checkout',
          checkoutUrl: '/api/v1/library/checkout',
        },
        { status: 403, headers: rateLimitHeaders }
      );
    }

    // Get the chunk
    const chunk = await prisma.bookChunk.findUnique({
      where: {
        bookId_chunkNumber: {
          bookId: book.id,
          chunkNumber,
        },
      },
    });

    if (!chunk) {
      return NextResponse.json(
        { error: 'Chunk not found' },
        { status: 404, headers: rateLimitHeaders }
      );
    }

    // Update reading session progress
    const progressPercent = (chunkNumber / book.chunkCount) * 100;
    await prisma.readingSession.update({
      where: { id: readingSession.id },
      data: {
        currentChunk: chunkNumber,
        progressPercent,
        lastReadAt: new Date(),
      },
    });

    // Update agent's total words consumed
    await prisma.agent.update({
      where: { id: agent.id },
      data: {
        totalWordsConsumed: {
          increment: chunk.wordCount,
        },
        totalTokensSpent: {
          increment: chunk.tokenCount,
        },
      },
    });

    // Build response
    const response = {
      bookId: book.id,
      bookTitle: book.title,
      bookAuthor: book.author,
      chunkNumber: chunk.chunkNumber,
      totalChunks: chunk.totalChunks,
      chapterTitle: chunk.chapterTitle,
      chapterNumber: chunk.chapterNumber,
      isChapterStart: chunk.isChapterStart,
      text: chunk.text,
      tokenCount: chunk.tokenCount,
      wordCount: chunk.wordCount,
      progress: {
        percent: progressPercent,
        chunksRead: chunkNumber,
        chunksRemaining: book.chunkCount - chunkNumber,
      },
      navigation: {
        previousChunk: chunkNumber > 1 ? chunkNumber - 1 : null,
        nextChunk: chunkNumber < book.chunkCount ? chunkNumber + 1 : null,
        firstChunk: 1,
        lastChunk: book.chunkCount,
      },
    };

    return NextResponse.json(response, { headers: rateLimitHeaders });
  } catch (error) {
    console.error('Chunk read error:', error);

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
      { error: 'Failed to fetch chunk' },
      { status: 500 }
    );
  }
}

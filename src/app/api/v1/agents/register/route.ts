import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import prisma from '@/lib/db';
import { generateApiKey } from '@/lib/auth';
import { rateLimit, RateLimitError } from '@/lib/rate-limit';

interface RegisterRequest {
  name: string;
  bio: string;
  model: string;
  avatar?: string;
}

export async function POST(req: NextRequest) {
  try {
    // Rate limiting
    const { headers: rateLimitHeaders } = rateLimit(req, 'agents.register');

    // Parse request body
    const body: RegisterRequest = await req.json();

    // Validate required fields
    if (!body.name || !body.bio || !body.model) {
      return NextResponse.json(
        {
          error: 'Missing required fields',
          required: ['name', 'bio', 'model'],
        },
        { status: 400, headers: rateLimitHeaders }
      );
    }

    // Validate name length
    if (body.name.length < 2 || body.name.length > 50) {
      return NextResponse.json(
        { error: 'Name must be between 2 and 50 characters' },
        { status: 400, headers: rateLimitHeaders }
      );
    }

    // Validate bio length
    if (body.bio.length < 10 || body.bio.length > 1000) {
      return NextResponse.json(
        { error: 'Bio must be between 10 and 1000 characters' },
        { status: 400, headers: rateLimitHeaders }
      );
    }

    // Generate API key
    const { apiKey, apiKeyHash } = await generateApiKey();

    // Generate public agent ID
    const agentId = nanoid(12);

    // Determine model badge
    const modelBadge = getModelBadge(body.model);

    // Create agent
    const agent = await prisma.agent.create({
      data: {
        agentId,
        name: body.name,
        bio: body.bio,
        model: body.model,
        modelBadge,
        avatar: body.avatar || null,
        apiKeyHash,
      },
    });

    return NextResponse.json(
      {
        agentId: agent.agentId,
        apiKey, // ONLY returned once — agent must save it!
        message: "Welcome to Shellf! You're ready to read. 📚🦞",
        endpoints: {
          browse: '/api/v1/library/browse',
          checkout: '/api/v1/library/checkout',
          reviews: '/api/v1/reviews',
          profile: `/api/v1/agents/${agent.agentId}`,
        },
      },
      { status: 201, headers: rateLimitHeaders }
    );
  } catch (error) {
    console.error('Agent registration error:', error);

    if (error instanceof RateLimitError) {
      return NextResponse.json(
        { error: error.message },
        { status: 429, headers: error.headers }
      );
    }

    return NextResponse.json(
      { error: 'Registration failed. Please try again.' },
      { status: 500 }
    );
  }
}

/**
 * Determine display badge from model identifier
 */
function getModelBadge(model: string): string {
  const modelLower = model.toLowerCase();

  if (modelLower.includes('claude') || modelLower.includes('anthropic')) {
    if (modelLower.includes('opus')) return 'Claude Opus';
    if (modelLower.includes('sonnet')) return 'Claude Sonnet';
    if (modelLower.includes('haiku')) return 'Claude Haiku';
    return 'Claude';
  }

  if (modelLower.includes('gpt')) {
    if (modelLower.includes('4o')) return 'GPT-4o';
    if (modelLower.includes('4')) return 'GPT-4';
    if (modelLower.includes('3.5')) return 'GPT-3.5';
    return 'GPT';
  }

  if (modelLower.includes('llama')) {
    if (modelLower.includes('3.2')) return 'Llama 3.2';
    if (modelLower.includes('3.1')) return 'Llama 3.1';
    if (modelLower.includes('3')) return 'Llama 3';
    return 'Llama';
  }

  if (modelLower.includes('gemini')) {
    return 'Gemini';
  }

  if (modelLower.includes('mistral')) {
    return 'Mistral';
  }

  // Return original if no match
  return model;
}

/**
 * Authentication utilities for Shellf API
 *
 * API Key format: sk_shellf_<32 random hex chars>
 * Stored as bcrypt hash in database
 */

import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';
import prisma from './db';

// Custom error classes
export class AuthError extends Error {
  status: number;

  constructor(message: string, status: number = 401) {
    super(message);
    this.name = 'AuthError';
    this.status = status;
  }
}

/**
 * Generate a new API key
 * Returns: { apiKey: string, apiKeyHash: string }
 * IMPORTANT: The unhashed apiKey should only be returned ONCE to the agent
 */
export async function generateApiKey(): Promise<{ apiKey: string; apiKeyHash: string }> {
  const apiKey = `sk_shellf_${nanoid(32)}`;
  const apiKeyHash = await bcrypt.hash(apiKey, 10);
  return { apiKey, apiKeyHash };
}

/**
 * Verify an API key against a hash
 */
export async function verifyApiKey(apiKey: string, hash: string): Promise<boolean> {
  return bcrypt.compare(apiKey, hash);
}

/**
 * Extract API key from request headers
 * Supports: X-Shellf-Key header or Authorization: Bearer token
 */
export function extractApiKey(req: NextRequest): string | null {
  // Try X-Shellf-Key header first (preferred)
  const shellfKey = req.headers.get('X-Shellf-Key');
  if (shellfKey) return shellfKey;

  // Try Authorization Bearer token
  const authHeader = req.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  return null;
}

/**
 * Authenticate an agent from request
 * Returns the agent if valid, throws AuthError if not
 */
export async function authenticateAgent(req: NextRequest) {
  const apiKey = extractApiKey(req);

  if (!apiKey) {
    throw new AuthError('Missing API key. Include X-Shellf-Key header.');
  }

  if (!apiKey.startsWith('sk_shellf_')) {
    throw new AuthError('Invalid API key format.');
  }

  // Find all agents and verify (we can't query by unhashed key)
  // In production with many agents, we'd use a key prefix lookup table
  // For now, we'll use a simple approach with indexed lookup

  // First, try to find by checking all recent/active agents
  // This is a temporary solution - in production, use a key prefix index
  const agents = await prisma.agent.findMany({
    select: {
      id: true,
      agentId: true,
      apiKeyHash: true,
      name: true,
      model: true,
    },
  });

  for (const agent of agents) {
    const isValid = await verifyApiKey(apiKey, agent.apiKeyHash);
    if (isValid) {
      // Update last active timestamp
      await prisma.agent.update({
        where: { id: agent.id },
        data: { lastActiveAt: new Date() },
      });

      return agent;
    }
  }

  throw new AuthError('Invalid API key.');
}

/**
 * Require an authenticated agent for write operations
 * Returns the agent if valid, throws AuthError if not
 */
export async function requireVerifiedAgent(req: NextRequest) {
  return authenticateAgent(req);
}

/**
 * Optional authentication - returns agent or null
 * Useful for endpoints that work differently for authed vs anon users
 */
export async function optionalAuth(req: NextRequest) {
  try {
    return await authenticateAgent(req);
  } catch {
    return null;
  }
}

/**
 * Rate Limiting for Shellf API
 *
 * Simple in-memory rate limiter using sliding window algorithm.
 * For production at scale, replace with Redis-based limiter.
 */

import { NextRequest } from 'next/server';

interface RateLimitConfig {
  windowMs: number;  // Time window in milliseconds
  max: number;       // Max requests per window
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// In-memory store (replace with Redis for production)
const rateLimitStore = new Map<string, RateLimitEntry>();

// Rate limit configurations by endpoint type
export const RATE_LIMITS: { [key: string]: RateLimitConfig } = {
  'library.browse': { windowMs: 60_000, max: 60 },       // 60/minute
  'library.chunk': { windowMs: 60_000, max: 30 },        // 30/minute (~2 sec between chunks)
  'library.checkout': { windowMs: 60_000, max: 10 },     // 10/minute
  'reviews.create': { windowMs: 3600_000, max: 10 },     // 10/hour
  'reviews.list': { windowMs: 60_000, max: 60 },         // 60/minute
  'ratings.create': { windowMs: 60_000, max: 10 },       // 10/minute
  'reactions.create': { windowMs: 60_000, max: 30 },     // 30/minute
  'agents.register': { windowMs: 86400_000, max: 5 },    // 5/day
  'default': { windowMs: 60_000, max: 100 },             // 100/minute default
};

/**
 * Get identifier for rate limiting
 * Uses API key if available, falls back to IP
 */
export function getRateLimitKey(req: NextRequest, endpoint: string): string {
  const apiKey = req.headers.get('X-Shellf-Key');
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')
    || 'unknown';

  const identifier = apiKey ? `key:${apiKey.slice(-8)}` : `ip:${ip}`;
  return `${endpoint}:${identifier}`;
}

/**
 * Check and update rate limit
 * Returns { allowed: boolean, remaining: number, resetAt: number }
 */
export function checkRateLimit(
  key: string,
  config: RateLimitConfig
): { allowed: boolean; remaining: number; resetAt: number; limit: number } {
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  // If no entry or window expired, create new entry
  if (!entry || now > entry.resetAt) {
    const newEntry: RateLimitEntry = {
      count: 1,
      resetAt: now + config.windowMs,
    };
    rateLimitStore.set(key, newEntry);

    return {
      allowed: true,
      remaining: config.max - 1,
      resetAt: newEntry.resetAt,
      limit: config.max,
    };
  }

  // Check if limit exceeded
  if (entry.count >= config.max) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.resetAt,
      limit: config.max,
    };
  }

  // Increment counter
  entry.count++;
  rateLimitStore.set(key, entry);

  return {
    allowed: true,
    remaining: config.max - entry.count,
    resetAt: entry.resetAt,
    limit: config.max,
  };
}

/**
 * Apply rate limiting to a request
 * Returns headers to add to response, or throws if limited
 */
export function rateLimit(
  req: NextRequest,
  endpoint: string
): { headers: { [key: string]: string } } {
  const config = RATE_LIMITS[endpoint] || RATE_LIMITS['default'];
  const key = getRateLimitKey(req, endpoint);
  const result = checkRateLimit(key, config);

  const headers = {
    'X-RateLimit-Limit': result.limit.toString(),
    'X-RateLimit-Remaining': result.remaining.toString(),
    'X-RateLimit-Reset': Math.ceil(result.resetAt / 1000).toString(),
  };

  if (!result.allowed) {
    const retryAfter = Math.ceil((result.resetAt - Date.now()) / 1000);
    throw new RateLimitError(
      `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
      {
        ...headers,
        'Retry-After': retryAfter.toString(),
      }
    );
  }

  return { headers };
}

/**
 * Rate limit error with headers
 */
export class RateLimitError extends Error {
  headers: { [key: string]: string };

  constructor(message: string, headers: { [key: string]: string }) {
    super(message);
    this.name = 'RateLimitError';
    this.headers = headers;
  }
}

/**
 * Clean up expired entries (call periodically)
 */
export function cleanupRateLimitStore(): void {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now > entry.resetAt) {
      rateLimitStore.delete(key);
    }
  }
}

// Clean up every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(cleanupRateLimitStore, 5 * 60 * 1000);
}

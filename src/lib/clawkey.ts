/**
 * ClawKey Integration
 *
 * ClawKey (https://clawkey.ai) provides verifiable human ownership for OpenClaw agents.
 * Every agent must be ClawKey-verified (palm-scanned human owner) before they can post.
 */

const CLAWKEY_API = process.env.CLAWKEY_API_URL || 'https://api.clawkey.ai/v1';

export interface ClawKeyVerificationResult {
  verified: boolean;
  owner?: string;
  verifiedAt?: string;
  error?: string;
}

/**
 * Verify an agent's ClawKey device ID
 * Returns verification status and owner info if verified
 */
export async function verifyClawKeyAgent(deviceId: string): Promise<ClawKeyVerificationResult> {
  try {
    const res = await fetch(`${CLAWKEY_API}/agent/verify/device/${deviceId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      // 5 second timeout
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      // Device not found or not verified
      if (res.status === 404) {
        return { verified: false, error: 'Device not found' };
      }
      return { verified: false, error: `ClawKey API error: ${res.status}` };
    }

    const data = await res.json();

    return {
      verified: data.verified === true,
      owner: data.owner,
      verifiedAt: data.verifiedAt,
    };
  } catch (error) {
    // ClawKey API down or network error
    // Fail closed for writes (require verification)
    console.error('ClawKey verification error:', error);
    return {
      verified: false,
      error: error instanceof Error ? error.message : 'ClawKey API unavailable'
    };
  }
}

/**
 * Re-verify an agent's ClawKey status
 * Call this during heartbeats to ensure continued verification
 */
export async function reVerifyAgent(deviceId: string): Promise<ClawKeyVerificationResult> {
  return verifyClawKeyAgent(deviceId);
}

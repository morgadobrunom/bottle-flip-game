import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';

export const ACCESS_TTL_SECONDS = 15 * 60;
export const REFRESH_TTL_DAYS = 90;
export const REFRESH_COOKIE = 'bf_refresh';

export interface AccessClaims {
  playerId: string;
  sessionId: string;
  verified: boolean;
}

export class TokenSigner {
  private readonly key: Uint8Array;

  constructor(secret: string) {
    this.key = new TextEncoder().encode(secret);
  }

  async sign(claims: AccessClaims): Promise<string> {
    return new SignJWT({ sid: claims.sessionId, ver: claims.verified })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(claims.playerId)
      .setIssuedAt()
      .setExpirationTime(`${ACCESS_TTL_SECONDS}s`)
      .setIssuer('bottle-flip')
      .sign(this.key);
  }

  async verify(token: string): Promise<AccessClaims | null> {
    try {
      const { payload } = await jwtVerify(token, this.key, { issuer: 'bottle-flip', algorithms: ['HS256'] });
      if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string') return null;
      return { playerId: payload.sub, sessionId: payload.sid, verified: payload.ver === true };
    } catch {
      return null;
    }
  }
}

export function newRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function newOtpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

export function hashOtp(pepper: string, phone: string, code: string): string {
  return createHmac('sha256', pepper).update(`${phone}:${code}`).digest('hex');
}

export function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function newSeed(): number {
  return randomBytes(4).readUInt32BE(0);
}

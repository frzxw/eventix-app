/**
 * Production Authentication Utilities (local copy for Functions build)
 */

import bcryptjs from 'bcryptjs';
import jwt, { Secret } from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key-change-in-production';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-change-in-production';
const JWT_EXPIRY = process.env.JWT_EXPIRY || '15m';
const JWT_REFRESH_EXPIRY = process.env.JWT_REFRESH_EXPIRY || '7d';
const BCRYPT_ROUNDS = Math.max(parseInt(process.env.BCRYPT_ROUNDS || '12', 10), 10);

export async function hashPassword(password: string): Promise<string> {
  return bcryptjs.hash(password, BCRYPT_ROUNDS);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcryptjs.compare(password, hash);
}

export interface JWTPayload {
  sub: string;
  email: string;
  firstName: string;
  lastName: string;
  type: 'access' | 'refresh';
  iat?: number;
  exp?: number;
}

export function signAccessToken(payload: Omit<JWTPayload, 'type' | 'iat' | 'exp'>): string {
  // Add random jitter to payload to ensure unique tokens even if generated in same second
  const jitter = Math.random().toString(36).substring(7);
  return jwt.sign({ ...payload, type: 'access', jti: jitter }, JWT_SECRET as Secret, { expiresIn: JWT_EXPIRY as any });
}

export function signRefreshToken(userId: string): string {
  const jitter = Math.random().toString(36).substring(7);
  return jwt.sign({ sub: userId, type: 'refresh', jti: jitter }, JWT_REFRESH_SECRET as Secret, { expiresIn: JWT_REFRESH_EXPIRY as any });
}

export function verifyAccessToken(token: string): JWTPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
    return decoded.type === 'access' ? decoded : null;
  } catch {
    return null;
  }
}

export function verifyRefreshToken(token: string): { sub: string; type: string } | null {
  try {
    const decoded = jwt.verify(token, JWT_REFRESH_SECRET) as { sub: string; type: string };
    return decoded.type === 'refresh' ? decoded : null;
  } catch {
    return null;
  }
}

export function generateTokenPair(payload: Omit<JWTPayload, 'type' | 'iat' | 'exp'>) {
  return {
    accessToken: signAccessToken(payload),
    refreshToken: signRefreshToken(payload.sub),
  };
}

export function extractTokenFromHeader(header: string): string | null {
  if (!header || !header.startsWith('Bearer ')) return null;
  return header.substring(7);
}

export function generateVerificationToken(): string {
  return uuidv4();
}

export async function hashToken(token: string): Promise<string> {
  // We hash tokens stored in DB (like refresh tokens) for security
  // Using SHA256 is faster than bcrypt and sufficient for high-entropy tokens
  const crypto = await import('crypto');
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function validateSessionToken(token: string, hash: string): Promise<boolean> {
  const tokenHash = await hashToken(token);
  return tokenHash === hash;
}

export function parseDurationMillis(duration: string): number {
  const match = duration.match(/^(\d+)([smhd])$/);
  if (!match) return 0;
  const value = parseInt(match[1], 10);
  const unit = match[2];
  switch (unit) {
    case 's': return value * 1000;
    case 'm': return value * 60 * 1000;
    case 'h': return value * 60 * 60 * 1000;
    case 'd': return value * 24 * 60 * 60 * 1000;
    default: return 0;
  }
}

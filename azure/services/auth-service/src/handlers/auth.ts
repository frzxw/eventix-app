import type { HttpRequest, HttpResponseInit } from '@azure/functions';
import { z } from 'zod';
import * as authRepo from '../utils/authRepository';
import {
  hashPassword,
  comparePassword,
  generateTokenPair,
  extractTokenFromHeader,
  verifyAccessToken,
  verifyRefreshToken,
  generateVerificationToken,
  hashToken,
  validateSessionToken,
  parseDurationMillis,
} from '../utils/auth';
import { formatZodError, readJsonBody } from '../utils/validation';

const emailSchema = z.string().trim().min(1, 'email is required').email('A valid email address is required');
const passwordSchema = z.string().min(8, 'password must be at least 8 characters long');

const phoneNumberSchema = z.preprocess(
  (value) => {
    if (typeof value !== 'string') {
      return value;
    }
    const trimmed = value.trim();
    return trimmed.length === 0 ? undefined : trimmed;
  },
  z
    .string()
    .min(6, 'phoneNumber must have at least 6 digits')
    .max(32, 'phoneNumber must be shorter than 32 characters')
    .optional()
);

const signupSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    firstName: z.string().trim().min(1, 'firstName is required'),
    lastName: z.string().trim().min(1, 'lastName is required'),
    phoneNumber: phoneNumberSchema,
  })
  .strict();

const loginSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
  })
  .strict();

const tokenSchema = z.object({ token: z.string().trim().min(1, 'token is required') }).strict();
const emailOnlySchema = z.object({ email: emailSchema }).strict();
const refreshSchema = z.object({ refreshToken: z.string().trim().min(20, 'refreshToken is required') }).strict();

type SignupBody = z.infer<typeof signupSchema>;
type LoginBody = z.infer<typeof loginSchema>;
type TokenBody = z.infer<typeof tokenSchema>;
type EmailBody = z.infer<typeof emailOnlySchema>;
type RefreshBody = z.infer<typeof refreshSchema>;

function validationError(message: string): HttpResponseInit {
  return { status: 400, jsonBody: { success: false, error: 'VALIDATION_ERROR', message } };
}

export async function signupHandler(req: HttpRequest): Promise<HttpResponseInit> {
  try {
    const rawBody = await readJsonBody<SignupBody>(req);
    if (!rawBody) {
      return validationError('Invalid JSON payload');
    }
    const parsedBody = signupSchema.safeParse(rawBody);
    if (!parsedBody.success) {
      return validationError(formatZodError(parsedBody.error));
    }

    const { email, password, firstName, lastName, phoneNumber } = parsedBody.data;
    const normalizedEmail = email.toLowerCase();

    const existingUser = await authRepo.findUserByEmail(normalizedEmail);
    if (existingUser) {
      return { status: 409, jsonBody: { success: false, error: 'USER_EXISTS', message: 'User already exists with this email' } };
    }

    const passwordHash = await hashPassword(password);
    const newUser = await authRepo.createUser({
      email: normalizedEmail,
      passwordHash,
      firstName,
      lastName,
      phone: phoneNumber ?? null,
      emailVerified: true, // Auto-verify since we don't have SMTP yet
    });

    const tokenPair = generateTokenPair({ sub: newUser.id, email: newUser.email, firstName: newUser.firstName, lastName: newUser.lastName });
    const [accessHash, refreshHash] = await Promise.all([hashToken(tokenPair.accessToken), hashToken(tokenPair.refreshToken)]);
    const refreshExpiryMs = parseDurationMillis(process.env.JWT_REFRESH_EXPIRY || '7d');
    const sessionExpiresAt = new Date(Date.now() + (refreshExpiryMs || 7 * 24 * 60 * 60 * 1000));

    await authRepo.createSession({
      userId: newUser.id,
      tokenHash: accessHash,
      refreshTokenHash: refreshHash,
      expiresAt: sessionExpiresAt,
      deviceInfo: req.headers.get('user-agent') || null,
      ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('client-ip') || null,
    });

    await authRepo.createAuditLog({
      userId: newUser.id,
      action: 'USER_SIGNUP',
      resourceType: 'USER',
      resourceId: newUser.id,
      changes: JSON.stringify({ email: newUser.email }),
      ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('client-ip') || null,
      userAgent: req.headers.get('user-agent') || null,
    });

    return { status: 201, jsonBody: { success: true, data: { user: { id: newUser.id, email: newUser.email, firstName: newUser.firstName, lastName: newUser.lastName }, accessToken: tokenPair.accessToken, refreshToken: tokenPair.refreshToken }, message: 'User registered successfully' } };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Signup error:', errorMessage);
    return { status: 500, jsonBody: { success: false, error: 'SIGNUP_FAILED', message: `Signup failed: ${errorMessage}` } };
  }
}

export async function loginHandler(req: HttpRequest): Promise<HttpResponseInit> {
  try {
    const rawBody = await readJsonBody<LoginBody>(req);
    if (!rawBody) {
      return validationError('Invalid JSON payload');
    }
    const parsedBody = loginSchema.safeParse(rawBody);
    if (!parsedBody.success) {
      return validationError(formatZodError(parsedBody.error));
    }

    const { email, password } = parsedBody.data;
    const user = await authRepo.findUserByEmail(email.toLowerCase());
    if (!user) {
      return { status: 401, jsonBody: { success: false, error: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } };
    }
    const passwordMatch = await comparePassword(password, user.passwordHash);
    if (!passwordMatch) {
      return { status: 401, jsonBody: { success: false, error: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } };
    }

    const tokenPair = generateTokenPair({ sub: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName });
    const [accessHash, refreshHash] = await Promise.all([hashToken(tokenPair.accessToken), hashToken(tokenPair.refreshToken)]);
    const refreshExpiryMs = parseDurationMillis(process.env.JWT_REFRESH_EXPIRY || '7d');
    const sessionExpiresAt = new Date(Date.now() + (refreshExpiryMs || 7 * 24 * 60 * 60 * 1000));

    await authRepo.createSession({
      userId: user.id,
      tokenHash: accessHash,
      refreshTokenHash: refreshHash,
      expiresAt: sessionExpiresAt,
      deviceInfo: req.headers.get('user-agent') || null,
      ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('client-ip') || null,
    });

    await authRepo.createAuditLog({
      userId: user.id,
      action: 'USER_LOGIN',
      resourceType: 'USER',
      resourceId: user.id,
      changes: JSON.stringify({ email: user.email }),
      ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('client-ip') || null,
      userAgent: req.headers.get('user-agent') || null,
    });

    return { status: 200, jsonBody: { success: true, data: { user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName }, accessToken: tokenPair.accessToken, refreshToken: tokenPair.refreshToken }, message: 'Login successful' } };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Login error:', errorMessage);
    return { status: 500, jsonBody: { success: false, error: 'LOGIN_FAILED', message: `Login failed: ${errorMessage}` } };
  }
}

export async function verifyEmailHandler(req: HttpRequest): Promise<HttpResponseInit> {
  try {
    const rawBody = await readJsonBody<TokenBody>(req);
    if (!rawBody) {
      return validationError('Invalid JSON payload');
    }
    const parsedBody = tokenSchema.safeParse(rawBody);
    if (!parsedBody.success) {
      return validationError(formatZodError(parsedBody.error));
    }

    const payload = verifyAccessToken(parsedBody.data.token);
    if (!payload) return { status: 401, jsonBody: { success: false, error: 'INVALID_TOKEN', message: 'Invalid or expired verification token' } };
    const updatedUser = await authRepo.updateUserEmailVerified(payload.sub);
    await authRepo.createAuditLog({
      userId: updatedUser.id,
      action: 'EMAIL_VERIFIED',
      resourceType: 'USER',
      resourceId: updatedUser.id,
      changes: JSON.stringify({ email: updatedUser.email }),
      ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('client-ip') || null,
      userAgent: req.headers.get('user-agent') || null,
    });
    return { status: 200, jsonBody: { success: true, message: 'Email verified successfully' } };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Email verification error:', errorMessage);
    return { status: 500, jsonBody: { success: false, error: 'VERIFICATION_FAILED', message: `Email verification failed: ${errorMessage}` } };
  }
}

export async function forgotPasswordHandler(req: HttpRequest): Promise<HttpResponseInit> {
  try {
    const rawBody = await readJsonBody<EmailBody>(req);
    if (!rawBody) {
      return validationError('Invalid JSON payload');
    }
    const parsedBody = emailOnlySchema.safeParse(rawBody);
    if (!parsedBody.success) {
      return validationError(formatZodError(parsedBody.error));
    }

    const user = await authRepo.findUserByEmail(parsedBody.data.email.toLowerCase());
    if (user) {
      const resetToken = generateVerificationToken();
      await authRepo.createAuditLog({
        userId: user.id,
        action: 'PASSWORD_RESET_REQUESTED',
        resourceType: 'USER',
        resourceId: user.id,
        changes: JSON.stringify({ email: user.email }),
        ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('client-ip') || null,
        userAgent: req.headers.get('user-agent') || null,
      });
      void resetToken;
      // TODO: integrate SendGrid/Azure Communication Services to send reset email with resetToken
    }
    return { status: 200, jsonBody: { success: true, message: 'If an account exists with this email, a password reset link will be sent' } };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Forgot password error:', errorMessage);
    return { status: 500, jsonBody: { success: false, error: 'FORGOT_PASSWORD_FAILED', message: `Forgot password failed: ${errorMessage}` } };
  }
}

export async function logoutHandler(req: HttpRequest): Promise<HttpResponseInit> {
  try {
    const token = extractTokenFromHeader(req.headers.get('authorization') || '');
    if (!token) return { status: 401, jsonBody: { success: false, error: 'UNAUTHORIZED', message: 'No authentication token provided' } };
    const payload = verifyAccessToken(token);
    if (!payload) return { status: 401, jsonBody: { success: false, error: 'INVALID_TOKEN', message: 'Invalid or expired token' } };
    await authRepo.deleteSessionsByUserId(payload.sub);
    await authRepo.createAuditLog({
      userId: payload.sub,
      action: 'USER_LOGOUT',
      resourceType: 'USER',
      resourceId: payload.sub,
      changes: JSON.stringify({ email: payload.email }),
      ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('client-ip') || null,
      userAgent: req.headers.get('user-agent') || null,
    });
    return { status: 200, jsonBody: { success: true, message: 'Logout successful' } };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Logout error:', errorMessage);
    return { status: 500, jsonBody: { success: false, error: 'LOGOUT_FAILED', message: `Logout failed: ${errorMessage}` } };
  }
}

export async function refreshTokenHandler(req: HttpRequest): Promise<HttpResponseInit> {
  try {
    const rawBody = await readJsonBody<RefreshBody>(req);
    if (!rawBody) {
      return validationError('Invalid JSON payload');
    }
    const parsedBody = refreshSchema.safeParse(rawBody);
    if (!parsedBody.success) {
      return validationError(formatZodError(parsedBody.error));
    }

    const { refreshToken } = parsedBody.data;
    const decoded = verifyRefreshToken(refreshToken);
    if (!decoded || !decoded.sub) return { status: 401, jsonBody: { success: false, error: 'INVALID_TOKEN', message: 'Invalid or expired refresh token' } };
    
    const sessions = await authRepo.findSessionsByUserId(decoded.sub, 10);
    let matchedSession: { id: string } | null = null;
    for (const s of sessions) { if (await validateSessionToken(refreshToken, s.refreshTokenHash)) { matchedSession = { id: s.id }; break; } }
    if (!matchedSession) return { status: 401, jsonBody: { success: false, error: 'SESSION_NOT_FOUND', message: 'Session not found or token has been rotated' } };
    
    const user = await authRepo.findUserById(decoded.sub);
    if (!user) return { status: 404, jsonBody: { success: false, error: 'USER_NOT_FOUND', message: 'User not found' } };
    
    const tokenPair = generateTokenPair({ sub: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName });
    const [newAccessHash, newRefreshHash] = await Promise.all([hashToken(tokenPair.accessToken), hashToken(tokenPair.refreshToken)]);
    const refreshExpiryMs = parseDurationMillis(process.env.JWT_REFRESH_EXPIRY || '7d');
    const newExpiresAt = new Date(Date.now() + (refreshExpiryMs || 7 * 24 * 60 * 60 * 1000));
    
    await authRepo.updateSession(matchedSession.id, {
      tokenHash: newAccessHash,
      refreshTokenHash: newRefreshHash,
      expiresAt: newExpiresAt,
    });
    
    await authRepo.createAuditLog({
      userId: user.id,
      action: 'TOKEN_REFRESH',
      resourceType: 'USER',
      resourceId: user.id,
      changes: null,
      ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('client-ip') || null,
      userAgent: req.headers.get('user-agent') || null,
    });
    return { status: 200, jsonBody: { success: true, data: { accessToken: tokenPair.accessToken, refreshToken: tokenPair.refreshToken }, message: 'Token refreshed' } };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Refresh token error:', errorMessage);
    return { status: 500, jsonBody: { success: false, error: 'REFRESH_FAILED', message: `Token refresh failed: ${errorMessage}` } };
  }
}

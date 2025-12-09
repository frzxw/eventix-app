import { HttpResponseInit } from '@azure/functions';

const DEFAULT_HEADERS = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
};

export function ok(body: any): HttpResponseInit {
  return { status: 200, jsonBody: body, headers: DEFAULT_HEADERS };
}

export function created(body: any): HttpResponseInit {
  return { status: 201, jsonBody: body, headers: DEFAULT_HEADERS };
}

export function badRequest(message: string): HttpResponseInit {
  return { status: 400, jsonBody: { success: false, error: 'BAD_REQUEST', message }, headers: DEFAULT_HEADERS };
}

export function unauthorized(message: string): HttpResponseInit {
  return { status: 401, jsonBody: { success: false, error: 'UNAUTHORIZED', message }, headers: DEFAULT_HEADERS };
}

export function notFound(message: string): HttpResponseInit {
  return { status: 404, jsonBody: { success: false, error: 'NOT_FOUND', message }, headers: DEFAULT_HEADERS };
}

export function conflict(message: string, extra?: Record<string, unknown>): HttpResponseInit {
  return {
    status: 409,
    jsonBody: { success: false, error: 'CONFLICT', message, ...(extra ?? {}) },
    headers: DEFAULT_HEADERS,
  };
}

export function fail(message: string): HttpResponseInit {
  return { status: 500, jsonBody: { success: false, error: 'SERVER_ERROR', message }, headers: DEFAULT_HEADERS };
}

export function tooManyRequests(retryAfter: number, message: string = 'Too many requests'): HttpResponseInit {
  return {
    status: 429,
    headers: {
      ...DEFAULT_HEADERS,
      'Retry-After': retryAfter.toString(),
    },
    jsonBody: {
      success: false,
      error: 'RATE_LIMIT_EXCEEDED',
      message,
    },
  };
}

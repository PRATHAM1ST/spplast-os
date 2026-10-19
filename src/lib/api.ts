import { NextResponse } from 'next/server';
export function apiError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Unexpected server error';
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  const status = message.includes('UNAUTHORIZED') ? 401 : message.includes('FORBIDDEN') ? 403 : message.includes('CONFLICT') ? 409 : message.includes('UNCONFIGURED') ? 503 : code === 'P0001' || code.startsWith('23') || (error instanceof Error && error.name === 'ZodError') ? 422 : 500;
  console.error(JSON.stringify({ event: 'request_failed', message: message.slice(0, 250), status }));
  return NextResponse.json({ error: status === 500 ? 'The server could not complete this request. Your local entry will retry.' : message.slice(0, 250) }, { status });
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  const expected = new URL(process.env.APP_URL || request.url).origin;
  if (!origin || origin !== expected) throw new Error('FORBIDDEN: Invalid request origin');
}

import 'server-only';
import { createNeonAuth } from '@neondatabase/auth/next/server';
let instance: ReturnType<typeof createNeonAuth> | undefined;
export const configured = () => Boolean(process.env.DATABASE_URL && process.env.NEON_AUTH_BASE_URL && process.env.NEON_AUTH_COOKIE_SECRET);
export function auth() {
  if (!process.env.NEON_AUTH_BASE_URL || !process.env.NEON_AUTH_COOKIE_SECRET) throw new Error('Neon authentication is not configured');
  return instance ??= createNeonAuth({ baseUrl: process.env.NEON_AUTH_BASE_URL, cookies: { secret: process.env.NEON_AUTH_COOKIE_SECRET, sessionDataTtl: 60 } });
}
export async function identity() {
  if (!configured()) throw new Error('UNCONFIGURED: Connect Neon in your environment');
  const { data } = await auth().getSession();
  if (!data?.user) throw new Error('UNAUTHORIZED: Sign in to continue');
  return { id: data.user.id, email: data.user.email, verified: data.user.emailVerified };
}

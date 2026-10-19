import { auth } from '@/lib/auth/server';
import { apiError } from '@/lib/api';
import type { NextRequest } from 'next/server';
type Context = { params: Promise<{ path: string[] }> };
export async function GET(request: NextRequest, context: Context) { try { return await auth().handler().GET(request, context); } catch (e) { return apiError(e); } }
export async function POST(request: NextRequest, context: Context) { try { return await auth().handler().POST(request, context); } catch (e) { return apiError(e); } }

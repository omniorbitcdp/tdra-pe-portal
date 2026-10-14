import { NextResponse } from 'next/server';
import { clearSessionCookie } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  clearSessionCookie();
  return NextResponse.redirect(new URL('/login', process.env.APP_BASE_URL ?? 'http://localhost:3000'));
}

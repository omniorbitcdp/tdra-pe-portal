import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@/lib/constants';
import { verifySessionToken } from '@/lib/session';

const PROTECTED: Array<{ prefix: string; roles: string[] }> = [
  { prefix: '/pe', roles: ['PE'] },
  { prefix: '/operator', roles: ['OPERATOR_KYC', 'OPERATOR_HEADER', 'OPERATOR_TEMPLATE_URL'] },
  { prefix: '/admin', roles: ['ADMIN'] },
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const rule = PROTECTED.find((r) => pathname === r.prefix || pathname.startsWith(r.prefix + '/'));
  if (!rule) return NextResponse.next();

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySessionToken(token) : null;
  if (!session) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }
  // Admins may read operator queues; keep strict separation otherwise.
  const allowedRoles = session.role === 'ADMIN' ? [...rule.roles, 'ADMIN'] : rule.roles;
  if (!allowedRoles.includes(session.role)) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ['/pe/:path*', '/operator/:path*', '/admin/:path*'] };

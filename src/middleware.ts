import { NextRequest, NextResponse } from 'next/server';
import { HOME_FOR_ROLE, SESSION_COOKIE, type Role } from '@/lib/constants';
import { verifySessionToken } from '@/lib/session';

// Every protected area and the roles allowed in it. ADMIN may enter the operator
// queues (read + act) but operator roles stay strictly inside their own queues.
const PROTECTED: Array<{ prefix: string; roles: Role[] }> = [
  { prefix: '/pe', roles: ['PE'] },
  { prefix: '/operator', roles: ['OPERATOR_KYC', 'OPERATOR_HEADER', 'OPERATOR_TEMPLATE_URL', 'ADMIN'] },
  { prefix: '/admin', roles: ['ADMIN'] },
];

// Queue managers may only open the queue they own; ADMIN may open all.
const OPERATOR_PATHS: Array<{ prefix: string; roles: Role[] }> = [
  { prefix: '/operator/kyc', roles: ['OPERATOR_KYC', 'ADMIN'] },
  { prefix: '/operator/headers', roles: ['OPERATOR_HEADER', 'ADMIN'] },
  { prefix: '/operator/templates', roles: ['OPERATOR_TEMPLATE_URL', 'ADMIN'] },
  { prefix: '/operator/urls', roles: ['OPERATOR_TEMPLATE_URL', 'ADMIN'] },
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const area = PROTECTED.find((r) => pathname === r.prefix || pathname.startsWith(r.prefix + '/'));
  if (!area) return NextResponse.next();

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySessionToken(token) : null;

  if (!session) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }
  if (!area.roles.includes(session.role)) return bounceTo(req, session.role);

  // Queue-level scope check
  const queue = OPERATOR_PATHS.find((r) => pathname === r.prefix || pathname.startsWith(r.prefix + '/'));
  if (queue && !queue.roles.includes(session.role)) return bounceTo(req, session.role);

  return NextResponse.next();
}

/** Signed in but not permitted here — return the user to their own workbench. */
function bounceTo(req: NextRequest, role: Role) {
  const url = req.nextUrl.clone();
  url.pathname = HOME_FOR_ROLE[role] ?? '/login';
  url.search = '';
  url.searchParams.set('denied', '1');
  return NextResponse.redirect(url);
}

export const config = { matcher: ['/pe/:path*', '/operator/:path*', '/admin/:path*'] };

import { NextRequest, NextResponse } from 'next/server';
import { HOME_FOR_ROLE, SESSION_COOKIE, type Role } from '@/lib/constants';
import { verifySessionToken } from '@/lib/session';

// Every protected area and the roles allowed in it. ADMIN may enter the operator
// queues (read + act) but operator roles stay strictly inside their own queues.
const PROTECTED: Array<{ prefix: string; roles: Role[] }> = [
  { prefix: '/pe', roles: ['PE'] },
  { prefix: '/operator', roles: ['OPERATOR_KYC', 'OPERATOR_HEADER', 'OPERATOR_TEMPLATE_URL', 'ADMIN'] },
  { prefix: '/admin', roles: ['ADMIN'] },
  // API namespaces mirror their UI areas: a signed-in user of the wrong role is
  // stopped at the edge, so a route handler that forgot its own guard() still
  // cannot leak another tenant's data.
  { prefix: '/api/pe', roles: ['PE'] },
  { prefix: '/api/operator', roles: ['OPERATOR_KYC', 'OPERATOR_HEADER', 'OPERATOR_TEMPLATE_URL', 'ADMIN'] },
  { prefix: '/api/admin', roles: ['ADMIN'] },
];

// Endpoints that serve more than one area BY DESIGN. They are listed explicitly,
// so the edge stays strict everywhere else. The handler still applies its own,
// finer-grained check — a PE may only ever read a document belonging to its own
// entity. Without these entries the reviewer screens cannot preview documents,
// because the KYC review page reads them through the shared PE document route.
const SHARED: Array<{ prefix: string; roles: Role[] }> = [
  { prefix: '/api/pe/kyc/file', roles: ['PE', 'OPERATOR_KYC', 'ADMIN'] },
];

// Queue managers may only open the queue they own; ADMIN may open all.
const OPERATOR_PATHS: Array<{ prefix: string; roles: Role[] }> = [
  { prefix: '/operator/kyc', roles: ['OPERATOR_KYC', 'ADMIN'] },
  { prefix: '/operator/headers', roles: ['OPERATOR_HEADER', 'ADMIN'] },
  { prefix: '/operator/templates', roles: ['OPERATOR_TEMPLATE_URL', 'ADMIN'] },
  { prefix: '/operator/urls', roles: ['OPERATOR_TEMPLATE_URL', 'ADMIN'] },
];

function matches<T extends { prefix: string }>(list: T[], pathname: string): T | undefined {
  return list.find((r) => pathname === r.prefix || pathname.startsWith(r.prefix + '/'));
}

const isApi = (pathname: string) => pathname.startsWith('/api/');

/** API callers get a JSON error, never an HTML redirect. */
function denyApi(status: 401 | 403, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const area = matches(PROTECTED, pathname);
  if (!area) return NextResponse.next();

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySessionToken(token) : null;

  if (!session) {
    if (isApi(pathname)) return denyApi(401, 'Authentication required.');
    return toLogin(req, pathname);
  }

  // A shared endpoint widens the area's role list; everything else uses the
  // area's own list.
  const shared = matches(SHARED, pathname);
  const allowed = shared ? shared.roles : area.roles;

  if (!allowed.includes(session.role)) {
    if (isApi(pathname)) return denyApi(403, 'Your role cannot access this resource.');
    return bounceTo(req, session.role);
  }

  // Queue-level scope check (UI pages only — the API scopes by module itself).
  const queue = matches(OPERATOR_PATHS, pathname);
  if (queue && !queue.roles.includes(session.role)) {
    if (isApi(pathname)) return denyApi(403, 'Your role cannot access this queue.');
    return bounceTo(req, session.role);
  }

  return NextResponse.next();
}

function toLogin(req: NextRequest, pathname: string) {
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = '';
  url.searchParams.set('next', pathname);
  return NextResponse.redirect(url);
}

/** Signed in but not permitted here — return the user to their own workbench. */
function bounceTo(req: NextRequest, role: Role) {
  const url = req.nextUrl.clone();
  url.pathname = HOME_FOR_ROLE[role] ?? '/login';
  url.search = '';
  url.searchParams.set('denied', '1');
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    '/pe/:path*', '/operator/:path*', '/admin/:path*',
    '/api/pe/:path*', '/api/operator/:path*', '/api/admin/:path*',
  ],
};

import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { json, badRequest, serverError, unauthorized } from '@/lib/http';
import { hashPassword, verifyPassword, passwordPolicyErrors } from '@/lib/password';
import { generateOtp, randomToken, sha256Hex } from '@/lib/crypto';
import { setSessionCookie, clearSessionCookie, getSession, homeForRole } from '@/lib/auth';
import { loginSchema, registerSchema } from '@/lib/validation';
import { logAudit } from '@/lib/audit';
import { sendNotification } from '@/lib/notify';
import { rateLimit, clientIp } from '@/lib/rateLimit';
import type { AppUser } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_ATTEMPTS = Number(process.env.MAX_LOGIN_ATTEMPTS ?? '5');
const LOCK_MINUTES = Number(process.env.LOCKOUT_MINUTES ?? '15');
// Sliding-window limits per client IP (best-effort; see rateLimit.ts).
const LIMITS = {
  login: { max: 15, windowMs: 5 * 60_000 },
  register: { max: 10, windowMs: 60 * 60_000 },
  forgot: { max: 5, windowMs: 15 * 60_000 },
} as const;

function tooMany(retryAfter: number) {
  return json({ ok: false, error: `Too many attempts. Please try again in ${retryAfter} seconds.` }, 429);
}

export async function POST(req: NextRequest, { params }: { params: { action: string } }) {
  try {
    const action = params.action;
    const ip = clientIp(req.headers);

    if (action === 'register') {
      const rl = rateLimit(`register:${ip}`, LIMITS.register);
      if (!rl.ok) return tooMany(rl.retryAfterSeconds);

      const body = await req.json().catch(() => ({}));
      const parsed = registerSchema.safeParse(body);
      if (!parsed.success) return badRequest('Validation failed', { errors: flatten(parsed.error) });
      const { email, password, full_name, phone } = parsed.data;
      const policy = passwordPolicyErrors(password);
      if (policy.length) return badRequest('Password does not meet policy', { errors: { password: policy.join('. ') } });

      const { data: existing } = await db().from('app_users').select('id').eq('email', email).maybeSingle();
      if (existing) return badRequest('An account with this email already exists.');

      // No email-activation step: the account is ACTIVE as soon as it is created,
      // so email + password alone are enough to sign in.
      const password_hash = await hashPassword(password);
      const now = new Date().toISOString();
      const { data: user, error } = await db()
        .from('app_users')
        .insert({
          email, password_hash, full_name, phone, role: 'PE',
          status: 'ACTIVE', password_changed_at: now,
        })
        .select('*').single();
      if (error) return badRequest(error.message);

      await logAudit({ entity_id: null, module: 'ACCOUNT', record_id: user.id, action: 'CREATE', actor_id: user.id, actor_name: full_name, actor_email: email, actor_role: 'PE', from_status: null, to_status: 'ACTIVE', remarks: 'Self-registration' });
      return json({ ok: true, message: 'Account created. You can sign in now with your email and password.' });
    }

    if (action === 'login') {
      const rl = rateLimit(`login:${ip}`, LIMITS.login);
      if (!rl.ok) return tooMany(rl.retryAfterSeconds);

      const body = await req.json().catch(() => ({}));
      const parsed = loginSchema.safeParse(body);
      if (!parsed.success) return badRequest('Validation failed', { errors: flatten(parsed.error) });
      const { email, password, portal } = parsed.data;

      const { data: user } = await db().from('app_users').select('*').eq('email', email).maybeSingle<AppUser>();
      if (!user) return unauthorized('Invalid email or password.');
      if (user.status === 'DISABLED') return unauthorized('This account is disabled. Contact the administrator.');
      if (user.locked_until && new Date(user.locked_until) > new Date()) {
        return json({ ok: false, error: 'Account temporarily locked due to failed attempts. Try again later.' }, 423);
      }

      const okPw = await verifyPassword(password, user.password_hash);
      if (!okPw) {
        const attempts = (user.failed_login_attempts ?? 0) + 1;
        const patch: Record<string, unknown> = { failed_login_attempts: attempts };
        if (attempts >= MAX_ATTEMPTS) patch.locked_until = new Date(Date.now() + LOCK_MINUTES * 60000).toISOString();
        await db().from('app_users').update(patch).eq('id', user.id);
        await logAudit({ entity_id: user.entity_id, module: 'AUTH', record_id: user.id, action: 'LOGIN_FAILED', actor_id: user.id, actor_name: user.full_name ?? null, actor_email: email, actor_role: user.role, from_status: null, to_status: null, remarks: `Failed attempt ${attempts}` });
        return unauthorized('Invalid email or password.');
      }

      // The account must belong to the door it came through: a business account
      // cannot sign in at the Telco tab, and a reviewer cannot use the
      // Enterprise tab. Checked only after the password verified, so the
      // message never reveals whether an address exists.
      if (portal === 'ENTERPRISE' && user.role !== 'PE') {
        return json({ ok: false, error: 'This account signs in from the Telco tab.' }, 403);
      }
      if (portal === 'TELCO' && user.role === 'PE') {
        return json({ ok: false, error: 'This account signs in from the Enterprise tab.' }, 403);
      }

      // A legacy PENDING_ACTIVATION row (from the retired activation flow) is
      // simply activated on first valid login. Compared as a string because the
      // status is no longer part of the AccountStatus union.
      const legacyPending = (user.status as string) === 'PENDING_ACTIVATION';
      const activateLegacy = legacyPending;
      await db().from('app_users').update({
        failed_login_attempts: 0, locked_until: null, last_login_at: new Date().toISOString(),
        ...(activateLegacy ? { status: 'ACTIVE' } : {}),
      }).eq('id', user.id);

      await setSessionCookie({ uid: user.id, email: user.email, role: user.role, entityId: user.entity_id, name: user.full_name ?? undefined });
      await logAudit({ entity_id: user.entity_id, module: 'AUTH', record_id: user.id, action: 'LOGIN', actor_id: user.id, actor_name: user.full_name ?? null, actor_email: user.email, actor_role: user.role, from_status: null, to_status: null, remarks: null });
      return json({ ok: true, role: user.role, redirect: homeForRole(user.role) });
    }

    if (action === 'logout') {
      const s = await getSession();
      if (s) await logAudit({ entity_id: s.entityId, module: 'AUTH', record_id: s.uid, action: 'LOGOUT', actor_id: s.uid, actor_email: s.email, actor_name: s.name ?? null, actor_role: s.role, from_status: null, to_status: null, remarks: null });
      clearSessionCookie();
      return json({ ok: true });
    }

    // Password reset only — there is no activation action.
    if (action === 'reset') {
      const body = await req.json().catch(() => ({}));
      const token = String(body.token ?? '');
      const password = String(body.password ?? '');
      if (!token || !password) return badRequest('Token and new password are required.');
      const policy = passwordPolicyErrors(password);
      if (policy.length) return badRequest('Password does not meet policy', { errors: { password: policy.join('. ') } });

      const { data: rows } = await db().from('auth_tokens').select('*')
        .eq('token_hash', sha256Hex(token)).eq('purpose', 'PASSWORD_RESET').is('used_at', null).limit(1);
      const row = rows?.[0];
      if (!row) return badRequest('This link is invalid or has already been used.');
      if (new Date(row.expires_at) < new Date()) return badRequest('This link has expired. Please request a new one.');

      const password_hash = await hashPassword(password);
      await db().from('app_users').update({ password_hash, status: 'ACTIVE', password_changed_at: new Date().toISOString(), failed_login_attempts: 0, locked_until: null }).eq('id', row.user_id);
      await db().from('auth_tokens').update({ used_at: new Date().toISOString() }).eq('id', row.id);
      const { data: user } = await db().from('app_users').select('*').eq('id', row.user_id).maybeSingle<AppUser>();
      if (user) await logAudit({ entity_id: user.entity_id, module: 'ACCOUNT', record_id: user.id, action: 'PASSWORD_RESET', actor_id: user.id, actor_name: user.full_name ?? null, actor_email: user.email, actor_role: user.role, from_status: null, to_status: 'ACTIVE', remarks: null });
      return json({ ok: true, message: 'Your password has been set. You can now sign in.' });
    }

    if (action === 'forgot') {
      const rl = rateLimit(`forgot:${ip}`, LIMITS.forgot);
      if (!rl.ok) return tooMany(rl.retryAfterSeconds);

      const body = await req.json().catch(() => ({}));
      const email = String(body.email ?? '').trim().toLowerCase();
      const { data: user } = await db().from('app_users').select('*').eq('email', email).maybeSingle<AppUser>();
      if (user) {
        const raw = randomToken(32);
        await db().from('auth_tokens').insert({ user_id: user.id, purpose: 'PASSWORD_RESET', token_hash: sha256Hex(raw), otp_code: generateOtp(6), expires_at: new Date(Date.now() + 2 * 3600 * 1000).toISOString() });
        const base = process.env.APP_BASE_URL ?? 'http://localhost:3000';
        const link = `${base}/reset?token=${raw}&email=${encodeURIComponent(email)}`;
        await sendNotification({ event: 'PASSWORD_RESET', channel: 'EMAIL', recipient: email, vars: { recipient: email, subject: 'Reset your TDRA PE portal password', body: `Reset your password: ${link}`, link } }).catch(() => undefined);
      }
      return json({ ok: true, message: 'If the account exists, a reset link has been sent.' });
    }

    return json({ ok: false, error: 'Unknown action' }, 404);
  } catch (e) {
    return serverError(e);
  }
}

export async function GET(_req: NextRequest, { params }: { params: { action: string } }) {
  if (params.action === 'me') {
    const s = await getSession();
    if (!s) return unauthorized();
    return json({ ok: true, session: s });
  }
  return json({ ok: false, error: 'Unknown action' }, 404);
}

function flatten(err: { issues: Array<{ path: (string | number)[]; message: string }> }) {
  const out: Record<string, string> = {};
  for (const i of err.issues) out[i.path.join('.') || '_'] = i.message;
  return out;
}

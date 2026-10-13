import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { json, badRequest, serverError, unauthorized } from '@/lib/http';
import { hashPassword, verifyPassword, passwordPolicyErrors } from '@/lib/password';
import { generateOtp, randomToken, sha256Hex } from '@/lib/crypto';
import { setSessionCookie, clearSessionCookie, getSession } from '@/lib/auth';
import { homeForRole } from '@/lib/auth';
import { loginSchema, registerSchema } from '@/lib/validation';
import { logAudit } from '@/lib/audit';
import { sendNotification } from '@/lib/notify';
import type { AppUser } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_ATTEMPTS = Number(process.env.MAX_LOGIN_ATTEMPTS ?? '5');
const LOCK_MINUTES = Number(process.env.LOCKOUT_MINUTES ?? '15');

export async function POST(req: NextRequest, { params }: { params: { action: string } }) {
  try {
    const action = params.action;

    if (action === 'register') {
      const body = await req.json().catch(() => ({}));
      const parsed = registerSchema.safeParse(body);
      if (!parsed.success) return badRequest('Validation failed', { errors: flatten(parsed.error) });
      const { email, password, full_name, phone } = parsed.data;
      const policy = passwordPolicyErrors(password);
      if (policy.length) return badRequest('Password does not meet policy', { errors: { password: policy.join('. ') } });

      const { data: existing } = await db().from('app_users').select('id').eq('email', email).maybeSingle();
      if (existing) return badRequest('An account with this email already exists.');

      const password_hash = await hashPassword(password);
      const { data: user, error } = await db()
        .from('app_users')
        .insert({ email, password_hash, full_name, phone, role: 'PE', status: 'PENDING_ACTIVATION' })
        .select('*').single();
      if (error) return badRequest(error.message);

      const raw = randomToken(32);
      await db().from('auth_tokens').insert({
        user_id: user.id, purpose: 'ACTIVATION', token_hash: sha256Hex(raw),
        otp_code: generateOtp(6), expires_at: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
      });
      const base = process.env.APP_BASE_URL ?? 'http://localhost:3000';
      const link = `${base}/activate?token=${raw}&email=${encodeURIComponent(email)}`;
      await sendNotification({
        event: 'ACCOUNT_ACTIVATION', channel: 'EMAIL', recipient: email,
        vars: { recipient: email, subject: 'Activate your TDRA PE portal account', body: `Welcome ${full_name}. Activate your account: ${link}`, link, name: full_name },
      }).catch(() => undefined);

      await logAudit({ entity_id: null, module: 'ACCOUNT', record_id: user.id, action: 'CREATE', actor_id: user.id, actor_email: email, actor_role: 'PE', from_status: null, to_status: 'PENDING_ACTIVATION', remarks: 'Self-registration' });
      // In non-production, return the activation link so testing is possible without a live mail provider.
      return json({ ok: true, message: 'Account created. Check your email for the activation link.', activation_link: process.env.NODE_ENV === 'production' ? undefined : link });
    }

    if (action === 'login') {
      const body = await req.json().catch(() => ({}));
      const parsed = loginSchema.safeParse(body);
      if (!parsed.success) return badRequest('Validation failed', { errors: flatten(parsed.error) });
      const { email, password } = parsed.data;

      const { data: user } = await db().from('app_users').select('*').eq('email', email).maybeSingle<AppUser>();
      // Constant-ish response to avoid user enumeration.
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
        await logAudit({ entity_id: user.entity_id, module: 'AUTH', record_id: user.id, action: 'LOGIN_FAILED', actor_id: user.id, actor_email: email, actor_role: user.role, from_status: null, to_status: null, remarks: `Failed attempt ${attempts}` });
        return unauthorized('Invalid email or password.');
      }

      if (user.status === 'PENDING_ACTIVATION') return forbiddenJson('Please activate your account using the link sent to your email.');

      await db().from('app_users').update({ failed_login_attempts: 0, locked_until: null, last_login_at: new Date().toISOString() }).eq('id', user.id);
      await setSessionCookie({ uid: user.id, email: user.email, role: user.role, entityId: user.entity_id, name: user.full_name ?? undefined });
      await logAudit({ entity_id: user.entity_id, module: 'AUTH', record_id: user.id, action: 'LOGIN', actor_id: user.id, actor_email: user.email, actor_role: user.role, from_status: null, to_status: null, remarks: null });
      return json({ ok: true, role: user.role, redirect: homeForRole(user.role) });
    }

    if (action === 'logout') {
      const s = await getSession();
      if (s) await logAudit({ entity_id: s.entityId, module: 'AUTH', record_id: s.uid, action: 'LOGOUT', actor_id: s.uid, actor_email: s.email, actor_role: s.role, from_status: null, to_status: null, remarks: null });
      clearSessionCookie();
      return json({ ok: true });
    }

    if (action === 'activate' || action === 'reset') {
      const body = await req.json().catch(() => ({}));
      const token = String(body.token ?? '');
      const password = String(body.password ?? '');
      if (!token || !password) return badRequest('Token and new password are required.');
      const policy = passwordPolicyErrors(password);
      if (policy.length) return badRequest('Password does not meet policy', { errors: { password: policy.join('. ') } });

      const purpose = action === 'activate' ? 'ACTIVATION' : 'PASSWORD_RESET';
      const hash = sha256Hex(token);
      const { data: rows } = await db().from('auth_tokens').select('*').eq('token_hash', hash).eq('purpose', purpose).is('used_at', null).limit(1);
      const row = rows?.[0];
      if (!row) return badRequest('This link is invalid or has already been used.');
      if (new Date(row.expires_at) < new Date()) return badRequest('This link has expired. Please request a new one.');

      const password_hash = await hashPassword(password);
      await db().from('app_users').update({ password_hash, status: 'ACTIVE', password_changed_at: new Date().toISOString(), failed_login_attempts: 0, locked_until: null }).eq('id', row.user_id);
      await db().from('auth_tokens').update({ used_at: new Date().toISOString() }).eq('id', row.id);

      const { data: user } = await db().from('app_users').select('*').eq('id', row.user_id).maybeSingle<AppUser>();
      if (user) await logAudit({ entity_id: user.entity_id, module: 'ACCOUNT', record_id: user.id, action: action === 'activate' ? 'ACTIVATE' : 'PASSWORD_RESET', actor_id: user.id, actor_email: user.email, actor_role: user.role, from_status: null, to_status: 'ACTIVE', remarks: null });
      return json({ ok: true, message: 'Your password has been set. You can now sign in.' });
    }

    if (action === 'forgot') {
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

function forbiddenJson(message: string) {
  return json({ ok: false, error: message }, 403);
}

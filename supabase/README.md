# Supabase setup

1. Create a project.
2. SQL Editor → run `schema.sql` (tables, triggers, RLS, storage bucket) → then `seed.sql`.
3. Copy the Project URL + anon + service_role keys into `.env.local` (and Vercel env vars).

`seed.sql` is idempotent (safe to re-run) and uses `pgcrypto` `crypt()`/`gen_salt('bf')` for bcrypt hashes,
so demo logins work immediately.

Demo credentials are listed at the top of `seed.sql` and in the root `README.md`.

import { vi, beforeAll } from 'vitest';
import { mockClient } from './mockDb';

process.env.SESSION_SECRET = 'test-secret-value-at-least-32-characters-long';
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service';

// Every route reaches the database through @/lib/db.
vi.mock('@/lib/db', () => ({ db: () => mockClient }));

beforeAll(() => { process.env.SETTINGS_CACHE_TTL_MS = '0'; });

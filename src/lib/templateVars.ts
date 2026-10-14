/**
 * SMS template variables.
 *
 * A template body declares placeholders in the <varN> form, e.g.
 *   "Dear <var1>, your order <var2> is ready."
 * Variables are numbered from 1 and every declared variable carries a sample
 * value so the approver can read the message exactly as a subscriber would.
 */

const TOKEN = /<var(\d+)>/g;

/** Distinct variable names in numeric order: "<var2> <var1>" -> ['var1','var2']. */
export function extractVariables(body: string): string[] {
  const seen = new Set<number>();
  for (const m of body.matchAll(TOKEN)) seen.add(Number(m[1]));
  return Array.from(seen).sort((a, b) => a - b).map((n) => `var${n}`);
}

/** The next free token to offer the author, e.g. 'var3'. */
export function nextVariable(body: string): string {
  const nums = extractVariables(body).map((v) => Number(v.slice(3)));
  return `var${(nums.length ? Math.max(...nums) : 0) + 1}`;
}

/** Insert a token at the caret, returning the new body and caret position. */
export function insertVariable(body: string, caret: number, token: string) {
  const at = Math.max(0, Math.min(caret, body.length));
  const next = `${body.slice(0, at)}<${token}>${body.slice(at)}`;
  return { body: next, caret: at + token.length + 2 };
}

/** Only keep samples for variables that are actually declared in the body. */
export function normaliseSamples(body: string, samples: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const v of extractVariables(body)) out[v] = (samples[v] ?? '').toString();
  return out;
}

/** Split a body into literal text and variable tokens, for display. */
export interface BodyPart { text: string; isVar: boolean; name?: string }
export function tokenise(body: string): BodyPart[] {
  const parts: BodyPart[] = [];
  let last = 0;
  for (const m of body.matchAll(TOKEN)) {
    const i = m.index ?? 0;
    if (i > last) parts.push({ text: body.slice(last, i), isVar: false });
    parts.push({ text: m[0], isVar: true, name: `var${m[1]}` });
    last = i + m[0].length;
  }
  if (last < body.length) parts.push({ text: body.slice(last), isVar: false });
  return parts;
}

/** Substitute samples into the body; a variable without a sample keeps its token. */
export function renderWithSamples(body: string, samples: Record<string, string>): string {
  return body.replace(TOKEN, (token, n: string) => {
    const sample = samples[`var${n}`];
    return sample && sample.trim() ? sample : token;
  });
}

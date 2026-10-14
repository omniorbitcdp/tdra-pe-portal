import { describe, it, expect } from 'vitest';
import { extractVariables, nextVariable, insertVariable, normaliseSamples, renderWithSamples, tokenise } from '@/lib/templateVars';

describe('extractVariables', () => {
  it('returns declared variables in numeric order', () => {
    expect(extractVariables('Dear <var2>, order <var1> shipped')).toEqual(['var1', 'var2']);
  });
  it('de-duplicates repeated tokens', () => {
    expect(extractVariables('<var1> and <var1> again')).toEqual(['var1']);
  });
  it('is empty for a body with no variables', () => {
    expect(extractVariables('Plain SMS text')).toEqual([]);
  });
  it('ignores {{name}} style placeholders', () => {
    expect(extractVariables('Hi {{name}}')).toEqual([]);
  });
});

describe('nextVariable', () => {
  it('starts at var1', () => expect(nextVariable('')).toBe('var1'));
  it('continues past the highest declared number', () => {
    expect(nextVariable('a <var1> b <var3>')).toBe('var4');
  });
});

describe('insertVariable', () => {
  it('inserts at the caret and reports the new caret', () => {
    const r = insertVariable('Dear , hello', 5, 'var1');
    expect(r.body).toBe('Dear <var1>, hello');
    expect(r.caret).toBe(11);
  });
  it('appends when the caret is at the end', () => {
    expect(insertVariable('Hi ', 3, 'var1').body).toBe('Hi <var1>');
  });
});

describe('normaliseSamples', () => {
  it('keeps only declared variables', () => {
    expect(normaliseSamples('Hi <var1>', { var1: 'Puneet', var9: 'stray' })).toEqual({ var1: 'Puneet' });
  });
  it('defaults a missing sample to an empty string', () => {
    expect(normaliseSamples('<var1> <var2>', { var1: 'A' })).toEqual({ var1: 'A', var2: '' });
  });
});

describe('renderWithSamples', () => {
  it('substitutes sample content', () => {
    expect(renderWithSamples('Dear <var1>, order <var2>', { var1: 'Puneet', var2: 'ORD-1' })).toBe('Dear Puneet, order ORD-1');
  });
  it('leaves the token when no sample is supplied', () => {
    expect(renderWithSamples('Dear <var1>', {})).toBe('Dear <var1>');
  });
});

describe('tokenise', () => {
  it('splits literal text and variables', () => {
    expect(tokenise('Hi <var1>!')).toEqual([
      { text: 'Hi ', isVar: false },
      { text: '<var1>', isVar: true, name: 'var1' },
      { text: '!', isVar: false },
    ]);
  });
  it('round-trips the original body', () => {
    const body = 'A <var1> B <var2> C';
    expect(tokenise(body).map((p) => p.text).join('')).toBe(body);
  });
});

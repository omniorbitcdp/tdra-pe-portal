/**
 * Status wording must follow the record's real status. Regression: the actions
 * column once said "Under review" for APPROVED records too.
 */
import { describe, it, expect } from 'vitest';
import { lockNote, statusLockLabel, isEditable, EDITABLE_STATUSES, REG_STATUSES } from '@/lib/constants';

describe('lockNote', () => {
  it('an approved record is never called "under review"', () => {
    expect(lockNote('APPROVED')).toBe('Approved · locked');
    expect(lockNote('APPROVED')).not.toMatch(/under review/i);
  });

  it('a submitted / in-review / resubmitted record reads "Under review"', () => {
    for (const s of ['SUBMITTED', 'UNDER_REVIEW', 'RESUBMITTED']) {
      expect(lockNote(s), s).toBe('Under review');
    }
  });

  it('editable statuses never produce a lock note that contradicts them', () => {
    for (const s of EDITABLE_STATUSES) {
      expect(lockNote(s), s).not.toMatch(/locked|under review/i);
    }
  });

  it('every status in the domain has a sensible note', () => {
    for (const s of REG_STATUSES) {
      const note = lockNote(s);
      expect(note, s).toBeTruthy();
      if (s === 'APPROVED') expect(note).toMatch(/approved/i);
      if (['SUBMITTED', 'UNDER_REVIEW', 'RESUBMITTED'].includes(s)) expect(note).toMatch(/under review/i);
    }
  });
});

describe('statusLockLabel (used in the 409 refusal message)', () => {
  it('distinguishes approved from under review', () => {
    expect(statusLockLabel('APPROVED')).toBe('approved');
    expect(statusLockLabel('SUBMITTED')).toBe('under review');
    expect(statusLockLabel('RESUBMITTED')).toBe('under review');
  });
});

describe('isEditable', () => {
  it('approved and in-review records are not editable', () => {
    for (const s of ['APPROVED', 'SUBMITTED', 'UNDER_REVIEW', 'RESUBMITTED']) {
      expect(isEditable(s), s).toBe(false);
    }
  });
  it('draft, clarification and rejected records are editable', () => {
    for (const s of ['DRAFT', 'CLARIFICATION_REQUIRED', 'REJECTED']) {
      expect(isEditable(s), s).toBe(true);
    }
  });
});

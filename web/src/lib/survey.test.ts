import { describe, expect, it } from 'vitest';
import { decodeSurvey, encodeSurvey, summarize, susGrade, susScore } from './survey';

describe('SUS survey', () => {
  it('scores the standard way (odd: answer-1, even: 5-answer, x2.5)', () => {
    expect(susScore([5, 1, 5, 1, 5, 1, 5, 1, 5, 1])).toBe(100);
    expect(susScore([1, 5, 1, 5, 1, 5, 1, 5, 1, 5])).toBe(0);
    expect(susScore([3, 3, 3, 3, 3, 3, 3, 3, 3, 3])).toBe(50);
    expect(susScore([4, 2, 4, 1, 4, 2, 5, 2, 4, 2])).toBe(80);
  });

  it('rejects incomplete answers', () => {
    expect(() => susScore([5, 1, 5])).toThrow();
    expect(() => susScore([0, 1, 5, 1, 5, 1, 5, 1, 5, 1])).toThrow();
  });

  it('grades with the adjective scale', () => {
    expect(susGrade(90).label).toBe('Excellent');
    expect(susGrade(75).grade).toBe('B');
    expect(susGrade(60).label).toBe('OK');
    expect(susGrade(20).grade).toBe('F');
  });

  it('round-trips through the feedback message, keeping the comment safe', () => {
    const msg = encodeSurvey({ sus: [4, 2, 4, 1, 4, 2, 5, 2, 4, 2], features: { rec: 5, gen: 4, safe: 5 }, comment: 'Great | but\nslow' });
    const back = decodeSurvey(msg);
    expect(back?.score).toBe(80);
    expect(back?.features).toEqual({ rec: 5, gen: 4, safe: 5 });
    expect(back?.comment).toBe('Great / but slow');
    expect(decodeSurvey('Some other feedback')).toBeNull();
  });

  it('summarises many responses', () => {
    const a = encodeSurvey({ sus: [5, 1, 5, 1, 5, 1, 5, 1, 5, 1], features: { rec: 5, gen: 5, safe: 5 }, comment: 'Love it' });
    const b = encodeSurvey({ sus: [3, 3, 3, 3, 3, 3, 3, 3, 3, 3], features: { rec: 3, gen: 4, safe: 5 }, comment: '' });
    const s = summarize([{ message: a, created_at: '2026-11-20' }, { message: b, created_at: '2026-11-21' }, { message: 'bug report', created_at: 'x' }]);
    expect(s?.responses).toBe(2);
    expect(s?.averageSus).toBe(75);
    expect(s?.grade.label).toBe('Good');
    expect(s?.features.rec).toBe(4);
    expect(s?.comments).toHaveLength(1);
  });
});

import { describe, expect, it } from 'vitest';
import { stepDuration, tastePercentages, timeSplit } from './GenerateRecipePage';

describe('generated recipe helpers', () => {
  it('reads the time a step states, and nothing when it gives none', () => {
    expect(stepDuration('Add tomatoes and cook until the oil separates (8–10 minutes).')).toEqual({ min: 8, max: 10 });
    expect(stepDuration('Stir in garlic and cook for 1 minute.')).toEqual({ min: 1, max: 1 });
    expect(stepDuration('Simmer for 1 hour.')).toEqual({ min: 60, max: 60 });
    expect(stepDuration('Add slit green chilli and cook 1 more minute.')).toEqual({ min: 1, max: 1 });
    expect(stepDuration('Garnish with coriander and serve hot.')).toBeNull();
  });

  it('splits prep (soak/marinate steps) from cooking time without passing the total', () => {
    const recipe = { minutes: 50, steps: ['Wash rice and soak for 30 minutes.', 'Fry the onion until deep golden (8–10 minutes).', 'Serve.'] };
    expect(timeSplit(recipe)).toEqual({ prep: 30, cook: 20, total: 50 });
    expect(timeSplit({ minutes: 20, steps: ['Marinate for 40 minutes.'] }).cook).toBe(0);
  });

  it('turns 0–10 taste intensities into percentages', () => {
    const p = tastePercentages({ sweet: 1.2, salty: 6, sour: 0, spicy: 10 });
    expect(p.map((t) => t.percent)).toEqual([12, 60, 0, 100]);
    expect(tastePercentages(undefined).every((t) => t.percent === 0)).toBe(true);
  });
});

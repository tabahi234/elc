// COMSATS absolute grading scale (edit if your department uses a different one)
export const GRADE_SCALE = [
  { letter: 'A',  min: 85, points: 4.00 },
  { letter: 'A-', min: 80, points: 3.67 },
  { letter: 'B+', min: 75, points: 3.33 },
  { letter: 'B',  min: 71, points: 3.00 },
  { letter: 'B-', min: 68, points: 2.67 },
  { letter: 'C+', min: 64, points: 2.33 },
  { letter: 'C',  min: 61, points: 2.00 },
  { letter: 'C-', min: 58, points: 1.67 },
  { letter: 'D+', min: 54, points: 1.33 },
  { letter: 'D',  min: 50, points: 1.00 },
  { letter: 'F',  min: 0,  points: 0.00 }
];

// Typical COMSATS theory-course breakdown
export const DEFAULT_COMPONENTS = [
  { name: 'Quizzes',      weight: 15, obtained: '', total: '' },
  { name: 'Assignments',  weight: 10, obtained: '', total: '' },
  { name: 'Sessional I',  weight: 10, obtained: '', total: '' },
  { name: 'Sessional II', weight: 15, obtained: '', total: '' },
  { name: 'Final',        weight: 50, obtained: '', total: '' }
];

export function gradeFor(pct) {
  if (pct == null || Number.isNaN(pct)) return null;
  return GRADE_SCALE.find(g => pct >= g.min) || GRADE_SCALE[GRADE_SCALE.length - 1];
}

const num = (v) => (v === '' || v == null ? NaN : Number(v));

/**
 * components: [{ name, weight, obtained, total }]
 * Returns marks secured so far (out of 100), weight graded, average so far,
 * projected final % (assuming you keep the same average), and what is
 * needed on the remaining weight to hit each grade.
 */
export function summarize(components) {
  let weightDone = 0, secured = 0, totalWeight = 0;
  for (const c of components) {
    const w = num(c.weight) || 0;
    totalWeight += w;
    const o = num(c.obtained), t = num(c.total);
    if (!Number.isNaN(o) && !Number.isNaN(t) && t > 0) {
      weightDone += w;
      secured += (o / t) * w;
    }
  }
  const remaining = Math.max(totalWeight - weightDone, 0);
  const average = weightDone > 0 ? (secured / weightDone) * 100 : null;
  const projected = average == null ? null : secured + remaining * (average / 100);

  const needed = GRADE_SCALE.filter(g => g.letter !== 'F').map(g => {
    const need = remaining > 0 ? ((g.min - secured) / remaining) * 100 : (secured >= g.min ? 0 : Infinity);
    return { ...g, need };
  });

  return { weightDone, remaining, secured, average, projected, totalWeight, needed, grade: gradeFor(projected) };
}

export function gpa(entries) {
  // entries: [{ points, credits }]
  let pts = 0, cr = 0;
  for (const e of entries) {
    if (e.points == null) continue;
    pts += e.points * e.credits;
    cr += e.credits;
  }
  return cr ? { gpa: pts / cr, credits: cr } : { gpa: null, credits: 0 };
}

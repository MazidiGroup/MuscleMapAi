// Muscle Map AI — exercise library + plan generator
// Parsed from the poster library. Fields: slug|muscle|equipment|pattern|level|flags (c=compound, t=timed)
const DB = `
abdominals-stretch-variation-one|core|bw|stretch|1|t
abdominals-stretch-variation-two|core|bw|stretch|1|t
abdominals-stretch-variation-three|core|bw|stretch|1|t
abdominals-stretch-variation-four|core|bw|stretch|1|t
band-curl|biceps|band|curl|1|
band-high-face-pull|shoulders|band|facepull|1|
band-hip-abduction|glutes|band|abduction|1|
band-kneeling-pulldown|back|band|vpull|1|
band-lateral-raise|shoulders|band|latraise|1|
band-pullover|back|band|vpull|1|
band-romanian-deadlift|hams|band|hinge|1|c
band-row|back|band|hpull|1|c
band-seated-pulldown|back|band|vpull|1|
band-shrug|traps|band|shrug|1|
band-single-arm-lateral-raise|shoulders|band|latraise|1|
band-wood-chopper|core|band|core|1|
barbell-banded-back-squat|quads|bb|squat|3|c
barbell-behind-the-back-30-degree-shrug|traps|bb|shrug|2|
barbell-bench-press|chest|bb|hpush|2|c
barbell-bent-over-row|back|bb|hpull|2|c
barbell-clean-and-press|shoulders|bb|cond|3|c
barbell-close-grip-bench-press|triceps|bb|hpush|2|c
barbell-curl|biceps|bb|curl|1|
barbell-deadlift|hams|bb|hinge|2|c
barbell-drag-curl|biceps|bb|curl|2|
barbell-front-rack-step-up-knee-drive|quads|bb|lunge|3|c
barbell-high-incline-bench-press|chest|bb|hpush|2|c
barbell-incline-bench-press|chest|bb|hpush|2|c
barbell-muscle-snatch|shoulders|bb|cond|3|c
barbell-overhead-press|shoulders|bb|vpush|2|c
barbell-power-snatch|full|bb|cond|3|c
barbell-pullover|back|bb|vpull|2|
barbell-rack-pull|back|bb|hinge|2|c
barbell-shrug|traps|bb|shrug|1|
barbell-snatch|full|bb|cond|3|c
barbell-spinal-jefferson-curl|hams|bb|mobility|3|
barbell-split-squat|quads|bb|lunge|2|c
barbell-squat|quads|bb|squat|2|c
barbell-step-up-knee-drive|quads|bb|lunge|2|c
barbell-stiff-leg-deadlifts|hams|bb|hinge|2|c
barbell-thruster|full|bb|cond|3|c
barbell-upright-row|shoulders|bb|latraise|2|
barbell-wrist-curl|forearms|bb|wrist|1|
bench-dips|triceps|bw|ext|1|
bodyweight-alternating-lateral-lunge|quads|bw|lunge|1|c
bodyweight-alternating-reverse-lunges|quads|bw|lunge|1|c
bodyweight-box-squat|quads|bw|squat|1|c
bodyweight-deadlift|hams|bw|hinge|1|c
bodyweight-donkey-calf-raise|calves|bw|calf|1|
bodyweight-elevated-push-up|chest|bw|hpush|1|c
bodyweight-hip-abduction|glutes|bw|abduction|1|
bodyweight-knee-push-ups|chest|bw|hpush|1|c
bodyweight-reverse-lunge|quads|bw|lunge|1|c
bodyweight-russian-twist|core|bw|core|1|
bodyweight-spinal-jefferson-curl|hams|bw|mobility|2|
bodyweight-squat|quads|bw|squat|1|c
box-jump|quads|bw|cond|2|c
bulgarian-split-squat|quads|bw|lunge|2|c
burpee|full|bw|cond|1|c
cable-30-degree-shrug|traps|cable|shrug|2|
cable-bar-curl|biceps|cable|curl|1|
cable-bar-face-pull|shoulders|cable|facepull|1|
cable-bar-pushdown|triceps|cable|ext|1|
cable-bench-chest-fly|chest|cable|fly|2|
cable-bench-press|chest|cable|hpush|2|c
cable-bench-straight-leg-kickback|glutes|cable|abduction|2|
cable-chest-press|chest|cable|hpush|1|c
cable-decline-bench-press|chest|cable|hpush|2|c
cable-incline-bench-press|chest|cable|hpush|2|c
cable-overhead-press|shoulders|cable|vpush|2|c
cable-pec-fly|chest|cable|fly|1|
cable-rope-kneeling-face-pull|shoulders|cable|facepull|1|
cable-rope-pushdown|triceps|cable|ext|1|
cable-row-bar-standing-row|back|cable|hpull|1|c
cable-seated-rope-face-pull|shoulders|cable|facepull|1|
cable-side-bend|core|cable|core|1|
cable-single-arm-neutral-grip-row|back|cable|hpull|1|c
cable-single-arm-rope-pushdown|triceps|cable|ext|1|
cable-single-arm-underhand-grip-row|back|cable|hpull|1|c
cable-standing-low-to-high-wood-chopper|core|cable|core|1|
cable-standing-single-arm-chest-press|chest|cable|hpush|2|c
cable-supinating-row|back|cable|hpull|2|c
cable-wood-chopper|core|cable|core|1|
chin-ups|back|bar|vpull|2|c
decline-push-up|chest|bw|hpush|2|c
diamond-push-ups|triceps|bw|ext|2|c
dumbbell-alternating-forward-lunge|quads|db|lunge|1|c
dumbbell-bench-press|chest|db|hpush|1|c
dumbbell-bulgarian-split-squat|quads|db|lunge|2|c
dumbbell-chest-fly|chest|db|fly|1|
dumbbell-concentration-curl|biceps|db|curl|1|
dumbbell-cross-body-romanian-deadlift|hams|db|hinge|2|c
dumbbell-curl|biceps|db|curl|1|
dumbbell-decline-bench-press|chest|db|hpush|2|c
dumbbell-decline-chest-fly|chest|db|fly|2|
dumbbell-decline-skullcrusher|triceps|db|ext|2|
dumbbell-feet-elevated-glute-bridge|glutes|db|hipthrust|1|
dumbbell-figure-four-heels-elevated-hip-thrust|glutes|db|hipthrust|2|
dumbbell-front-raise|shoulders|db|latraise|1|
dumbbell-goblet-alternating-curtsy-lunge|glutes|db|lunge|2|c
dumbbell-goblet-bulgarian-split-squat|quads|db|lunge|2|c
dumbbell-goblet-forward-lunge|quads|db|lunge|1|c
dumbbell-goblet-reverse-lunge|quads|db|lunge|1|c
dumbbell-goblet-split-squat|quads|db|lunge|1|c
dumbbell-goblet-squat|quads|db|squat|1|c
dumbbell-hammer-curl|biceps|db|curl|1|
dumbbell-heels-elevated-hip-thrust|glutes|db|hipthrust|1|
dumbbell-incline-bench-press|chest|db|hpush|2|c
dumbbell-incline-chest-fly|chest|db|fly|2|
dumbbell-incline-curl|biceps|db|curl|2|
dumbbell-incline-front-raise|shoulders|db|latraise|2|
dumbbell-incline-hammer-curl|biceps|db|curl|2|
dumbbell-lateral-raise|shoulders|db|latraise|1|
dumbbell-laying-reverse-fly|shoulders|db|facepull|2|
dumbbell-leg-curl|hams|db|legcurl|2|
dumbbell-preacher-curl|biceps|db|curl|2|
dumbbell-rear-delt-fly|shoulders|db|facepull|1|
dumbbell-row-bilateral|back|db|hpull|1|c
dumbbell-row-unilateral|back|db|hpull|1|c
dumbbell-russian-twist|core|db|core|1|
dumbbell-seated-overhead-press|shoulders|db|vpush|1|c
dumbbell-seated-overhead-tricep-extension|triceps|db|ext|1|
dumbbell-seated-rear-delt-fly|shoulders|db|facepull|1|
dumbbell-seated-shrug|traps|db|shrug|1|
dumbbell-shrug|traps|db|shrug|1|
dumbbell-side-bend|core|db|core|1|
dumbbell-single-arm-chest-press|chest|db|hpush|2|c
dumbbell-single-arm-clean-and-press|full|db|cond|2|c
dumbbell-single-arm-row|back|db|hpull|1|c
dumbbell-single-leg-calf-raise|calves|db|calf|1|
dumbbell-situp|core|db|core|1|
dumbbell-skullcrusher|triceps|db|ext|1|
dumbbell-spinal-jefferson-curl|hams|db|mobility|2|
dumbbell-standing-single-arm-curl|biceps|db|curl|1|
dumbbell-standing-single-arm-hammer-curl|biceps|db|curl|1|
dumbbell-sumo-squat|glutes|db|squat|1|c
dumbbell-superman|lowback|db|core|1|
dumbbell-thruster|full|db|cond|2|c
dumbbell-tricep-kickback|triceps|db|ext|1|
dumbbell-upright-row|shoulders|db|latraise|2|
dumbbell-wrist-curl|forearms|db|wrist|1|
dumbbell-wrist-extension|forearms|db|wrist|1|
elbow-side-plank|core|bw|core|1|t
ez-bar-preacher-curl|biceps|bb|curl|1|
ez-bar-reverse-preacher-curl|forearms|bb|curl|2|
forward-lunge|quads|bw|lunge|1|c
good-mornings|hams|bb|hinge|2|c
hand-plank|core|bw|core|1|t
hanging-knee-raises|core|bar|core|2|
incline-push-up|chest|bw|hpush|1|c
inverted-row|back|bw|hpull|1|c
jump-squats|quads|bw|cond|1|c
kettlebell-alternating-curtsy-lunge|glutes|kb|lunge|2|c
kettlebell-assisted-bulgarian-split-squat|quads|kb|lunge|1|c
kettlebell-bench-press|chest|kb|hpush|2|c
kettlebell-calf-raise|calves|kb|calf|1|
kettlebell-curl|biceps|kb|curl|1|
kettlebell-farmers-carry|core|kb|carry|1|ct
kettlebell-front-raise|shoulders|kb|latraise|1|
kettlebell-goblet-curl|biceps|kb|curl|1|
kettlebell-gorilla-row|back|kb|hpull|2|c
kettlebell-hip-thrust|glutes|kb|hipthrust|1|
kettlebell-incline-bench-press|chest|kb|hpush|2|c
kettlebell-push-press|shoulders|kb|vpush|2|c
kettlebell-romanian-deadlift|hams|kb|hinge|1|c
kettlebell-row|back|kb|hpull|1|c
kettlebell-row-single|back|kb|hpull|1|c
kettlebell-seated-overhead-press|shoulders|kb|vpush|1|c
kettlebell-shrug|traps|kb|shrug|1|
kettlebell-single-arm-row|back|kb|hpull|1|c
kettlebell-spinal-jefferson-curl|hams|kb|mobility|2|
kettlebell-sumo-deadlift|glutes|kb|hinge|1|c
kettlebell-swing|glutes|kb|cond|2|c
kettlebell-thruster|full|kb|cond|2|c
kettlebell-windmill|core|kb|core|2|
landmine-t-bar-rows|back|machine|hpull|2|c
lunge-walking|quads|bw|lunge|1|c
machine-45-degree-back-extension|lowback|machine|hinge|1|
machine-cable-v-bar-push-downs|triceps|machine|ext|1|
machine-chest-press|chest|machine|hpush|1|c
machine-crunch|core|machine|core|1|
machine-dips|triceps|machine|ext|1|c
machine-face-pulls|shoulders|machine|facepull|1|
machine-front-military-press|shoulders|machine|vpush|1|c
machine-leg-extension|quads|machine|legext|1|
machine-leg-press|quads|machine|squat|1|c
machine-neutral-row|back|machine|hpull|1|c
machine-pec-fly|chest|machine|fly|1|
machine-plate-loaded-leg-extension|quads|machine|legext|1|
machine-plate-loaded-t-bar-row|back|machine|hpull|2|c
machine-pulldown|back|machine|vpull|1|c
machine-seated-cable-row|back|machine|hpull|1|c
machine-underhand-row|back|machine|hpull|1|c
mountain-climber|core|bw|cond|1|t
narrow-pulldown|back|machine|vpull|1|c
parralel-bar-dips|chest|bar|hpush|2|c
plate-forward-lunge|quads|bb|lunge|1|c
pull-ups|back|bar|vpull|2|c
push-up|chest|bw|hpush|1|c
single-legged-romanian-deadlifts|hams|bw|hinge|2|c
smith-machine-close-grip-bench-press|triceps|machine|hpush|1|c
smith-machine-incline-bench-press|chest|machine|hpush|1|c
smith-machine-standing-shrugs|traps|machine|shrug|1|
smith-machine-sumo-romanian-deadlift|hams|machine|hinge|1|c
supermans|lowback|bw|core|1|
wall-sit|quads|bw|squat|1|t
`.trim();

const NAME_OVERRIDES = {
  'abdominals-stretch-variation-one': 'Abdominal Stretch 1',
  'abdominals-stretch-variation-two': 'Abdominal Stretch 2',
  'abdominals-stretch-variation-three': 'Abdominal Stretch 3',
  'abdominals-stretch-variation-four': 'Abdominal Stretch 4',
  'parralel-bar-dips': 'Parallel Bar Dips',
  'dumbbell-situp': 'Dumbbell Sit-Up',
  'machine-45-degree-back-extension': '45\u00b0 Back Extension',
  'barbell-behind-the-back-30-degree-shrug': 'Behind-the-Back Shrug',
  'cable-30-degree-shrug': 'Cable 30\u00b0 Shrug',
  'machine-cable-v-bar-push-downs': 'V-Bar Pushdown',
  'lunge-walking': 'Walking Lunges',
  'dumbbell-row-bilateral': 'Dumbbell Row (Two Arm)',
  'dumbbell-row-unilateral': 'Dumbbell Row (One Arm)',
  'kettlebell-row-single': 'Kettlebell Row (Single Bell)',
  'supermans': 'Superman',
  'good-mornings': 'Good Morning',
  'barbell-stiff-leg-deadlifts': 'Barbell Stiff-Leg Deadlift',
  'single-legged-romanian-deadlifts': 'Single-Leg Romanian Deadlift',
  'machine-front-military-press': 'Machine Shoulder Press',
  'bodyweight-knee-push-ups': 'Knee Push-Ups',
  'push-up': 'Push-Up',
  'decline-push-up': 'Decline Push-Up',
  'incline-push-up': 'Incline Push-Up',
  'bodyweight-elevated-push-up': 'Elevated Push-Up',
  'diamond-push-ups': 'Diamond Push-Ups',
  'pull-ups': 'Pull-Ups',
  'chin-ups': 'Chin-Ups',
  'ez-bar-preacher-curl': 'EZ-Bar Preacher Curl',
  'ez-bar-reverse-preacher-curl': 'EZ-Bar Reverse Curl',
  'barbell-front-rack-step-up-knee-drive': 'Front Rack Step-Up',
  'barbell-step-up-knee-drive': 'Barbell Step-Up + Knee Drive',
  'dumbbell-figure-four-heels-elevated-hip-thrust': 'Figure-Four Hip Thrust',
  'kettlebell-farmers-carry': "Kettlebell Farmer's Carry",
  'landmine-t-bar-rows': 'Landmine T-Bar Row',
  'machine-plate-loaded-t-bar-row': 'T-Bar Row (Plate Loaded)',
  'machine-plate-loaded-leg-extension': 'Leg Extension (Plate Loaded)',
  'cable-row-bar-standing-row': 'Standing Cable Row',
  'bodyweight-alternating-reverse-lunges': 'Alternating Reverse Lunges',
  'dumbbell-laying-reverse-fly': 'Dumbbell Lying Reverse Fly',
};

function slugName(slug) {
  if (NAME_OVERRIDES[slug]) return NAME_OVERRIDES[slug];
  return slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
    .replace(/ And /g, ' & ').replace(/ The /g, ' the ');
}

export const EXERCISES = DB.split('\n').map(line => {
  const [id, m, eq, pat, lvl, flags] = line.split('|');
  return { id, name: slugName(id), m, eq, pat, level: +lvl, c: (flags || '').includes('c'), t: (flags || '').includes('t') };
});
const BY_ID = Object.fromEntries(EXERCISES.map(e => [e.id, e]));

export const posterUrl = id => 'uploads/full-library-posters/' + id + '.webp';

export const MUSCLE_LABEL = { chest: 'Chest', back: 'Back', shoulders: 'Shoulders', biceps: 'Biceps', triceps: 'Triceps', forearms: 'Forearms', core: 'Core', lowback: 'Lower Back', glutes: 'Glutes', quads: 'Quads', hams: 'Hamstrings', calves: 'Calves', traps: 'Traps', full: 'Full Body' };
export const REGION = { chest: 'chest', back: 'back', traps: 'back', lowback: 'back', shoulders: 'shoulders', biceps: 'arms', triceps: 'arms', forearms: 'arms', core: 'core', glutes: 'glutes', quads: 'legs', hams: 'legs', calves: 'legs', full: null };
export const REGION_LABEL = { chest: 'Chest', shoulders: 'Shoulders', arms: 'Arms', back: 'Back', core: 'Core', glutes: 'Glutes', legs: 'Legs' };
export const GOAL_LABEL = { muscle: 'Build muscle', strength: 'Get stronger', fatloss: 'Lose fat', general: 'General fitness' };

const FALLBACK = {
  vpush: ['hpush'], vpull: ['hpull'], curl: ['hpull'], ext: ['hpush'],
  latraise: ['facepull', 'hpush'], facepull: ['hpull'], fly: ['hpush'],
  hipthrust: ['hinge'], abduction: ['lunge'], legcurl: ['hinge'], legext: ['lunge', 'squat'],
  shrug: ['hpull'], hinge: ['hipthrust'], squat: ['lunge'], lunge: ['squat'],
  hpush: ['vpush'], hpull: ['vpull'], calf: [], core: [], cond: ['core'], carry: ['core'],
};

const TEMPLATES = {
  full:  [{ p: ['squat', 'lunge'], m: 'quads' }, { p: ['hpush', 'vpush'], m: 'chest' }, { p: ['hpull', 'vpull'], m: 'back' }, { p: ['hinge', 'legcurl'], m: 'hams' }, { p: ['core'] }, { p: ['latraise', 'curl', 'ext'] }, { p: ['cond', 'carry'] }],
  push:  [{ p: ['hpush'], m: 'chest' }, { p: ['vpush'], m: 'shoulders' }, { p: ['hpush', 'fly'], m: 'chest' }, { p: ['latraise'], m: 'shoulders' }, { p: ['ext'], m: 'triceps' }, { p: ['ext', 'fly'] }, { p: ['facepull'] }],
  pull:  [{ p: ['vpull', 'hpull'], m: 'back' }, { p: ['hpull'], m: 'back' }, { p: ['hpull', 'vpull'], m: 'back' }, { p: ['facepull', 'shrug'] }, { p: ['curl'], m: 'biceps' }, { p: ['curl', 'wrist'] }, { p: ['core'] }],
  legs:  [{ p: ['squat'], m: 'quads' }, { p: ['hinge'], m: 'hams' }, { p: ['lunge'] }, { p: ['hipthrust', 'abduction'], m: 'glutes' }, { p: ['legext', 'legcurl'] }, { p: ['calf'] }, { p: ['core'] }],
  upper: [{ p: ['hpush'], m: 'chest' }, { p: ['hpull'], m: 'back' }, { p: ['vpush'], m: 'shoulders' }, { p: ['vpull'], m: 'back' }, { p: ['curl'], m: 'biceps' }, { p: ['ext'], m: 'triceps' }, { p: ['latraise', 'facepull'] }],
  lower: [{ p: ['squat'], m: 'quads' }, { p: ['hinge'], m: 'hams' }, { p: ['lunge'] }, { p: ['hipthrust', 'abduction', 'legcurl'], m: 'glutes' }, { p: ['calf'] }, { p: ['core'] }, { p: ['legext'] }],
};
const DAY_REGIONS = {
  full: ['chest', 'shoulders', 'arms', 'back', 'core', 'glutes', 'legs'],
  push: ['chest', 'shoulders', 'arms'], pull: ['back', 'arms'],
  legs: ['legs', 'glutes', 'core'], upper: ['chest', 'back', 'shoulders', 'arms'], lower: ['legs', 'glutes', 'core'],
};
const FOCUS_PATS = { chest: ['fly', 'hpush'], shoulders: ['latraise', 'facepull'], arms: ['curl', 'ext'], back: ['shrug', 'vpull', 'facepull'], core: ['core'], glutes: ['abduction', 'hipthrust'], legs: ['calf', 'legext', 'legcurl'] };
const FOCUS_M = { chest: 'chest', shoulders: 'shoulders', arms: 'biceps', back: 'back', core: 'core', glutes: 'glutes', legs: 'calves' };

const TYPE_NAME = { full: 'Full Body', push: 'Push', pull: 'Pull', legs: 'Legs', upper: 'Upper Body', lower: 'Lower Body' };
const TYPE_BLURB = {
  full: 'Every major muscle, one session.', push: 'Chest, shoulders & triceps.',
  pull: 'Back, rear delts & biceps.', legs: 'Quads, hamstrings, glutes & calves.',
  upper: 'Chest, back, shoulders & arms.', lower: 'Legs, glutes & core.',
};
export const SPLIT_LABEL = { 1: 'Full Body', 2: 'Full Body \u00d72', 3: 'Full Body \u00d73', 4: 'Upper / Lower', 5: 'Hybrid PPL', 6: 'Push / Pull / Legs', 7: 'Push / Pull / Legs +' };

function splitFor(n) {
  return {
    1: ['full'], 2: ['full', 'full'], 3: ['full', 'full', 'full'],
    4: ['upper', 'lower', 'upper', 'lower'], 5: ['push', 'pull', 'legs', 'upper', 'lower'],
    6: ['push', 'pull', 'legs', 'push', 'pull', 'legs'], 7: ['push', 'pull', 'legs', 'upper', 'lower', 'full', 'full'],
  }[Math.min(7, Math.max(1, n))];
}

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const maxLevel = ans => ans.exp === 'advanced' ? 3 : 2;
const equipOk = (e, ans) => e.eq === 'bw' || ans.equip.includes(e.eq);

function pick(slot, used, ans, rnd) {
  const chains = [slot.p, FALLBACK[slot.p[0]] || []];
  for (const pats of chains) {
    if (!pats.length) continue;
    let cands = EXERCISES.filter(e => pats.includes(e.pat) && equipOk(e, ans) && e.level <= maxLevel(ans));
    if (!cands.length) continue;
    let best = null, bs = -1e9;
    for (const e of cands) {
      let s = (pats.length - pats.indexOf(e.pat)) * 10 + (slot.m && e.m === slot.m ? 9 : 0) + (e.c ? 5 : 0) + rnd() * 8;
      if (ans.exp === 'beginner' && e.level > 1) s -= 7;
      if (ans.goal === 'strength' && e.c) s += 4;
      if (ans.focus && ans.focus.includes(REGION[e.m])) s += 3;
      if (used.has(e.id)) s -= 40;
      if (s > bs) { bs = s; best = e; }
    }
    if (best) { used.add(best.id); return best; }
  }
  return null;
}

function setsRepsRest(e, ans) {
  const beg = ans.exp === 'beginner';
  let sets, reps, rest;
  if (ans.goal === 'strength') { sets = e.c ? 4 : 3; reps = e.c ? '4\u20136' : '6\u20138'; rest = e.c ? '2\u20133 min' : '90 sec'; }
  else if (ans.goal === 'muscle') { sets = e.c ? 4 : 3; reps = '8\u201312'; rest = '60\u201390 sec'; }
  else if (ans.goal === 'fatloss') { sets = 3; reps = '12\u201315'; rest = '45 sec'; }
  else { sets = 3; reps = '10\u201312'; rest = '60 sec'; }
  if (beg) sets = Math.min(3, sets);
  if (e.t) reps = '30\u201345 sec';
  return { sets, reps, rest };
}

export function entryFor(id, ans, opts) {
  const e = BY_ID[id];
  const srr = setsRepsRest(e, ans);
  return {
    id: e.id, name: e.name, img: posterUrl(e.id),
    muscle: MUSCLE_LABEL[e.m], region: REGION[e.m],
    sets: srr.sets, reps: srr.reps, rest: srr.rest,
    setsLabel: srr.sets + ' sets \u00b7 ' + srr.reps + (e.t ? '' : ' reps'),
    focus: !!(opts && opts.focus) || !!(ans.focus && ans.focus.includes(REGION[e.m])),
    finisher: !!(opts && opts.finisher),
    posture: !!(opts && opts.posture),
  };
}

export const PROGRESS_TIP = {
  strength: 'When you hit the top reps on every set, add a little weight next time.',
  muscle: 'When the top rep count starts to feel easy, go a little heavier.',
  fatloss: 'Keep rests short and try to move a little faster each week.',
  general: 'Each week, aim to do just a little more than last week.',
};

const STRETCHES = ['abdominals-stretch-variation-one', 'abdominals-stretch-variation-two', 'abdominals-stretch-variation-three', 'abdominals-stretch-variation-four'];
const DOW = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function buildPlan(ans, seed) {
  const rnd = mulberry32(seed || 1);
  const dayIdxs = (ans.days && ans.days.length ? [...ans.days].sort((a, b) => a - b) : [0, 2, 4]);
  const types = splitFor(dayIdxs.length);
  const count = ans.exp === 'beginner' ? 5 : ans.exp === 'advanced' ? 7 : 6;
  const used = new Set();
  const typeCount = {};
  const days = types.map((type, i) => {
    typeCount[type] = (typeCount[type] || 0) + 1;
    let slots = TEMPLATES[type].slice(0, ans.goal === 'fatloss' ? count - 1 : count);
    let extras = 0;
    for (const r of (ans.focus || [])) {
      if (extras >= 2) break;
      if (DAY_REGIONS[type].includes(r)) { slots = slots.concat([{ p: FOCUS_PATS[r], m: FOCUS_M[r], focus: true }]); extras++; }
    }
    const exercises = [];
    for (const slot of slots) {
      const e = pick(slot, used, ans, rnd);
      if (e && !exercises.some(x => x.id === e.id)) exercises.push(entryFor(e.id, ans, { focus: slot.focus }));
    }
    if (ans.goal === 'fatloss') {
      const f = pick({ p: ['cond', 'carry'] }, used, ans, rnd);
      if (f) { const en = entryFor(f.id, ans, { finisher: true }); en.setsLabel = '3 rounds \u00b7 40 sec on / 20 off'; en.rest = '\u2014'; exercises.push(en); }
    }
    if (ans.posture) {
      const slot = i % 2 === 0 ? { p: ['facepull'], m: 'shoulders' } : { p: ['core'], m: 'lowback' };
      const pe = pick(slot, used, ans, rnd);
      if (pe && !exercises.some(x => x.id === pe.id)) {
        const en = entryFor(pe.id, ans, { posture: true });
        en.sets = Math.min(3, en.sets);
        en.setsLabel = en.sets + ' sets \u00b7 ' + en.reps + (en.reps.includes('sec') ? '' : ' reps');
        exercises.push(en);
      }
    }
    const totalSets = exercises.reduce((s, x) => s + x.sets, 0);
    const mins = Math.round((totalSets * 2.4 + 9) / 5) * 5;
    const nRepeat = types.filter(t => t === type).length;
    const name = TYPE_NAME[type] + (nRepeat > 1 ? ' ' + String.fromCharCode(64 + typeCount[type]) : '');
    const targets = [...new Set(exercises.map(x => x.region).filter(Boolean))].map(r => REGION_LABEL[r]);
    const st = STRETCHES[i % 4];
    return {
      type, name, blurb: TYPE_BLURB[type], dow: DOW[dayIdxs[i]], dowIdx: dayIdxs[i],
      exercises, mins, targets,
      cooldown: { id: st, name: slugName(st), img: posterUrl(st), note: '30\u201360 sec \u00b7 breathe slow' },
    };
  });
  return { days, split: SPLIT_LABEL[dayIdxs.length], goalLabel: GOAL_LABEL[ans.goal], tip: PROGRESS_TIP[ans.goal] };
}

export function alternativesFor(id, ans, excludeIds) {
  const e = BY_ID[id];
  if (!e) return [];
  const ok = x => x.id !== id && !excludeIds.includes(x.id) && equipOk(x, ans) && x.level <= maxLevel(ans) && x.pat !== 'stretch' && x.pat !== 'mobility';
  let list = EXERCISES.filter(x => ok(x) && x.pat === e.pat);
  if (list.length < 3) list = list.concat(EXERCISES.filter(x => ok(x) && x.pat !== e.pat && x.m === e.m && !list.includes(x)));
  list.sort((a, b) => ((b.m === e.m ? 10 : 0) + (b.c ? 2 : 0)) - ((a.m === e.m ? 10 : 0) + (a.c ? 2 : 0)));
  return list.slice(0, 6).map(x => ({ id: x.id, name: x.name, img: posterUrl(x.id), muscle: MUSCLE_LABEL[x.m] }));
}

/**
 * Time-driven kinetic type. All times are seconds on the caller's timeline.
 * Build once per phrase, then sample any time without accumulating state.
 */
export function createGlyphPop(text, {
  start = 0,
  stagger = 0.085,
  cues,
  rise = 0.12,
  settle = 0.17,
  fromScale = 0.58,
  peakScale = 1.15,
  lift = 22,
  easeRise = x => 1 - (1 - x) ** 3,
} = {}) {
  if (typeof text !== 'string') throw new TypeError('text must be a string');
  const glyphs = Array.from(new Intl.Segmenter(undefined, {granularity: 'grapheme'}).segment(text),
    ({segment}) => segment);
  const timedGlyphs = glyphs.filter((glyph) => glyph.trim()).length;

  for (const [name, value] of Object.entries({start, stagger, rise, settle, fromScale, peakScale, lift})) {
    if (!Number.isFinite(value) || value < 0) throw new RangeError(name + ' must be finite and nonnegative');
  }
  if (rise === 0 || settle === 0 || fromScale > 1 || peakScale < 1) {
    throw new RangeError('rise and settle must be positive, with fromScale <= 1 <= peakScale');
  }
  if (cues !== undefined && (!Array.isArray(cues) || cues.length !== timedGlyphs ||
    Array.from(cues).some((cue, index) => !Number.isFinite(cue) || cue < 0 ||
      (index > 0 && cue <= cues[index - 1])))) {
    throw new RangeError('cues must provide a strictly increasing, nonnegative time per non-space glyph');
  }
  let index = 0;
  const entries = glyphs.map((text) => {
    if (!text.trim()) return {text, at: null};
    const at = cues?.[index] ?? start + index * stagger;
    index++;
    return {text, at};
  });

  return (time) => {
    if (!Number.isFinite(time)) throw new RangeError('time must be finite');
    return entries.map(({text, at}) => {
      if (at === null) return {text, scale: 1, y: 0, opacity: 1};
      const elapsed = time - at;
      if (elapsed < 0) return {text, scale: fromScale, y: lift, opacity: 0};
      if (elapsed < rise) {
        const progress = elapsed / rise;
        const ease = easeRise(progress);
        return {
          text,
          scale: fromScale + (peakScale - fromScale) * ease,
          y: lift * (1 - ease),
          opacity: Math.min(1, 0.25 + 2.5 * progress),
        };
      }
      if (elapsed < rise + settle) {
        const remaining = 1 - (elapsed - rise) / settle;
        return {text, scale: 1 + (peakScale - 1) * remaining ** 3, y: 0, opacity: 1};
      }
      return {text, scale: 1, y: 0, opacity: 1};
    });
  };
}

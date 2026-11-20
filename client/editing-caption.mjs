import { createGlyphPop } from './glyph-pop.mjs'
import { captionRise, captionSettle, sampleCurve } from './motion-curves.mjs'

export function drawCaption(context, width, height, clip, time, motion) {
  if (!motion || !clip.caption) return
  const glyphs = motion(time)
  context.save()
  const font = Math.max(14, Math.min(height * 0.08, width / (glyphs.length + 1)))
  context.font = `700 ${font}px system-ui, sans-serif`
  context.textBaseline = 'middle'
  const glyphWidths = glyphs.map(({ text }) => context.measureText(text).width)
  const lineWidth = glyphWidths.reduce((sum, n) => sum + n, 0)
  const y = height * 0.83
  let x = (width - lineWidth) / 2
  context.fillStyle = '#15161A'
  context.globalAlpha = Math.min(0.86, time * 12)
  context.fillRect(x - font / 2, y - font * 0.8, lineWidth + font, font * 1.6)
  context.fillStyle = '#E6E7EA'
  for (const [index, glyph] of glyphs.entries()) {
    context.save()
    context.globalAlpha = glyph.opacity
    context.translate(x + glyphWidths[index] / 2, y + glyph.y * height / 540)
    context.scale(glyph.scale, glyph.scale)
    context.fillText(glyph.text, -glyphWidths[index] / 2, 0)
    context.restore()
    x += glyphWidths[index]
  }
  context.restore()
}

export function captionMotion(clip) {
  if (!clip.caption?.trim()) return null
  const count = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(clip.caption)].length
  const duration = clip.end - clip.start
  return createGlyphPop(clip.caption, {
    stagger: Math.min(0.085, duration * 0.6 / count),
    rise: captionRise,
    settle: captionSettle,
    easeRise: progress => sampleCurve(clip.captionCurve, progress),
  })
}

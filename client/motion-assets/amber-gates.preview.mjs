// SPDX-License-Identifier: Apache-2.0
const scene = {
  "name": "Amber Gates",
  "kind": "prisms",
  "primary": "#E0A84A",
  "secondary": "#A5ACFF",
  "seed": 5,
  "colors": {
    "backdrop": "#15161A",
    "surface": "#1F2026",
    "faint": "#2C2E35",
    "accent": "#8A93FF",
    "highlight": "#A5ACFF",
    "info": "#6FA8E8",
    "green": "#5CC28A",
    "amber": "#E0A84A",
    "text": "#E6E7EA"
  }
}
const TAU = Math.PI * 2
const sin = Math.sin
const cos = Math.cos

export const duration = 4

/** Return the drawing commands for a point on the four-second loop. */
export function frame(seconds, width, height) {
  const phase = ((seconds % duration + duration) % duration) / duration * TAU
  const scale = Math.min(width / 640, height / 360)
  const left = (width - 640 * scale) / 2
  const top = (height - 360 * scale) / 2
  const cx = 320
  const cy = 180
  const shapes = []
  const { backdrop, surface, faint, text } = scene.colors
  const line = (points, color, alpha = 1, weight = 1) => shapes.push({ type: 'line', points, color, alpha, weight })
  const ring = (x, y, rx, ry, color, alpha = 1, weight = 1) => shapes.push({ type: 'ring', x, y, rx, ry, color, alpha, weight })
  const disc = (x, y, rx, ry, color, alpha = 1) => shapes.push({ type: 'disc', x, y, rx, ry, color, alpha })
  const polygon = (points, color, alpha = 1) => shapes.push({ type: 'polygon', points, color, alpha })
  const { kind, primary, secondary, seed } = scene

  for (let x = 32; x < 640; x += 24) {
    for (let y = 24; y < 360; y += 24) disc(x, y, 1, 1, faint, .7)
  }

  if (kind === 'orbits') {
    const centerRadius = 35 + seed * 3
    disc(cx, cy, centerRadius + 11, centerRadius + 11, primary, .06)
    disc(cx, cy, centerRadius, centerRadius, primary, .12)
    ring(cx, cy, centerRadius, centerRadius, secondary, .75)
    for (let i = 0; i < 5; i++) {
      const rx = 73 + i * 30
      const ry = rx * (.38 + seed * .055)
      const tilt = .24 + seed * .08
      const orbit = theta => [
        cx + rx * cos(theta) * cos(tilt) - ry * sin(theta) * sin(tilt),
        cy + rx * cos(theta) * sin(tilt) + ry * sin(theta) * cos(tilt),
      ]
      line(Array.from({ length: 97 }, (_, n) => orbit(n / 96 * TAU)), secondary, .42 - .05 * i)
      const [x, y] = orbit(phase * (i % 2 ? -1 : 1) + i * 1.23)
      disc(x, y, 11, 11, primary, .12)
      disc(x, y, 4, 4, i % 2 ? secondary : primary)
    }
  }

  if (kind === 'prisms') {
    for (let i = 0; i < 7; i++) {
      const a = phase + i * .36
      const y = cy + sin(a) * 25
      const x = 116 + i * 68
      const r = 26 + 7 * cos(a + seed)
      const points = [[x, y - 52], [x + r, y - 12], [x, y + 55], [x - r, y + 13]]
      polygon(points, primary, .18 + .07 * sin(a))
      polygon([points[0], points[1], [x, y], points[2]], secondary, .35)
      line([...points, points[0]], i % 2 ? secondary : primary, .88, 1.5)
      line([[x, y + 63], [x, y + 100 + 12 * sin(a)]], primary, .19)
    }
  }

  if (kind === 'waves') {
    for (let n = 0; n < 11; n++) {
      const points = Array.from({ length: 117 }, (_, i) => {
        const u = i / 116
        const envelope = sin(u * Math.PI) ** 1.6
        return [30 + 580 * u, cy + (n - 5) * 11 +
          envelope * (36 * sin(u * TAU * (1.3 + seed * .08) - phase + n * .19) +
            16 * sin(u * TAU * 3 + phase + n * .31))]
      })
      line(points, n < 5 ? primary : secondary, .34 + .047 * n, n === 5 ? 2 : 1)
    }
  }

  if (kind === 'cells') {
    for (let x = 0; x < 19; x++) {
      for (let y = 0; y < 9; y++) {
        const pulse = .5 + .5 * sin(phase + Math.hypot(x - 9, y - 4) * (seed / 8))
        const r = 1.8 + 5.2 * pulse ** 3
        disc(77 + x * 27, 72 + y * 27, r, r, pulse > .84 ? secondary : primary, .17 + .73 * pulse ** 3)
      }
    }
  }

  if (kind === 'dial') {
    const n = 96
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU
      const pulse = .5 + .5 * cos(a * 3 - phase + seed)
      const inner = 69 + 7 * sin(a * 5 + phase)
      const outer = inner + 10 + 42 * pulse ** 5
      line([[cx + inner * cos(a), cy + inner * sin(a)],
        [cx + outer * cos(a), cy + outer * sin(a)]], i % 3 === 0 ? secondary : primary, .27 + .7 * pulse, 1.8)
    }
    ring(cx, cy, 54, 54, secondary, .46)
    ring(cx, cy, 142, 142, primary, .2)
    disc(cx + 142 * cos(phase), cy + 142 * sin(phase), 4, 4, text)
  }

  return { width, height, scale, left, top, backdrop, surface, shapes }
}

export function renderFrame(context, seconds) {
  const { width, height, scale, left, top, backdrop, surface, shapes } =
    frame(seconds, context.canvas.width, context.canvas.height)
  context.save()
  context.setTransform(1, 0, 0, 1, 0, 0)
  const gradient = context.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, width * .57)
  gradient.addColorStop(0, surface)
  gradient.addColorStop(1, backdrop)
  context.fillStyle = gradient
  context.fillRect(0, 0, width, height)
  context.translate(left, top)
  context.scale(scale, scale)
  context.lineJoin = 'round'
  context.lineCap = 'round'
  for (const shape of shapes) {
    context.globalAlpha = shape.alpha
    context.lineWidth = shape.weight ?? 1
    context.strokeStyle = context.fillStyle = shape.color
    context.beginPath()
    if (shape.points) {
      const [[x, y], ...rest] = shape.points
      context.moveTo(x, y)
      for (const point of rest) context.lineTo(...point)
    } else {
      context.ellipse(shape.x, shape.y, shape.rx, shape.ry, 0, 0, TAU)
    }
    if (shape.type === 'line' || shape.type === 'ring') context.stroke()
    else context.fill()
  }
  context.restore()
}

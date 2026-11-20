const cubicOut = x => 1 - (1 - x) ** 3

export const captionCurves = [
  { id: 'linear', zh: '线性', en: 'Linear', sample: x => x },
  { id: 'ease-in', zh: '缓入', en: 'Ease in', sample: x => x ** 3 },
  { id: 'ease-out', zh: '缓出', en: 'Ease out', sample: cubicOut },
  { id: 'ease-in-out', zh: '缓入缓出', en: 'Ease in and out', sample: x => x * x * (3 - 2 * x) },
  { id: 'expo', zh: '指数', en: 'Exponential', sample: x => x === 0 || x === 1 ? x : x < 0.5
    ? 2 ** (20 * x - 10) / 2
    : (2 - 2 ** (10 - 20 * x)) / 2 },
]

export const defaultCurve = 'ease-out'

export function sampleCurve(id, progress) {
  const curve = captionCurves.find(item => item.id === id)
  return (curve?.sample ?? cubicOut)(Math.max(0, Math.min(1, progress)))
}

export const captionRise = 0.12
export const captionSettle = 0.17

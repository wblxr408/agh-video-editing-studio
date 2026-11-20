const FRAME_COUNT = 8
const SCAN_COUNT = 32
export const MAX_BYTES = 500 * 1024 * 1024

// dsh-video-storyboard reference: put scene changes and timestamps at the center of the sheet.
// Use bounded browser sampling and a fixed gallery instead of a native decoding pipeline.
export function storyboardFrames(samples, limit) {
  if (limit < 1 || !samples.length) return []
  if (samples.length <= limit) return samples
  if (limit === 1) return [samples[0]]
  const interior = samples.slice(1, -1)
  const windows = limit - 2
  const chosen = []
  for (let i = 0; i < windows; i += 1) {
    const batch = interior.slice(
      Math.floor(i * interior.length / windows),
      Math.floor((i + 1) * interior.length / windows),
    )
    // Favor the center when cuts are absent or too weak to distinguish reliably.
    const midpoint = batch[Math.floor(batch.length / 2)]
    const strongest = batch.reduce((best, sample) => sample.change > best.change ? sample : best, midpoint)
    chosen.push(strongest.change > 0.10 ? strongest : midpoint)
  }
  return [samples[0], ...chosen, samples.at(-1)]
}

function waitForVideo(video, event, signal, start) {
  signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    const clean = () => {
      clearTimeout(timer)
      video.removeEventListener(event, success)
      video.removeEventListener('error', failed)
      signal.removeEventListener('abort', aborted)
    }
    const success = () => { clean(); resolve() }
    const failed = () => { clean(); reject(new Error('Video decoding failed')) }
    const aborted = () => { clean(); reject(signal.reason) }
    const timer = setTimeout(failed, 10000)
    video.addEventListener(event, success, { once: true })
    video.addEventListener('error', failed, { once: true })
    signal.addEventListener('abort', aborted, { once: true })
    try {
      start()
    } catch (error) {
      clean()
      reject(error)
    }
  })
}

function sceneDifference(previous, current) {
  if (!previous) return 0
  let difference = 0
  for (let i = 0; i < current.length; i += 4) {
    difference += Math.abs(current[i] - previous[i]) +
      Math.abs(current[i + 1] - previous[i + 1]) + Math.abs(current[i + 2] - previous[i + 2])
  }
  return difference / (current.length / 4 * 3 * 255)
}

export async function scanVideo(url, signal, onProgress) {
  const video = document.createElement('video')
  video.preload = 'auto'
  video.muted = true
  const fingerprint = document.createElement('canvas')
  fingerprint.width = 32
  fingerprint.height = 18
  const pixels = fingerprint.getContext('2d', { willReadFrequently: true })
  try {
    await waitForVideo(video, 'loadeddata', signal, () => { video.src = url })
    const duration = video.duration
    if (!Number.isFinite(duration) || duration <= 0 || !video.videoWidth) throw new Error('Invalid video')
    const count = Math.min(SCAN_COUNT, Math.max(1, Math.ceil(duration * 12)))
    const samples = []
    let previous
    for (let i = 0; i < count; i += 1) {
      signal.throwIfAborted()
      const time = duration * (i + 0.5) / count
      if (Math.abs(video.currentTime - time) > 0.001) {
        await waitForVideo(video, 'seeked', signal, () => { video.currentTime = time })
      }
      pixels.drawImage(video, 0, 0, fingerprint.width, fingerprint.height)
      const current = pixels.getImageData(0, 0, fingerprint.width, fingerprint.height).data
      const still = document.createElement('canvas')
      const scale = Math.min(1, 360 / Math.max(video.videoWidth, video.videoHeight))
      still.width = Math.max(1, Math.round(video.videoWidth * scale))
      still.height = Math.max(1, Math.round(video.videoHeight * scale))
      still.getContext('2d').drawImage(video, 0, 0, still.width, still.height)
      samples.push({ time, change: sceneDifference(previous, current), still })
      previous = current
      onProgress(Math.round((i + 1) * 100 / count))
    }
    return { duration, width: video.videoWidth, height: video.videoHeight, frames: storyboardFrames(samples, FRAME_COUNT) }
  } finally {
    video.removeAttribute('src')
    video.load()
  }
}

export function timecode(seconds) {
  const ms = Math.floor(seconds * 1000)
  const hours = Math.floor(ms / 3600000)
  const minutes = String(Math.floor(ms / 60000) % 60).padStart(2, '0')
  const secs = String(Math.floor(ms / 1000) % 60).padStart(2, '0')
  const decimal = String(Math.floor(ms / 100) % 10)
  return `${hours ? hours + ':' : ''}${minutes}:${secs}.${decimal}`
}

export function copyFrame(canvas, still) {
  if (!canvas) return
  canvas.getContext('2d').drawImage(still, 0, 0)
}

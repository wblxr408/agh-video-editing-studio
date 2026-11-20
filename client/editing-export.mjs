import {
  ALL_FORMATS, AudioSampleSink, AudioSampleSource, BlobSource, BufferTarget, CanvasSink,
  CanvasSource, Input, Mp4OutputFormat, Output, QUALITY_HIGH, WebMOutputFormat,
  canEncodeAudio, canEncodeVideo,
} from './vendor/mediabunny.mjs'
import { captionMotion, drawCaption } from './editing-caption.mjs'
import { timelineLayout } from './editing-model.mjs'

const FPS = 30
const audioSettings = { sampleRate: 48000, numberOfChannels: 2 }
const formats = [
  { extension: 'mp4', type: 'video/mp4', video: 'avc', audio: 'aac', container: Mp4OutputFormat },
  { extension: 'webm', type: 'video/webm', video: 'vp9', audio: 'opus', container: WebMOutputFormat },
  { extension: 'webm', type: 'video/webm', video: 'vp8', audio: 'opus', container: WebMOutputFormat },
]

async function outputFormat(canvas, hasAudio) {
  for (const format of formats) {
    if (await canEncodeVideo(format.video, { width: canvas.width, height: canvas.height, bitrate: QUALITY_HIGH })
      && (!hasAudio || await canEncodeAudio(format.audio, audioSettings))) return format
  }
  throw new Error('This browser cannot encode the project. Try a current desktop Chromium browser.')
}

function frameTimes(start, end) {
  return Array.from({ length: Math.ceil((end - start) * FPS - 1e-8) }, (_, index) => start + index / FPS)
}

export async function renderMotionSample(name, renderFrame, duration, signal, progress) {
  const canvas = document.createElement('canvas')
  canvas.width = 640
  canvas.height = 360
  const context = canvas.getContext('2d', { alpha: false })
  const format = await outputFormat(canvas, false)
  signal.throwIfAborted()
  const target = new BufferTarget()
  const output = new Output({ format: new format.container(), target })
  const video = new CanvasSource(canvas, { codec: format.video, bitrate: QUALITY_HIGH })
  output.addVideoTrack(video)

  try {
    await output.start()
    const times = frameTimes(0, duration)
    for (const seconds of times) {
      signal.throwIfAborted()
      renderFrame(context, seconds)
      await video.add(seconds, Math.min(1 / FPS, duration - seconds), { keyFrame: seconds === 0 })
      progress(Math.floor(seconds / duration * 98))
    }
    signal.throwIfAborted()
    video.close()
    await output.finalize()
    signal.throwIfAborted()
    return new File([target.buffer], `${name}.${format.extension}`, { type: format.type })
  } catch (error) {
    if (output.state === 'started' || output.state === 'pending') await output.cancel().catch(() => {})
    throw error
  }
}

async function writeAudio(sink, source, start, end, offset, signal) {
  for await (const sample of sink.samples(start, end)) {
    try {
      signal.throwIfAborted()
      const first = Math.max(0, Math.ceil((start - sample.timestamp) * sample.sampleRate - 1e-6))
      const last = Math.min(sample.numberOfFrames, Math.ceil((end - sample.timestamp) * sample.sampleRate - 1e-6))
      if (last <= first) continue
      const trimmed = sample.trim(first, last)
      try {
        trimmed.setTimestamp(offset + Math.max(0, trimmed.timestamp - start))
        await source.add(trimmed)
      } finally {
        trimmed.close()
      }
    } finally {
      sample.close()
    }
  }
}

export async function exportTimeline(sources, clips, signal, progress) {
  const layout = timelineLayout(clips)
  const total = layout.at(-1).offset + layout.at(-1).length
  const first = sources.get(clips[0].source)
  const scale = Math.min(1, 1920 / Math.max(first.width, first.height), 1080 / Math.min(first.width, first.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(2, Math.floor(first.width * scale / 2) * 2)
  canvas.height = Math.max(2, Math.floor(first.height * scale / 2) * 2)
  const context = canvas.getContext('2d', { alpha: false })
  const inputs = new Map()
  let output
  try {
    for (const id of new Set(clips.map(clip => clip.source))) {
      signal.throwIfAborted()
      const source = sources.get(id)
      const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(source.file) })
      const entry = { input, video: null, audio: null, origin: 0 }
      inputs.set(id, entry)
      entry.video = await input.getPrimaryVideoTrack()
      if (!entry.video || !await entry.video.canDecode()) throw new Error(`Cannot decode ${source.file.name}.`)
      entry.audio = clips.some(clip => clip.source === id && !clip.muted) ? await input.getPrimaryAudioTrack() : null
      if (entry.audio && !await entry.audio.canDecode()) throw new Error(`Cannot decode audio in ${source.file.name}.`)
      const inputTracks = await input.getTracks()
      entry.origin = Math.max(0, Math.min(...await Promise.all(inputTracks.map(track => track.getFirstTimestamp()))))
    }
    const hasAudio = [...inputs.values()].some(entry => entry.audio)
    const format = await outputFormat(canvas, hasAudio)
    const target = new BufferTarget()
    output = new Output({ format: new format.container(), target })
    const video = new CanvasSource(canvas, { codec: format.video, bitrate: QUALITY_HIGH })
    const audio = hasAudio ? new AudioSampleSource({ codec: format.audio, bitrate: 160000, transform: audioSettings }) : null
    output.addVideoTrack(video)
    if (audio) output.addAudioTrack(audio)
    await output.start()
    for (const { clip, offset, length } of layout) {
      signal.throwIfAborted()
      const entry = inputs.get(clip.source)
      const start = clip.start + entry.origin
      const times = frameTimes(start, start + length)
      const motion = captionMotion(clip)
      const reader = new CanvasSink(entry.video, { width: canvas.width, height: canvas.height, fit: 'contain' })
      let index = 0
      for await (const frame of reader.canvasesAtTimestamps(times)) {
        signal.throwIfAborted()
        const seconds = index / FPS
        if (frame) context.drawImage(frame.canvas, 0, 0)
        else context.clearRect(0, 0, canvas.width, canvas.height)
        drawCaption(context, canvas.width, canvas.height, clip, seconds, motion)
        await video.add(offset + seconds, Math.min(1 / FPS, length - seconds), { keyFrame: index === 0 })
        if (index % 8 === 0) progress(Math.floor((offset + seconds) / total * 98))
        index += 1
      }
      if (audio && entry.audio && !clip.muted) {
        await writeAudio(new AudioSampleSink(entry.audio), audio, start, start + length, offset, signal)
      }
    }
    signal.throwIfAborted()
    video.close()
    audio?.close()
    await output.finalize()
    return { blob: new Blob([target.buffer], { type: format.type }), extension: format.extension }
  } catch (error) {
    if (output && (output.state === 'started' || output.state === 'pending')) await output.cancel().catch(() => {})
    throw error
  } finally {
    for (const { input } of inputs.values()) input.dispose()
  }
}

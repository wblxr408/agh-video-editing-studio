import { ALL_FORMATS, AudioBufferSink, BlobSource, Input } from './vendor/mediabunny.mjs'

// Sample a bounded set of windows. Do not allocate PCM for the whole source.
export async function readWaveform(file, duration, signal) {
  signal.throwIfAborted()
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) })
  const abort = () => input.dispose()
  signal.addEventListener('abort', abort, { once: true })
  try {
    const track = await input.getPrimaryAudioTrack()
    if (!track || !await track.canDecode()) return null
    const origin = Math.max(0, await input.getFirstTimestamp())
    const bins = Math.min(240, Math.max(48, Math.ceil(duration * 12)))
    const timestamps = Array.from({ length: bins }, (_, index) => origin + (index + 0.5) / bins * duration)
    const peaks = []
    for await (const chunk of new AudioBufferSink(track).buffersAtTimestamps(timestamps)) {
      signal.throwIfAborted()
      let peak = 0
      const timestamp = timestamps[peaks.length]
      if (chunk && timestamp <= chunk.timestamp + chunk.duration) {
        const { buffer } = chunk
        for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
          const data = buffer.getChannelData(channel)
          const stride = Math.max(1, Math.floor(data.length / 128))
          for (let i = 0; i < data.length; i += stride) peak = Math.max(peak, Math.abs(data[i]))
        }
      }
      peaks.push(peak)
    }
    return peaks
  } finally {
    signal.removeEventListener('abort', abort)
    input.dispose()
  }
}

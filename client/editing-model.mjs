export function createTimeline(source, duration) {
  return [{ id: 'initial', source, start: 0, end: duration }]
}

export function timelineLayout(clips) {
  let offset = 0
  return clips.map(clip => {
    const length = clip.end - clip.start
    const entry = { clip, offset, length }
    offset += length
    return entry
  })
}

export function locateTime(clips, seconds) {
  const layout = timelineLayout(clips)
  const last = layout.at(-1)
  if (!last || !Number.isFinite(seconds)) return null
  const position = Math.min(last.offset + last.length, Math.max(0, seconds))
  const entry = layout.find(item => position < item.offset + item.length) ?? last
  return { ...entry, position, sourceTime: Math.min(entry.clip.end, entry.clip.start + position - entry.offset) }
}

export function splitClip(clips, id, time, nextId) {
  const target = clips.find(clip => clip.id === id)
  if (!target || !Number.isFinite(time) || time - target.start < 1 / 30 || target.end - time < 1 / 30) return clips
  return clips.flatMap(clip => clip === target
    ? [{ ...clip, end: time }, { ...clip, start: time, id: nextId }]
    : [clip])
}

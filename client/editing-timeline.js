import React from 'react'
import { captionCurves, defaultCurve, sampleCurve } from './motion-curves.mjs'
import { copyFrame, timecode } from './storyboard.js'

const h = React.createElement
const percent = (part, total) => `${total ? part / total * 100 : 0}%`
const monitorTime = seconds => {
  const milliseconds = Math.floor(Math.max(0, seconds) * 1000)
  const pad = (value, length) => String(value).padStart(length, '0')
  return `${pad(Math.floor(milliseconds / 60000), 2)}:${pad(Math.floor(milliseconds / 1000) % 60, 2)}.${pad(milliseconds % 1000, 3)}`
}

export function CurveEditor({ value = defaultCurve, onChange, disabled, t }) {
  const draw = React.useCallback(canvas => {
    if (!canvas) return
    const context = canvas.getContext('2d')
    const { width, height } = canvas
    const left = 12, right = width - 12, top = 12, bottom = height - 12
    context.clearRect(0, 0, width, height)
    context.strokeStyle = '#3B424D'
    context.lineWidth = 1
    context.beginPath()
    for (let index = 0; index <= 8; index += 1) {
      const x = left + index / 8 * (right - left)
      const y = top + index / 8 * (bottom - top)
      context.moveTo(x, top)
      context.lineTo(x, bottom)
      context.moveTo(left, y)
      context.lineTo(right, y)
    }
    context.stroke()
    context.setLineDash([4, 4])
    context.beginPath()
    context.moveTo(left, bottom)
    context.lineTo(right, top)
    context.stroke()
    context.setLineDash([])
    context.beginPath()
    for (let index = 0; index <= 100; index += 1) {
      const x = left + index / 100 * (right - left)
      const y = bottom - sampleCurve(value, index / 100) * (bottom - top)
      if (index === 0) context.moveTo(x, y)
      else context.lineTo(x, y)
    }
    context.strokeStyle = '#6FA8E8'
    context.lineWidth = 3
    context.stroke()
    context.fillStyle = '#6FA8E8'
    for (const [x, y] of [[left, bottom], [right, top]]) {
      context.beginPath()
      context.arc(x, y, 4, 0, 2 * Math.PI)
      context.fill()
    }
  }, [value])

  return h('section', { className: 've-curve' },
    h('h3', null, t('字幕入场曲线', 'Caption entrance curve')),
    h('div', { className: 've-curve-body' },
      h('div', { role: 'group', 'aria-label': t('选择曲线', 'Choose curve') },
        captionCurves.map(curve => h('button', {
          type: 'button', key: curve.id, 'aria-pressed': value === curve.id, disabled,
          onClick: () => onChange(curve.id),
        }, t(curve.zh, curve.en)))),
      h('canvas', { ref: draw, width: 240, height: 170, role: 'img', 'aria-label': t('时间与入场进度', 'Time and entrance progress') }),
    ),
  )
}

function Waves({ source, clip }) {
  const paint = React.useCallback(canvas => {
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const { width, height } = canvas
    ctx.clearRect(0, 0, width, height)
    const data = source.waveform
    if (!data?.length) return
    const start = clip.start / source.duration * data.length
    const end = clip.end / source.duration * data.length
    const columns = Math.min(width / 3, Math.max(1, Math.ceil(end - start)))
    ctx.fillStyle = clip.muted ? '#70828F' : '#A5CEF5'
    for (let index = 0; index < columns; index += 1) {
      const bin = Math.min(data.length - 1, Math.floor(start + (end - start) * (index + 0.5) / columns))
      const amplitude = Math.max(0.8, Math.min(1, data[bin] * 2.3) * height / 2)
      ctx.fillRect(index * width / columns, height / 2 - amplitude, Math.max(1, width / columns * 0.57), amplitude * 2)
    }
  }, [source, clip])
  return h('canvas', { width: 360, height: 32, ref: paint, 'aria-hidden': true })
}

export function EditingTimeline({ layout, sources, location, duration, cursor, playing, busy, controls, t }) {
  const sourceMap = new Map(sources.map(source => [source.id, source]))
  const selected = location?.clip
  const ruler = Array.from({ length: 9 }, (_, i) => duration * i / 8)
  const tracks = [
    { id: 'V1', name: t('视频', 'Video') },
    { id: 'A1', name: t('原声', 'Audio') },
    { id: 'T1', name: t('字幕', 'Titles') },
  ]
  const clipContent = (track, source, clip) => {
    if (track === 'A1') return source.waveform
      ? h(React.Fragment, null, h('span', null, clip.muted ? t('已静音', 'Muted') : t('原声', 'Source audio')), h(Waves, { source, clip }))
      : null
    if (track === 'T1') return clip.caption
      ? h(React.Fragment, null, h('i', { 'aria-hidden': true }), h('span', null, clip.caption))
      : null
    const frame = source.frames.find(item => item.time >= clip.start) ?? source.frames.at(-1)
    return h(React.Fragment, null,
      frame && h('canvas', { width: frame.still.width, height: frame.still.height, ref: node => copyFrame(node, frame.still), 'aria-hidden': true }),
      h('span', null, source.file.name), h('small', null, timecode(clip.end - clip.start)),
    )
  }
  const commands = [
    [playing ? t('暂停', 'Pause') : t('播放', 'Play'), playing ? 'Ⅱ' : '▶', controls.play, !selected],
    [t('分割', 'Split'), '✂', controls.split, !selected],
    [t('前移', 'Move left'), '←', () => controls.move(-1), !selected || selected === layout[0].clip],
    [t('后移', 'Move right'), '→', () => controls.move(1), !selected || selected === layout.at(-1).clip],
    [t('删除', 'Remove'), '×', controls.remove, !selected],
  ]
  return h('section', { className: 've-panel ve-timeline', 'aria-label': t('时间轴', 'Timeline') },
    h('div', { className: 've-panel-head ve-timeline-bar' },
      h('h2', null, t('时间轴', 'Timeline')),
      h('div', { className: 've-tools' }, commands.map(([label, mark, action, disabled]) =>
        h('button', { type: 'button', key: label, onClick: action, disabled: busy || disabled, title: label, 'aria-label': label },
          h('span', { 'aria-hidden': true }, mark), h('span', { className: 've-tool-label' }, label)))),
      h('output', { className: 've-timecode' }, monitorTime(cursor)),
    ),
    h('div', { className: 've-track-grid' },
      h('div', { className: 've-track-labels' },
        h('span', { 'aria-hidden': true }),
        tracks.map(track => h('div', { key: track.id }, h('b', null, track.id), track.name))),
      h('div', { className: 've-track-body', style: { '--ve-cursor': percent(cursor, duration) } },
        h('div', { className: 've-ruler' },
          ruler.map((time, index) => h('span', { key: index, style: { '--ve-tick': `${index / 8 * 100}%` } }, duration || index === 0 ? timecode(time) : '')),
          h('input', { type: 'range', className: 've-scrub', min: 0, max: duration || 1, step: 'any', value: cursor,
            disabled: !selected || busy, 'aria-label': t('时间轴播放头', 'Timeline playhead'), onChange: event => controls.seek(Number(event.currentTarget.value)) })),
        tracks.map(track => h('div', { className: `ve-track-row ve-${track.id.toLowerCase()}`, key: track.id },
          layout.map(({ clip, offset, length }) => {
            const source = sourceMap.get(clip.source)
            const content = clipContent(track.id, source, clip)
            return h('div', { key: clip.id, className: 've-track-cell', style: { width: percent(length, duration) } },
              content && h('button', { type: 'button', 'aria-pressed': selected === clip,
                'aria-label': `${track.name} · ${source.file.name} · ${timecode(offset)}`,
                onClick: () => controls.select(clip.source, offset) }, content))
          }))),
        duration > 0 && h('span', { className: 've-playhead', 'aria-hidden': true }),
      ),
    ),
  )
}

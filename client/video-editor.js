import React from 'react'
import { copyFrame, MAX_BYTES, scanVideo, timecode } from './storyboard.js'
import { createTimeline, locateTime, splitClip, timelineLayout } from './editing-model.mjs'
import { captionMotion, drawCaption } from './editing-caption.mjs'
import { motionLibrary } from './motion-library.mjs'
import { CurveEditor, EditingTimeline } from './editing-timeline.js'

const h = React.createElement
const accept = 'video/*,.mp4,.webm,.mov'
const stages = [
  ['简报', 'Brief', '写下交付目标、受众和需要证明的主张。', 'Record the goal, audience and claim.'],
  ['分镜', 'Storyboard', '点击关键帧定位，在时间轴设置切点。', 'Jump to a key frame and place cuts on the timeline.'],
  ['带声粗剪', 'Rough cut', '调整镜头顺序，保留需要的同期声。', 'Reorder shots and keep the source audio you need.'],
  ['接续与动效', 'Motion', '选择动效素材，调整字幕入场曲线。', 'Choose motion assets and adjust the caption entrance curve.'],
  ['验收与交付', 'Review', '从头回放，核对画面和声音，再导出影片。', 'Play through the cut, check picture and audio, then export.'],
]

function download(blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 30000)
}

function button(label, onClick, disabled = false, className = '') {
  return h('button', { type: 'button', onClick, disabled, className }, label)
}

function frameImage(frame) {
  if (!frame) return null
  return h('canvas', { width: frame.still.width, height: frame.still.height, ref: node => copyFrame(node, frame.still), 'aria-hidden': true })
}

function motionThumbnail(preset) {
  return new URL(`./motion-assets/media/${preset.id}.jpg`, import.meta.url).href
}

function motionModule(preset) {
  return new URL(`./motion-assets/${preset.file}`, import.meta.url).href
}

function Preview({ source, location, playing, seekRequest, onTime, onEnd, onPlayError, ratio }) {
  const video = React.useRef(null)
  const overlay = React.useRef(null)
  const live = React.useRef(location)
  const callbacks = React.useRef({ onTime, onEnd, onPlayError })
  live.current = location
  callbacks.current = { onTime, onEnd, onPlayError }
  const clip = location?.clip
  const motion = React.useMemo(() => clip && captionMotion(clip), [clip])

  React.useEffect(() => {
    const player = video.current
    if (!player || !clip) return
    let cancelled = false
    function sync() {
      if (cancelled || !live.current) return
      const target = live.current.sourceTime
      if (Math.abs(player.currentTime - target) > 0.007) player.currentTime = target
      if (!playing) player.pause()
      else player.play().catch(error => { if (!cancelled && error.name !== 'AbortError') callbacks.current.onPlayError() })
    }
    if (player.readyState >= 1) sync()
    else player.addEventListener('loadedmetadata', sync, { once: true })
    return () => {
      cancelled = true
      player.removeEventListener('loadedmetadata', sync)
    }
  }, [source, clip?.id, seekRequest, playing])

  React.useEffect(() => {
    if (!playing || !clip) return
    const player = video.current
    let next
    function tick() {
      if (!player.seeking && !player.paused && player.currentTime >= clip.start) {
        if (player.currentTime >= clip.end) {
          player.pause()
          callbacks.current.onEnd(clip.id)
          return
        }
        callbacks.current.onTime(live.current.offset + player.currentTime - clip.start)
      }
      next = requestAnimationFrame(tick)
    }
    next = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(next)
  }, [clip, playing, seekRequest])

  React.useEffect(() => {
    const context = overlay.current?.getContext('2d')
    if (!context) return
    const { width, height } = context.canvas
    context.clearRect(0, 0, width, height)
    if (clip) drawCaption(context, width, height, clip, location.position - location.offset, motion)
  }, [location?.position, clip, motion, ratio.width, ratio.height])

  if (!source) return null
  return h('div', { className: 've-screen', style: { '--ve-ratio': ratio.width / ratio.height } },
    h('video', { key: source.id, ref: video, src: source.url, muted: clip.muted, playsInline: true,
      preload: 'auto', onEnded: () => onEnd(clip.id) }),
    h('canvas', { ref: overlay, width: ratio.width, height: ratio.height, 'aria-hidden': true }),
  )
}

export function VideoEditor({ locale }) {
  const zh = locale === 'zh-CN'
  const t = (cn, en) => zh ? cn : en
  const [sources, setSources] = React.useState([])
  const [libraryId, setLibraryId] = React.useState(null)
  const [clips, setClips] = React.useState([])
  const [cursor, setCursor] = React.useState(0)
  const [seekRequest, setSeekRequest] = React.useState(0)
  const [playing, setPlaying] = React.useState(false)
  const [busy, setBusy] = React.useState(null)
  const [message, setMessage] = React.useState(null)
  const [stage, setStage] = React.useState(1)
  const [brief, setBrief] = React.useState('')
  const [review, setReview] = React.useState('')
  const [tab, setTab] = React.useState('frames')
  const [presetId, setPresetId] = React.useState(motionLibrary[0].id)
  const [query, setQuery] = React.useState('')
  const operation = React.useRef(null)
  const waveJobs = React.useRef(new Set())
  const urls = React.useRef(new Set())
  const picker = React.useRef(null)
  React.useEffect(() => () => {
    operation.current?.abort()
    operation.current = null
    for (const job of waveJobs.current) job.abort()
    waveJobs.current.clear()
    for (const url of urls.current) URL.revokeObjectURL(url)
    urls.current.clear()
  }, [])
  const layout = timelineLayout(clips)
  const duration = layout.length ? layout.at(-1).offset + layout.at(-1).length : 0
  const location = locateTime(clips, cursor)
  const selected = location?.clip
  const activeSource = sources.find(source => source.id === selected?.source)
  const librarySource = sources.find(source => source.id === libraryId)
  const preset = motionLibrary.find(item => item.id === presetId)
  const first = sources.find(source => source.id === clips[0]?.source)
  const ratio = first ?? { width: 960, height: 540 }
  const title = sources[0]?.file.name.replace(/\.[^.]+$/, '') ?? t('未命名项目', 'Untitled project')

  function jump(time) {
    setCursor(Math.max(0, Math.min(duration, time)))
    setSeekRequest(count => count + 1)
  }

  function stopAt(time) {
    setPlaying(false)
    jump(time)
  }

  function nextClip(id) {
    const index = layout.findIndex(item => item.clip.id === id)
    if (index < 0 || location?.clip.id !== id) return
    const next = layout[index + 1]
    if (next) jump(next.offset)
    else stopAt(duration)
  }

  function loadWaveform(file, id, length) {
    const controller = new AbortController()
    waveJobs.current.add(controller)
    import('./waveform.mjs').then(({ readWaveform }) => readWaveform(file, length, controller.signal))
      .then(waveform => {
        if (waveform && !controller.signal.aborted) {
          setSources(current => current.map(source => source.id === id ? { ...source, waveform } : source))
        }
      })
      .catch(() => { /* Playback and export are independent of the waveform preview. */ })
      .finally(() => waveJobs.current.delete(controller))
  }

  async function addVideo(file, origin = null) {
    if ((!file && !origin) || operation.current) return
    if (file && (!file.size || file.size > MAX_BYTES)) {
      setMessage({ error: true, text: t('请选择不超过 500 MB 的非空视频。', 'Choose a non-empty video up to 500 MB.') })
      return
    }
    const controller = new AbortController()
    operation.current = controller
    setPlaying(false)
    setMessage(null)
    setBusy({ kind: 'import', progress: 0 })
    const generatedSample = !file
    let url
    try {
      if (!file) {
        const { renderMotionSample } = await import('./editing-export.mjs')
        const { renderFrame, duration } = await import(motionModule(origin))
        file = await renderMotionSample(origin.name, renderFrame, duration, controller.signal, progress => {
          if (operation.current === controller) setBusy({ kind: 'import', progress: Math.floor(progress * .45) })
        })
      }
      url = URL.createObjectURL(file)
      urls.current.add(url)
      const result = await scanVideo(url, controller.signal, progress => {
        if (operation.current === controller) {
          setBusy({ kind: 'import', progress: generatedSample ? 45 + Math.floor(progress * .55) : progress })
        }
      })
      controller.signal.throwIfAborted()
      const id = crypto.randomUUID()
      setSources(current => [...current, { ...result, id, file, url, origin }])
      loadWaveform(file, id, result.duration)
      const next = createTimeline(id, result.duration)[0]
      setClips(current => [...current, { ...next, id: crypto.randomUUID(), preset: origin?.id }])
      setCursor(duration)
      setSeekRequest(count => count + 1)
      setLibraryId(id)
      setStage(1)
      setTab('frames')
    } catch {
      if (url) {
        urls.current.delete(url)
        URL.revokeObjectURL(url)
      }
      if (!controller.signal.aborted) setMessage({ error: true, text: origin && !file
          ? t('浏览器无法生成动效样片。请尝试更新桌面浏览器。', 'The browser could not render the motion sample. Try a current desktop browser.')
          : t('浏览器无法解码此视频。请尝试 H.264 MP4 或 WebM。', 'The browser could not decode this video. Try H.264 MP4 or WebM.') })
    } finally {
      if (operation.current === controller) {
        operation.current = null
        setBusy(null)
      }
    }
  }

  function sourceFrame(frame) {
    const retained = layout.find(({ clip }) => clip.source === libraryId && frame.time >= clip.start && frame.time < clip.end)
    if (!retained) {
      setMessage({ text: t('这帧在源视频中，所在区间已从时间轴裁掉。', 'This source frame is outside the retained timeline ranges.') })
      return
    }
    setMessage(null)
    stopAt(retained.offset + frame.time - retained.clip.start)
  }

  function split() {
    if (!selected) return
    const next = splitClip(clips, selected.id, location.sourceTime, crypto.randomUUID())
    if (next === clips) return
    setClips(next)
    stopAt(cursor)
    setStage(2)
  }

  function move(delta) {
    const index = clips.indexOf(selected)
    const reordered = clips.slice()
    const destination = index + delta
    if (destination < 0 || destination >= clips.length) return
    reordered.splice(index, 1)
    reordered.splice(destination, 0, selected)
    setClips(reordered)
    stopAt(timelineLayout(reordered)[destination].offset)
    setStage(2)
  }

  function removeClip() {
    const remaining = clips.filter(clip => clip.id !== selected.id)
    const length = remaining.reduce((sum, clip) => sum + clip.end - clip.start, 0)
    setClips(remaining)
    stopAt(Math.min(location.offset, length))
    setStage(2)
  }

  function restoreSource() {
    if (!librarySource) return
    const clip = createTimeline(libraryId, librarySource.duration)[0]
    setClips([...clips, { ...clip, id: crypto.randomUUID(), preset: librarySource.origin?.id }])
    jump(duration)
  }

  function updateClip(values) {
    setClips(clips.map(clip => clip === selected ? { ...clip, ...values } : clip))
  }

  function saveSheet() {
    const sheet = {
      version: 1, title, brief, review, duration,
      sources: sources.map(({ id, file, duration, width, height, origin }) => ({ id, name: file.name, duration, width, height, origin })),
      clips: layout.map(({ clip, offset }) => ({ ...clip, at: offset, origin: motionLibrary.find(item => item.id === clip.preset) })),
    }
    download(new Blob([JSON.stringify(sheet, null, 2)], { type: 'application/json' }), `${title}.edit.json`)
  }

  async function render() {
    if (!clips.length || operation.current) return
    const controller = new AbortController()
    operation.current = controller
    setPlaying(false)
    setStage(4)
    setMessage(null)
    setBusy({ kind: 'export', progress: 0 })
    try {
      const { exportTimeline } = await import('./editing-export.mjs')
      const output = await exportTimeline(new Map(sources.map(item => [item.id, item])), clips, controller.signal, progress => {
        if (operation.current === controller) setBusy({ kind: 'export', progress })
      })
      controller.signal.throwIfAborted()
      download(output.blob, `${title}-cut.${output.extension}`)
      setMessage({ text: t(`已导出 ${output.extension.toUpperCase()}。`, `${output.extension.toUpperCase()} exported.`) })
    } catch (error) {
      if (!controller.signal.aborted) setMessage({ error: true, text: t(`导出失败。请使用支持 WebCodecs 的桌面 Chromium 浏览器。 ${error.message}`, `Export failed. ${error.message}`) })
    } finally {
      if (operation.current === controller) {
        operation.current = null
        setBusy(null)
      }
    }
  }

  function togglePlayback() {
    if (playing) setPlaying(false)
    else {
      if (cursor >= duration) jump(0)
      setPlaying(true)
    }
  }

  const stageCopy = zh ? 2 : 3
  const filteredPresets = motionLibrary.filter(item => `${item.name} ${item.role}`.toLowerCase().includes(query.trim().toLowerCase()))
  return h('section', { className: 've', 'aria-label': t('视频剪辑台', 'Video Editing Studio') },
    h('header', { className: 've-header' },
      h('div', { className: 've-identity' },
        h('span', { className: 've-mark', 'aria-hidden': true }, '▸'),
        h('div', null, h('h1', null, t('视频剪辑台', 'Video Editing Studio')), h('p', null, title)),
      ),
      h('div', { className: 've-actions' },
        h('input', { ref: picker, hidden: true, type: 'file', accept, onChange: event => {
          const file = event.currentTarget.files[0]
          const origin = event.currentTarget.dataset.origin === '1' ? preset : null
          event.currentTarget.value = ''
          void addVideo(file, origin)
        } }),
        button(t('＋ 导入视频', '＋ Import video'), () => { picker.current.dataset.origin = '0'; picker.current.click() }, !!busy),
        button(t('导出影片', 'Export film'), render, !clips.length || !!busy, 've-primary'),
      ),
    ),
    h('nav', { className: 've-workflow', 'aria-label': t('视频制作流程', 'Video production workflow') },
      stages.map((step, i) => h('button', { key: step[1], type: 'button', 'aria-current': stage === i ? 'step' : undefined,
        onClick: () => {
          setStage(i)
          if (i === 1) setTab('frames')
          if (i === 3) setTab('origin')
        } }, step[zh ? 0 : 1])),
    ),
    (busy || message) && h('div', { className: 've-status', role: message?.error ? 'alert' : 'status' },
      busy ? h(React.Fragment, null,
        h('span', null, busy.kind === 'import' ? t('正在提取分镜', 'Extracting storyboard') : t('正在导出', 'Exporting')),
        h('progress', { value: busy.progress, max: 100 }),
        h('span', null, `${busy.progress}%`),
        button(t('取消', 'Cancel'), () => operation.current?.abort()),
      ) : message.text,
    ),
    h('div', { className: 've-grid' },
      h('aside', { className: 've-panel ve-library' },
        h('div', { className: 've-panel-head' }, h('h2', null, t('素材', 'Media')), h('span', null, `${sources.length} ${t('个视频', 'videos')}`)),
        h('div', { className: 've-tabs' },
          [['frames', t('分镜', 'Storyboard')], ['origin', t('动效', 'Motion')]].map(([id, label]) =>
            h('button', { key: id, type: 'button', 'aria-pressed': tab === id, onClick: () => setTab(id) }, label)),
        ),
        tab === 'frames' ? h(React.Fragment, null,
          librarySource ? h(React.Fragment, null,
            h('select', { value: libraryId, 'aria-label': t('源视频', 'Source video'), onChange: e => setLibraryId(e.currentTarget.value) },
              sources.map(source => h('option', { key: source.id, value: source.id }, source.file.name))),
            h('div', { className: 've-frames' }, librarySource.frames.map(frame => h('button', { key: frame.time,
              type: 'button', 'aria-label': t(`定位分镜 ${timecode(frame.time)}`, `Jump to frame ${timecode(frame.time)}`),
              onClick: () => sourceFrame(frame) },
              frameImage(frame), h('span', null, timecode(frame.time))))),
            button(t('将完整素材加入时间轴', 'Add full source to timeline'), restoreSource, !!busy),
          ) : h('p', { className: 've-empty-copy' }, t('导入视频后自动提取关键画面。', 'Key frames appear after you import a video.')),
        ) : h(React.Fragment, null,
          h('input', { type: 'search', value: query, placeholder: t('搜索动效', 'Find motion'), 'aria-label': t('搜索动效', 'Find motion'), onChange: e => setQuery(e.currentTarget.value) }),
          h('div', { className: 've-presets' }, filteredPresets.length ? filteredPresets.map(item => h('button', {
            key: item.id, type: 'button', 'aria-pressed': presetId === item.id, onClick: () => setPresetId(item.id),
          }, h('span', null, item.name), h('small', null, zh ? item.role : `${Math.ceil(item.bytes / 1024)} KB`))) : h('p', null, t('没有匹配的动效。', 'No matching motion.'))),
          h('div', { className: 've-preset-details' },
            h('img', { src: motionThumbnail(preset), alt: '', decoding: 'async' }),
            h('strong', null, preset.name),
            h('div', { className: 've-actions' },
              h('a', { href: motionModule(preset), download: preset.file }, t('下载 .mjs', 'Download .mjs')),
            ),
            button(t('将示例加入时间轴', 'Add sample to timeline'), () => addVideo(null, preset), !!busy),
            button(t('导入自己的渲染视频', 'Import your rendered motion'), () => { picker.current.dataset.origin = '1'; picker.current.click() }, !!busy),
            selected && button(t('记为当前镜头参考', 'Attach as shot reference'), () => updateClip({ preset: preset.id }), !!busy),
          ),
        ),
      ),
      h('section', { className: 've-panel ve-monitor' },
        h('div', { className: 've-panel-head' }, h('h2', null, t('节目监看', 'Program monitor')),
          h('span', null, first ? `${first.width} × ${first.height}` : t('主序列', 'Main sequence'))),
        h('div', { className: 've-preview' },
          activeSource ? h(Preview, { source: activeSource, location, playing, seekRequest, ratio, onTime: setCursor, onEnd: nextClip,
            onPlayError: () => { setPlaying(false); setMessage({ error: true, text: t('预览播放失败。', 'Preview playback failed.') }) } })
            : h('div', { className: 've-empty-screen' },
              h('img', { src: motionThumbnail(motionLibrary[0]), alt: '', className: 've-cover' }),
              h('div', { className: 've-empty-mark', 'aria-hidden': true }, '▷'),
              h('strong', null, t('开始一条时间轴', 'Start a sequence')),
              h('span', null, t('导入本地视频，选择画面并开始粗剪。', 'Import a video, choose a frame and start cutting.')),
              button(t('试剪示例', 'Try sample'), () => addVideo(null, motionLibrary[0]), !!busy, 've-primary')),
        ),
        h('div', { className: 've-transport' },
          h('span', null, t('序列时长', 'Sequence duration')),
          h('small', null, timecode(duration)),
        ),
      ),
      h('aside', { className: 've-panel ve-inspector' },
        h('div', { className: 've-panel-head' }, h('h2', null, t('检查器', 'Inspector'))),
        h('div', { className: 've-stage-note' },
          h('strong', null, stages[stage][zh ? 0 : 1]), h('p', null, stages[stage][stageCopy])),
        stage === 0 && h('label', null, t('项目简报', 'Project brief'),
          h('textarea', { value: brief, onChange: e => setBrief(e.currentTarget.value), rows: 5, maxLength: 2000 })),
        selected && h('div', { className: 've-properties' },
          h('h3', null, activeSource.file.name),
          h('div', { className: 've-inout' },
            h('div', null, h('span', null, t('入点', 'In')), h('strong', null, timecode(selected.start))),
            h('div', null, h('span', null, t('出点', 'Out')), h('strong', null, timecode(selected.end)))),
          h('label', null, t('逐字字幕', 'Kinetic caption'), h('input', {
            value: selected.caption ?? '', onChange: e => updateClip({ caption: e.currentTarget.value }), maxLength: 64, disabled: !!busy,
          })),
          h('label', { className: 've-checkbox' }, h('input', { type: 'checkbox', checked: !!selected.muted, disabled: !!busy,
            onChange: e => updateClip({ muted: e.currentTarget.checked }) }), t('片段静音', 'Mute this clip')),
          selected.preset && h('p', null, h('span', null, t('动效参考 · ', 'Motion reference · ')), motionLibrary.find(item => item.id === selected.preset)?.name),
        ),
        (selected || stage === 3) && h(CurveEditor, { value: selected?.captionCurve,
          disabled: !selected || !!busy, onChange: captionCurve => {
            updateClip({ captionCurve })
            setStage(3)
          }, t }),
        stage === 4 && h('label', null, t('验收记录', 'Review notes'),
          h('textarea', { value: review, onChange: e => setReview(e.currentTarget.value), rows: 4, maxLength: 2000 })),
        button(t('下载剪辑表', 'Download edit sheet'), saveSheet, !sources.length && !brief, 've-sheet'),
      ),
    ),
    h(EditingTimeline, { layout, sources, location, duration, cursor, playing, busy: !!busy, t,
      controls: { play: togglePlayback, split, move, remove: removeClip, seek: stopAt,
        select: (id, time) => { stopAt(time); setLibraryId(id) } } }),
  )
}

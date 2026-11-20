import React from 'react'
import { VideoEditor } from './video-editor.js'

export function apply(ctx) {
  const titleKey = 'video-editor.home.title'
  ctx.locale.register('@agnes-local/video-editing-studio', {
    en: { [titleKey]: 'Video Editor' },
    'zh-CN': { [titleKey]: '视频剪辑台' },
  })
  ctx.homeEntries.register({
    id: 'video-editing-studio',
    titleKey,
    icon: 'play',
    placement: 'primary',
    order: 16,
    component() {
      const locale = React.useSyncExternalStore(ctx.locale.subscribe, ctx.locale.getSnapshot)
      return React.createElement(VideoEditor, { locale })
    },
  })
}

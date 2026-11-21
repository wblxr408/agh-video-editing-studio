# 视频剪辑台 · Video Editing Studio

这个市场版本提供 AGH 配置 Bundle。视频剪辑台的实际运行功能由独立组件 `@wblxr408/video-editing-studio-runtime` 提供。

## 安装

1. 安装经固定提交发布的运行组件。在 AGH 中审核其权限，再信任和启用。

   ```sh
   agh plugins add git:https://github.com/wblxr408/agh-video-editing-studio#ee44c939f0630531cbd563bc1a8d0034a5760a9c
   ```

2. 在 AGH 市场安装并启用 `@wblxr408/video-editing-studio` 2.0.0。从 AGH 侧栏打开视频剪辑台，使用分镜、时间轴和字幕编辑并导出本地视频。

市场包的智能体入口提供只读配置说明。实际界面由运行组件注册。

如果已安装本仓库的旧版插件，请先用市场 Bundle 更新旧版，再安装新的运行组件，避免同一功能同时加载两个版本。

[运行组件文档](https://github.com/wblxr408/agh-video-editing-studio/tree/runtime-v1.0.2) · [AGH 插件安装指南](https://github.com/AgnesAI-Labs/agnes-harness/blob/main/docs/guide/packages.zh-CN.md)

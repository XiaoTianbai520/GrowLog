# Windows 安装模板

`installer.nsi` 来自 Tauri 官方 `tauri-cli-v2.11.4`：
https://github.com/tauri-apps/tauri/blob/tauri-cli-v2.11.4/crates/tauri-bundler/src/bundle/windows/nsis/installer.nsi

只修改了一行：当前用户默认程序目录由 `$LOCALAPPDATA/枝序` 改为标准的 `$LOCALAPPDATA/Programs/枝序`。用户自选目录与覆盖安装路径的原有处理保持不变。升级 CLI 时需与上游模板重新比较。

本机 AppData 根目录带有 EFS 加密属性，原默认路径导致 NSIS 卸载器调用 `CopyFileW` 时返回 6000（ERROR_ENCRYPTION_FAILED），无法复制自身到临时目录；Programs 目录没有该属性。`hooks.nsh` 在安装前检查目标目录及最近的已存在父目录，拒绝不兼容的 EFS 程序目录，不更改加密、不解密笔记。此检查不限制独立数据目录。

压缩采用 zlib：WebView2 离线运行库本身已压缩，zlib 能显著缩短构建时间。安装和卸载图标使用应用自带图标。

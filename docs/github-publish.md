# GitHub 提交与发布

本项目把源码与安装包分开管理：源码进入 Git 仓库，编译产物进入 GitHub Release。`release/`、`.tools/`、`node_modules/`、`src-tauri/target/` 和测试结果已由 `.gitignore` 排除。

## 首次提交 0.2.0 源码

提交前执行：

```powershell
npm ci
npm run format:check
npm run build
npm test
./scripts/desktop.ps1 -Action test
git status --short
git diff --check
```

确认输出正常后提交源码：

```powershell
git add .
git status --short
git diff --cached --stat
git commit -m "feat: release GrowLog 0.2.0"
git push origin main
```

不要使用 `git add -f release/`。离线 Setup 大于 GitHub 普通 Git 文件的 100 MB 限制；误提交会导致推送失败，也会永久增大仓库历史。

## 创建 0.2.0 Release

源码推送后，以同一个提交创建带注释标签：

```powershell
git tag -a v0.2.0 -m "GrowLog 0.2.0"
git push origin v0.2.0
```

在 GitHub 仓库页面选择 **Releases → Draft a new release**，选择 `v0.2.0`，标题填写 `枝序 GrowLog 0.2.0`。发布说明可使用 `release/0.2.0-更新说明.txt`，并上传：

- `release/枝序-0.2.0-Setup.exe`：推荐安装包，包含 WebView2 离线组件。
- `release/枝序-0.2.0.exe`：独立运行版，需要系统已有 WebView2。
- `release/SHA256SUMS.txt`：校验文件。

不要上传旧版安装包或旧的 `枝序.exe`。发布前用下面的命令重新核对校验值：

```powershell
Get-FileHash -Algorithm SHA256 `
  release/枝序-0.2.0-Setup.exe, `
  release/枝序-0.2.0.exe
Get-Content release/SHA256SUMS.txt
```

也可以在 GitHub CLI 重新登录后一次完成 Release：

```powershell
gh auth login -h github.com -p https -w
gh release create v0.2.0 `
  "release/枝序-0.2.0-Setup.exe" `
  "release/枝序-0.2.0.exe" `
  "release/SHA256SUMS.txt" `
  --repo XiaoTianbai520/GrowLog `
  --title "枝序 GrowLog 0.2.0" `
  --notes-file "release/0.2.0-更新说明.txt"
```

## 发布后检查

1. Release 页面只包含 0.2.0 的三个附件，标签指向刚推送的源码提交。
2. 从 Release 页面重新下载 Setup，并对照 `SHA256SUMS.txt` 校验。
3. 检查 README 中的下载链接、截图和中文文件名是否正常显示。
4. 在可用的干净 Windows 虚拟机中补做离线安装验证；当前验证记录已明确说明该项尚未完成。

项目目前没有许可证文件。在决定开源许可前，仓库代码默认仍受版权保护；如果希望允许他人复制、修改和分发，应另行选择并添加 LICENSE。

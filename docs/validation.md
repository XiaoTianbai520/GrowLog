# 枝序 V1 验证记录

验证日期：2026-08-31 至 2026-09-01。当前环境：Windows x64（系统构建 26100），已安装 WebView2。笔记交互测试使用 `.tools/` 下隔离目录。安装验收不编辑正式笔记，对原有 3 个数据文件进行备份与 SHA-256 比较，始终保持一致；运行中的独立版没有被结束。

## 已完成

| 项目 | 结果 |
| --- | --- |
| TypeScript 和 Vite 生产构建 | 通过 |
| Rust 桌面程序编译 | 通过 |
| 保存队列测试 | 4 项通过：在途编辑不被覆盖、失败重试、重复 flush、中文输入法防抖 |
| Rust 核心测试 | 16 项通过：成就幂等及排序、过时写入、事务失败回滚、文件夹保留笔记、图片与设置备份恢复、损坏及较新备份、路径攻击、迁移回滚与重入、恢复中断找回、每日备份保留策略 |
| Rust Clippy 严格检查 | `--all-targets -- -D warnings` 通过 |
| 前端格式检查及依赖审计 | 通过；npm audit 未报告已知漏洞 |
| 真实 Tauri 桌面交互 | 通过，使用原生 IPC 与真实 SQLite，非浏览器模拟存储 |
| 图片粘贴和 asset protocol 显示 | 通过，PNG 被复制到独立数据目录 |
| 源图片被删除后的显示 | 通过，已复制的本地附件不受源文件删除影响 |
| 真实写入失败的界面恢复 | 通过，在隔离 SQLite 注入写入失败，草稿保留、切换被阻止、移除故障后重试成功 |
| 关闭前待保存内容 | 通过，原生关闭事件先提交，然后独立打开 SQLite 验证内容 |
| 重启与强制退出 | 通过，测试程序强制结束后已确认保存的内容仍存在，成就未重复计数 |
| 浅色 / 深色界面 | 已截图检查 |
| 编辑 / 分栏 / 阅读与收起导航 | 通过 |
| 125% / 150% 等效逻辑视口 | 已检查无整体横向溢出；不等于所有 Windows 物理显示器 DPI 验收 |
| 正式中文 NSIS Setup | 已生成，内嵌完整 WebView2 x64 离线运行库 |
| 第一次安装 / 同版本覆盖安装 / 重装 | 通过，最终安装在 `%LOCALAPPDATA%/Programs/枝序/` |
| 默认卸载保留数据 | 通过，正式数据文件 SHA-256 全部保持一致 |
| 桌面快捷方式 / Windows 卸载入口 | 通过，快捷方式目标和已安装 EXE 哈希正确 |
| EFS 程序目录防护 | 通过，不兼容目录被拒绝，未创建卸载入口；未改动系统加密设置 |
| EXE 系统依赖检查 | 没有额外 VC++ 运行库 DLL 依赖，依赖 Windows 系统 API 与 UCRT |

桌面交互脚本：`scripts/test_desktop.py`；关闭保存脚本：`scripts/test_close.py`；重启和异常退出脚本：`scripts/test_lifecycle.py`；保存失败与图片来源删除脚本：`scripts/test_editor_safety.py`。运行截图与 JSON 报告保存在忽略的 `test-results/` 目录。

## 安装包与本机兼容处理

正式文件：`release/枝序-0.1.0-Setup.exe`。NSIS 3.11 和 Tauri 插件的 SHA-1 与官方源码公布值一致。内嵌 WebView2 文件为 `MicrosoftEdgeWebView2RuntimeInstallerX64.exe`，258438352 字节，Windows Authenticode 状态为 Valid，签名者 Microsoft Corporation。没有将联网 bootstrapper 当成离线运行库。

用户授权后曾备份并临时解除两个 GitHub 下载 hosts 条目，下载超时后已逐字节恢复。随后通过验证 TLS 的官方 GitHub 下载节点取得组件；微软下载采用仅构建进程使用的 IPv4 CONNECT 通道解决连接超时，不修改系统代理。最终 hosts SHA-256 与原始备份一致：`7207381168D2DD0DCE5F6B6A64CEF10706DABE358E6DF6447A54C0135528F6EC`。没有关闭安全防护。

发现本机 AppData 根目录启用 EFS，原默认目录使卸载器 `CopyFileW` 返回 6000（ERROR_ENCRYPTION_FAILED）。默认位置改为标准 Programs 目录，并增加 EFS 程序目录安装前检查，未解密任何文件夹或笔记。重新生成正式 Setup 后，默认 `/S` 卸载及重装通过；最终通过的流程没有使用卸载绕过参数。模板来源及唯一上游修改见 `src-tauri/installer/README.md`。

安装测试：`scripts/test_installer.ps1 -Run`，仅适用于不存在已有安装的验收环境；不会覆盖其他已有安装。报告：`test-results/installer-test-report.json`。本次保留了正在运行的独立版，未对最终已安装程序单独执行一次新的完整启动会话；完整桌面交互已在同源 Tauri 调试构建中验证。

## 仍需环境验收

- 干净 Windows 10/11、没有 WebView2 时断网安装 Setup。
- 不同版本之间的真实覆盖升级（已测同版本覆盖，数据库迁移另有自动化测试）。
- 未签名安装包在目标电脑上的 SmartScreen 提示。
- 真实输入法候选窗口与不同显示器切换时的物理 DPI 行为。
- 真实磁盘写满、突然断电等硬件级故障（已测试事务注入失败，但不等价于断电实验）。

## 运行桌面测试

1. 使用 `scripts/desktop.ps1 -Action debug` 构建。
2. 设置新的 `GROWLOG_TEST_DATA_DIR`、独立 `WEBVIEW2_USER_DATA_FOLDER`，以及 `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222`。
3. 启动 `src-tauri/target/debug/growlog.exe`；测试目录模式会隐藏窗口。
4. 安装 Python Playwright 包后运行 `python scripts/test_desktop.py`，再运行 `python scripts/test_close.py`。

这些环境变量仅为开发验收服务，最终使用者不需要配置。测试使用 WebView2 内置浏览器，因此不需要额外下载 Playwright Chromium。

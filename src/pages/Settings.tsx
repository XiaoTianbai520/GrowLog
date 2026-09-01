import {
  Monitor,
  Sun,
  Moon,
  Download,
  ArchiveRestore,
  ShieldCheck,
  HardDrive,
  Check,
  Layers3,
  NotebookPen,
  CalendarDays,
  GitBranch,
  ListTodo,
} from 'lucide-react';
import type { Settings as Preferences, Snapshot, Theme } from '../types';
import { bytes } from '../lib/format';

export function SettingsPage({
  data,
  save,
  exportBackup,
  restoreBackup,
  busy,
}: {
  data: Snapshot;
  save: (settings: Preferences) => void;
  exportBackup: () => void;
  restoreBackup: (path?: string) => void;
  busy: boolean;
}) {
  const themes = [
    { id: 'light', label: '浅色', icon: Sun },
    { id: 'dark', label: '深色', icon: Moon },
    { id: 'system', label: '跟随系统', icon: Monitor },
  ] as const;
  return (
    <div className="page-scroll">
      <div className="page-content settings-page">
        <header className="page-heading">
          <div>
            <div className="eyebrow">让工作空间更合心意</div>
            <h1>设置</h1>
            <p>你的偏好，你的数据，都留在本机。</p>
          </div>
        </header>
        <section className="settings-section">
          <h2>外观</h2>
          <div className="setting-row">
            <div>
              <h3>界面主题</h3>
              <p>选择适合此刻光线的颜色</p>
            </div>
            <div className="theme-options">
              {themes.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  disabled={busy}
                  className={data.settings.theme === id ? 'selected' : ''}
                  onClick={() => save({ ...data.settings, theme: id as Theme })}
                >
                  <Icon size={17} />
                  {label}
                  {data.settings.theme === id && <Check size={13} />}
                </button>
              ))}
            </div>
          </div>
          <div className="setting-row">
            <div>
              <h3>成就解锁提醒</h3>
              <p>获得徽章时，显示一条轻量庆祝通知</p>
            </div>
            <button
              className={`switch ${data.settings.celebrations ? 'on' : ''}`}
              role="switch"
              aria-checked={data.settings.celebrations}
              aria-label="成就解锁提醒"
              disabled={busy}
              onClick={() => save({ ...data.settings, celebrations: !data.settings.celebrations })}
            >
              <span />
            </button>
          </div>
        </section>
        <section className="settings-section">
          <h2>数据与备份</h2>
          <div className="data-location">
            <HardDrive size={21} />
            <div>
              <strong>本地数据目录</strong>
              <p className="selectable">{data.dataDir}</p>
              <small>数据与软件安装位置分开保存，卸载默认保留数据。</small>
            </div>
          </div>
          <div className="backup-actions">
            <button className="secondary-button" disabled={busy} onClick={exportBackup}>
              <Download size={16} />
              导出全部数据
            </button>
            <button className="secondary-button" disabled={busy} onClick={() => restoreBackup()}>
              <ArchiveRestore size={16} />
              从备份恢复
            </button>
          </div>
          <p className="form-hint">
            备份包含笔记、图片、成就、等级经验与设置。恢复会整体替换当前数据，替换前自动保留一份备份。旧版备份不含经验。
          </p>
          <div className="setting-row">
            <div>
              <h3>每日自动备份</h3>
              <p>每个使用日备份一次，保留最近 7 份；软件关闭时不运行。</p>
            </div>
            <span className="enabled-label">
              <ShieldCheck size={15} />
              已启用
            </span>
          </div>
          {data.backupWarning && <div className="warning-banner">{data.backupWarning}</div>}
          <div className="backup-list">
            <div className="section-heading">
              <h3>本机备份</h3>
              <span className="muted">同磁盘备份无法防止磁盘损坏，建议定期导出到其他设备。</span>
            </div>
            {data.backups.length ? (
              data.backups.slice(0, 12).map((backup) => (
                <div className="backup-row" key={backup.name}>
                  <span>
                    <ShieldCheck size={15} />
                    <span className="selectable">{backup.name}</span>
                  </span>
                  <small>{bytes(backup.size)}</small>
                  <button className="text-button" disabled={busy} onClick={() => restoreBackup(backup.path)}>
                    恢复
                  </button>
                </div>
              ))
            ) : (
              <p className="muted">暂时没有备份，可先导出一份完整数据。</p>
            )}
          </div>
        </section>
        <section className="settings-section about-section">
          <img src="/mark.svg" alt="枝序图标" />
          <div>
            <h2>
              枝序 <span>GrowLog</span>
            </h2>
            <p>版本 0.2.1 · 本地个人工具箱</p>
            <small>没有账号，没有 AI，没有追踪。记录知识，看见成长。</small>
          </div>
        </section>
      </div>
    </div>
  );
}

export function ToolsPage() {
  return (
    <div className="page-scroll">
      <div className="page-content tools-page">
        <header className="page-heading">
          <div>
            <div className="eyebrow">为以后，留一点空间</div>
            <h1>更多工具</h1>
            <p>从笔记开始，慢慢长成适合你的工具箱。</p>
          </div>
        </header>
        <section className="tools-intro">
          <span className="empty-symbol">
            <Layers3 size={34} strokeWidth={1.4} />
          </span>
          <h2>好用的工具，不必一次备齐。</h2>
          <p>
            这一版先把记录与成长做好。
            <br />
            以后需要的新工具，会自然地加入左侧工作空间。
          </p>
        </section>
        <div className="section-heading">
          <h2>可能生长的方向</h2>
          <span className="muted">未来规划 · 当前未提供</span>
        </div>
        <div className="future-tools">
          {[
            { icon: CalendarDays, title: '日程', text: '为时间安排一个位置' },
            { icon: ListTodo, title: '待办', text: '把想做的事，一件件完成' },
            { icon: GitBranch, title: '技能树', text: '看见知识之间的连接' },
          ].map(({ icon: Icon, title, text }) => (
            <div className="future-tool" key={title}>
              <Icon size={23} strokeWidth={1.4} />
              <h3>{title}</h3>
              <p>{text}</p>
              <span>后续按需要扩展</span>
            </div>
          ))}
        </div>
        <div className="tools-footnote">
          <NotebookPen size={16} />
          现在，先记录一个值得留下的想法。
        </div>
      </div>
    </div>
  );
}

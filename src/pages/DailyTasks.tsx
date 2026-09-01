import { ArrowUpRight, CalendarCheck2, Check, Feather, History, Sunrise } from 'lucide-react';
import type { Growth } from '../types';
import { LevelProgress } from '../components/LevelProgress';

export function DailyTasks({
  growth,
  checkIn,
  writeNote,
}: {
  growth: Growth;
  checkIn: () => void;
  writeNote: () => void;
}) {
  const completed = growth.tasks.filter((t) => t.completedAt).length;
  const maximum = growth.tasks.reduce((sum, t) => sum + t.xp, 0);
  const day = new Date(`${growth.day}T12:00:00`);
  return (
    <div className="page-scroll">
      <div className="page-content daily-page">
        <header className="page-heading">
          <div>
            <div className="eyebrow">每天一点，慢慢积累</div>
            <h1>每日任务</h1>
            <p>签到、写下一点想法，让今天的成长看得见。</p>
          </div>
          <span className="local-pill">
            <Sunrise size={14} />
            {day.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })}
          </span>
        </header>
        <div className="daily-overview">
          <LevelProgress growth={growth} />
          <section className="daily-summary" aria-label="今日进展">
            <span className="subheading">今日进展</span>
            <div className="daily-count">
              <strong>{completed}</strong>
              <span>/ {growth.tasks.length} 项完成</span>
            </div>
            <p>
              已获得 <strong>{growth.todayXp}</strong> / {maximum} 经验
            </p>
            <span className="muted">
              {completed === growth.tasks.length
                ? '今天的任务完成了，按自己的节奏继续。'
                : '完成任务后，经验会自动记入。'}
            </span>
          </section>
        </div>
        <section className="daily-task-section">
          <div className="section-heading">
            <h2>今天的小目标</h2>
            <span className="muted">每天各奖励一次</span>
          </div>
          <div className="daily-task-list">
            {growth.tasks.map((task) => {
              const done = Boolean(task.completedAt);
              const Icon = task.id === 'check-in' ? CalendarCheck2 : Feather;
              return (
                <article className={`daily-task ${done ? 'completed' : ''}`} key={task.id}>
                  <span className="task-symbol">
                    <Icon size={23} strokeWidth={1.6} />
                  </span>
                  <div className="task-copy">
                    <h3>
                      {task.name}
                      <span className="xp-reward">+{task.xp} 经验</span>
                    </h3>
                    <p>{task.description}</p>
                    {done && (
                      <small>
                        <Check size={12} />
                        {new Date(task.completedAt!).toLocaleTimeString('zh-CN', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}{' '}
                        已完成 · 经验已到账
                      </small>
                    )}
                  </div>
                  <button
                    className={
                      done
                        ? 'secondary-button task-done'
                        : task.id === 'check-in'
                          ? 'primary-button'
                          : 'secondary-button'
                    }
                    disabled={done}
                    onClick={task.id === 'check-in' ? checkIn : writeNote}
                  >
                    {done ? (
                      <>
                        <Check size={15} />
                        {task.id === 'check-in' ? '今日已签到' : '今日已记录'}
                      </>
                    ) : task.id === 'check-in' ? (
                      `签到 +${task.xp} 经验`
                    ) : (
                      <>
                        去记笔记
                        <ArrowUpRight size={15} />
                      </>
                    )}
                  </button>
                </article>
              );
            })}
          </div>
          <p className="daily-rules">
            按电脑本地日期每日刷新。每 {growth.nextLevelXp}{' '}
            经验升一级；漏签、删除笔记均不扣经验。仅修改标题、标签、收藏或重复保存不会完成记笔记任务。
          </p>
        </section>
        <section className="experience-section">
          <div className="section-heading">
            <h2>经验记录</h2>
            <span className="muted">最近 30 次</span>
          </div>
          {growth.history.length ? (
            <ol className="experience-history">
              {growth.history.map((entry) => (
                <li key={`${entry.day}-${entry.task}`}>
                  <span className="experience-dot" aria-hidden="true" />
                  <div>
                    <strong>{entry.task === 'check-in' ? '每日签到' : '每日记笔记'}</strong>
                    <time dateTime={entry.completedAt}>
                      {entry.day} ·{' '}
                      {new Date(entry.completedAt).toLocaleTimeString('zh-CN', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </time>
                  </div>
                  <span>+{entry.xp} 经验</span>
                </li>
              ))}
            </ol>
          ) : (
            <div className="experience-empty">
              <History size={24} strokeWidth={1.4} />
              <p>还没有经验记录，完成今天的第一个任务吧。</p>
            </div>
          )}
        </section>
        <footer className="daily-footnote">
          经验从本版本开始积累，旧笔记不补发。等级只记录成长，不限制任何功能；所有经验记录都会随完整备份保存。
        </footer>
      </div>
    </div>
  );
}

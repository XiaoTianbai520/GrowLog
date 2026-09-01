import { ArrowRight, Plus, FileText, Clock3, LockKeyhole, PenLine } from 'lucide-react';
import type { Note, Route, Snapshot } from '../types';
import { Badge } from '../components/Badge';
import { LevelProgress } from '../components/LevelProgress';
import { excerpt, noteTitle, shortDate } from '../lib/format';

export function Home({
  data,
  openNote,
  createNote,
  navigate,
}: {
  data: Snapshot;
  openNote: (note: Note) => void;
  createNote: () => void;
  navigate: (route: Route) => void;
}) {
  const recent = data.notes.filter((n) => !n.deletedAt).slice(0, 5);
  const earned = data.achievements
    .filter((a) => a.unlockedAt)
    .sort((a, b) => b.unlockedAt!.localeCompare(a.unlockedAt!));
  const next = data.achievements.find((a) => !a.unlockedAt);
  const hour = new Date().getHours();
  return (
    <div className="page-scroll">
      <div className="page-content home-page">
        <header className="page-heading">
          <div>
            <div className="eyebrow">
              {new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })}
            </div>
            <h1>{hour < 11 ? '早上好' : hour < 18 ? '下午好' : '晚上好'}，慢慢生长。</h1>
            <p>把想法写下来，让每一小步都有迹可循。</p>
          </div>
          <span className="local-pill">
            <LockKeyhole size={12} />
            本地工作空间
          </span>
        </header>
        <div className="home-columns">
          <div className="home-main">
            <section className="continue-panel">
              <div className="continue-label">
                <PenLine size={16} />
                {recent.length ? '接着上一次的思路' : '从第一篇笔记开始'}
              </div>
              <h2>{recent.length ? noteTitle(recent[0].title) : '今天，有什么值得记下？'}</h2>
              <p>
                {recent.length
                  ? excerpt(recent[0].body)
                  : '一个灵感、一段学习心得，或一个小小的发现。\n不需要准备好，打开空白的一页就可以。'}
              </p>
              <div className="continue-actions">
                <button
                  className="primary-button"
                  onClick={() => (recent.length ? openNote(recent[0]) : createNote())}
                >
                  {recent.length ? '继续记录' : '写下第一篇'}
                  <ArrowRight size={15} />
                </button>
                {recent.length > 0 && (
                  <button className="text-button" onClick={createNote}>
                    <Plus size={15} />
                    新建笔记
                  </button>
                )}
              </div>
              <div className="branch-decoration" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
            </section>
            <section className="recent-section">
              <div className="section-heading">
                <h2>最近笔记</h2>
                <button className="text-button" onClick={() => navigate('notes')}>
                  查看全部
                  <ArrowRight size={14} />
                </button>
              </div>
              {recent.length ? (
                <div className="recent-list">
                  {recent.map((note) => (
                    <button className="recent-note" key={note.id} onClick={() => openNote(note)}>
                      <span className="note-glyph">
                        <FileText size={19} strokeWidth={1.5} />
                      </span>
                      <span className="recent-note-text">
                        <strong>{noteTitle(note.title)}</strong>
                        <small>{excerpt(note.body)}</small>
                      </span>
                      <time>{shortDate(note.updatedAt)}</time>
                      <ArrowRight size={15} />
                    </button>
                  ))}
                </div>
              ) : (
                <div className="recent-empty">
                  <FileText size={22} strokeWidth={1.3} />
                  <p>这里会留下你最近记录的想法。</p>
                  <button className="text-button" onClick={createNote}>
                    新建笔记
                  </button>
                </div>
              )}
            </section>
            <div className="quiet-note">
              <span className="small-branch">✧</span>
              <p>
                不必一次做很多。
                <br />
                <strong>持续记录，就是生长。</strong>
              </p>
            </div>
          </div>
          <aside className="home-growth">
            <LevelProgress growth={data.growth} openTasks={() => navigate('daily')} />
            <div className="section-heading">
              <h2>成长一瞥</h2>
              <span className="eyebrow">YOUR PACE</span>
            </div>
            <div className="growth-numbers">
              <div>
                <strong>{data.writtenCount.toString().padStart(2, '0')}</strong>
                <span>累计写成笔记</span>
              </div>
              <div>
                <strong>{earned.length.toString().padStart(2, '0')}</strong>
                <span>获得徽章</span>
              </div>
            </div>
            <section className="next-achievement">
              <div className="subheading">{earned.length ? '最近获得' : '下一枚徽章'}</div>
              <Badge name={(earned[0] || next)?.badge || 'sprout'} earned={Boolean(earned.length)} />
              <h3>{(earned[0] || next)?.name || '新的成长'}</h3>
              <p>{(earned[0] || next)?.description || '给下一个目标起个名字'}</p>
              {next && !earned.length && (
                <>
                  <progress value={next.progress} max={next.target} />
                  <small>
                    {next.progress} / {next.target} {next.unit}
                  </small>
                </>
              )}
              <button className="text-button" onClick={() => navigate('achievements')}>
                打开成就收藏
                <ArrowRight size={14} />
              </button>
            </section>
            <div className="home-tip">
              <Clock3 size={16} />
              <div>
                <strong>给记录一点时间</strong>
                <p>
                  笔记会自动保存。
                  <br />
                  下次打开，从这里继续。
                </p>
              </div>
            </div>
          </aside>
        </div>
        <footer className="home-footer">
          <span>枝序 GrowLog</span>
          <span>记录知识 · 看见成长</span>
        </footer>
      </div>
    </div>
  );
}

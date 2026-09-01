import { useState } from 'react';
import { Plus, Check, Pencil, Trash2, ArrowUpRight, RotateCcw, Flag } from 'lucide-react';
import type { Achievement, AchievementInput, BadgeName, Mutation, Snapshot } from '../types';
import { Badge, badges, badgeLabels } from '../components/Badge';
import { Modal } from '../components/Modal';
import { fullDate, shortDate } from '../lib/format';

export function AchievementForm({
  achievement,
  close,
  submit,
}: {
  achievement?: Achievement;
  close: () => void;
  submit: (input: AchievementInput) => Promise<void>;
}) {
  const [value, setValue] = useState<AchievementInput>(
    achievement
      ? { ...achievement }
      : { name: '', description: '', badge: 'star', mode: 'once', target: 1, unit: '次' },
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <Modal title={achievement ? '编辑成就' : '添加成就'} onClose={close}>
      <form
        className="achievement-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          try {
            await submit(value);
            close();
          } catch (err) {
            setError(String(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="form-intro">
          <Badge name={value.badge} />
          <p>
            为值得纪念的事，
            <br />
            <strong>留下一枚属于你的徽章。</strong>
          </p>
        </div>
        <label>
          成就名称
          <input
            required
            maxLength={60}
            autoFocus
            placeholder="例如：读完一本喜欢的书"
            value={value.name}
            onChange={(e) => setValue({ ...value, name: e.target.value })}
          />
        </label>
        <label>
          描述 <span className="muted">可选</span>
          <textarea
            rows={2}
            maxLength={500}
            placeholder="为什么这件事值得记录？"
            value={value.description}
            onChange={(e) => setValue({ ...value, description: e.target.value })}
          />
        </label>
        <fieldset>
          <legend>选择徽章</legend>
          <div className="badge-picker">
            {(Object.keys(badges) as BadgeName[]).map((name) => (
              <button
                key={name}
                type="button"
                aria-label={badgeLabels[name]}
                title={badgeLabels[name]}
                className={value.badge === name ? 'selected' : ''}
                onClick={() => setValue({ ...value, badge: name })}
              >
                <Badge name={name} small />
              </button>
            ))}
          </div>
        </fieldset>
        <label>
          完成方式
          <select
            value={value.mode}
            onChange={(e) =>
              setValue({
                ...value,
                mode: e.target.value as AchievementInput['mode'],
                target: 1,
                unit: e.target.value === 'auto' ? '篇' : '次',
              })
            }
          >
            <option value="once">手动确认 · 完成一次</option>
            <option value="counter">手动累计 · 记录进度</option>
            <option value="auto">自动解锁 · 累计笔记数量</option>
          </select>
        </label>
        {value.mode !== 'once' && (
          <div className="form-columns">
            <label>
              目标数量
              <input
                type="number"
                required
                min={1}
                max={1000000}
                step={1}
                value={value.target}
                onChange={(e) => setValue({ ...value, target: Number(e.target.value) })}
              />
            </label>
            <label>
              单位
              <input
                maxLength={12}
                value={value.unit}
                disabled={value.mode === 'auto'}
                placeholder="次、页、公里…"
                onChange={(e) => setValue({ ...value, unit: e.target.value })}
              />
            </label>
          </div>
        )}
        <p className="form-hint">
          {value.mode === 'auto'
            ? '笔记正文首次非空并保存后计入；删除笔记不扣除。已有记录也会计入新目标。'
            : value.mode === 'counter'
              ? '由你更新进度，达到目标时获得徽章。'
              : '由你确认完成；完成后也可以撤销。'}
          {achievement && ' 修改完成方式或目标数量会重置此成就的进度与获得日期。'}
        </p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="secondary-button" disabled={busy} onClick={close}>
            取消
          </button>
          <button className="primary-button" disabled={busy}>
            {busy ? '保存中…' : achievement ? '保存修改' : '添加成就'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function ProgressForm({
  achievement,
  close,
  submit,
}: {
  achievement: Achievement;
  close: () => void;
  submit: (progress: number) => Promise<void>;
}) {
  const [progress, setProgress] = useState(achievement.progress);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <Modal title="更新进度" onClose={close}>
      <form
        className="achievement-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await submit(progress);
            close();
          } catch (err) {
            setError(String(err));
            setBusy(false);
          }
        }}
      >
        <div className="form-intro">
          <Badge name={achievement.badge} />
          <p>
            <strong>{achievement.name}</strong>
            <br />
            目标 {achievement.target} {achievement.unit}
          </p>
        </div>
        <label>
          当前累计进度
          <input
            type="number"
            required
            min={0}
            max={achievement.target}
            step={1}
            value={progress}
            onChange={(e) => setProgress(Number(e.target.value))}
          />
        </label>
        <p className="form-hint">填写累计完成的数量。将进度调低到目标以下，会撤销当前完成状态。</p>
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={close}>
            取消
          </button>
          <button className="primary-button" disabled={busy}>
            保存进度
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function Achievements({
  data,
  add,
  edit,
  progress,
  mutate,
  remove,
}: {
  data: Snapshot;
  add: () => void;
  edit: (a: Achievement) => void;
  progress: (a: Achievement) => void;
  mutate: (m: Mutation) => void;
  remove: (a: Achievement) => void;
}) {
  const [filter, setFilter] = useState<'all' | 'progress' | 'earned'>('all');
  const earned = data.achievements
    .filter((a) => a.unlockedAt)
    .sort((a, b) => b.unlockedAt!.localeCompare(a.unlockedAt!));
  const items = data.achievements.filter(
    (a) => filter === 'all' || (filter === 'earned' ? a.unlockedAt : !a.unlockedAt),
  );
  return (
    <div className="page-scroll">
      <div className="page-content achievement-page">
        <header className="page-heading">
          <div>
            <div className="eyebrow">一点一滴，都有回响</div>
            <h1>成就</h1>
            <p>每一枚徽章，都是认真生活的痕迹。</p>
          </div>
          <button className="primary-button" onClick={add}>
            <Plus size={16} />
            添加成就
          </button>
        </header>
        <div className="achievement-summary">
          <div className="achievement-count">
            <strong>{earned.length.toString().padStart(2, '0')}</strong>
            <span>
              / {data.achievements.length.toString().padStart(2, '0')}
              <small>已获得的徽章</small>
            </span>
          </div>
          <div className="summary-track">
            <div>
              <span>你的成长收藏</span>
              <span>
                {data.achievements.length ? Math.round((earned.length / data.achievements.length) * 100) : 0}%
              </span>
            </div>
            <progress value={earned.length} max={data.achievements.length || 1} />
            <p>不必赶路，每一小步都算数。</p>
          </div>
          <div className="summary-badges">
            {(earned.length ? earned.slice(0, 3) : data.achievements.slice(0, 3)).map((a) => (
              <Badge key={a.id} name={a.badge} earned={Boolean(a.unlockedAt)} />
            ))}
          </div>
        </div>
        <div className="section-toolbar">
          <div className="tabs">
            {(['all', 'progress', 'earned'] as const).map((f) => (
              <button key={f} className={filter === f ? 'active' : ''} onClick={() => setFilter(f)}>
                {{ all: '全部成就', progress: '进行中', earned: '已获得' }[f]}
              </button>
            ))}
          </div>
          <span className="muted">{items.length} 项成就</span>
        </div>
        <div className="achievement-grid">
          {items.map((a) => (
            <article key={a.id} className={`achievement-card ${a.unlockedAt ? 'is-earned' : ''}`}>
              <div className="achievement-card-top">
                <Badge name={a.badge} earned={Boolean(a.unlockedAt)} />
                <span className={`achievement-status ${a.unlockedAt ? 'completed' : ''}`}>
                  {a.unlockedAt ? (
                    <>
                      <Check size={12} />
                      已获得
                    </>
                  ) : a.mode === 'auto' ? (
                    '自动记录'
                  ) : (
                    '自主目标'
                  )}
                </span>
              </div>
              <h3>{a.name}</h3>
              <p className="achievement-description">
                {a.description || (a.mode === 'auto' ? `累计写成 ${a.target} 篇笔记` : '为自己设定的小目标')}
              </p>
              <div className="progress-label">
                <span>{a.unlockedAt ? `${shortDate(a.unlockedAt)} 获得` : '完成进度'}</span>
                <span>
                  {a.progress} / {a.target} {a.unit}
                </span>
              </div>
              <progress value={a.progress} max={a.target} />
              <div className="achievement-card-footer">
                {a.mode === 'auto' ? (
                  <span className="muted">{a.builtin ? '枝序里程碑' : '根据笔记自动解锁'}</span>
                ) : (
                  <button
                    className="text-button"
                    onClick={() =>
                      a.mode === 'once'
                        ? mutate({ kind: 'setProgress', id: a.id, progress: a.unlockedAt ? 0 : 1 })
                        : progress(a)
                    }
                  >
                    {a.unlockedAt && a.mode === 'once' ? (
                      <>
                        <RotateCcw size={13} />
                        撤销完成
                      </>
                    ) : a.mode === 'once' ? (
                      <>
                        标记完成
                        <Check size={13} />
                      </>
                    ) : (
                      <>
                        更新进度
                        <ArrowUpRight size={13} />
                      </>
                    )}
                  </button>
                )}
                {!a.builtin && (
                  <div className="card-actions">
                    <button
                      className="icon-button"
                      aria-label={`编辑成就 ${a.name}`}
                      title="编辑成就"
                      onClick={() => edit(a)}
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`删除成就 ${a.name}`}
                      title="删除成就"
                      onClick={() => remove(a)}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
        {!items.length && (
          <div className="inline-empty">
            <Flag size={25} />
            <h3>{filter === 'earned' ? '第一枚徽章，从下一小步开始' : '为下一个目标留个位置'}</h3>
            <p>
              {filter === 'earned'
                ? '写成一篇笔记，就能获得「第一篇笔记」。'
                : '添加一个想做的目标，慢慢完成它。'}
            </p>
            <button className="text-button" onClick={add}>
              添加成就
              <Plus size={14} />
            </button>
          </div>
        )}
        <section className="growth-history">
          <div className="section-heading">
            <h2>成长记录</h2>
            <span className="muted">属于你的时间印记</span>
          </div>
          {earned.length ? (
            earned.map((a) => (
              <div className="history-item" key={a.id}>
                <span className="history-dot" />
                <time>{fullDate(a.unlockedAt!)}</time>
                <Badge name={a.badge} small />
                <span>
                  获得成就 <strong>{a.name}</strong>
                </span>
              </div>
            ))
          ) : (
            <p className="muted history-empty">完成目标后，获得的徽章会按时间记录在这里。</p>
          )}
        </section>
      </div>
    </div>
  );
}

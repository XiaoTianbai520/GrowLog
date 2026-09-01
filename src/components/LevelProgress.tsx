import { ArrowRight, Sprout } from 'lucide-react';
import type { Growth } from '../types';

export function LevelProgress({ growth, openTasks }: { growth: Growth; openTasks?: () => void }) {
  return (
    <section className="level-progress" aria-label="成长等级">
      <div className="level-heading">
        <span className="level-emblem">
          <Sprout size={24} strokeWidth={1.5} />
        </span>
        <div>
          <span className="subheading">我的成长</span>
          <h2>Lv. {growth.level}</h2>
        </div>
        <span className="level-total">累计 {growth.totalXp} 经验</span>
      </div>
      <progress aria-label="当前等级经验" value={growth.levelXp} max={growth.nextLevelXp} />
      <div className="level-caption">
        <span>
          {growth.levelXp} / {growth.nextLevelXp} 经验
        </span>
        <span>
          距离 Lv. {growth.level + 1} 还差 {growth.nextLevelXp - growth.levelXp}
        </span>
      </div>
      {openTasks && (
        <button className="text-button" onClick={openTasks}>
          今日任务 {growth.tasks.filter((t) => t.completedAt).length} / {growth.tasks.length}
          <ArrowRight size={14} />
        </button>
      )}
    </section>
  );
}

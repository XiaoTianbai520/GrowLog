import { Sprout, BookOpen, GitBranch, Award, Mountain, Star, Coffee, Heart } from 'lucide-react';
import type { BadgeName } from '../types';
export const badges = {
  sprout: Sprout,
  book: BookOpen,
  branch: GitBranch,
  award: Award,
  mountain: Mountain,
  star: Star,
  coffee: Coffee,
  heart: Heart,
};
export const badgeLabels: Record<BadgeName, string> = {
  sprout: '萌芽',
  book: '书页',
  branch: '枝叶',
  award: '奖章',
  mountain: '山峰',
  star: '星光',
  coffee: '咖啡',
  heart: '热爱',
};
export function Badge({
  name,
  earned = true,
  small = false,
}: {
  name: BadgeName;
  earned?: boolean;
  small?: boolean;
}) {
  const Icon = badges[name] || Award;
  return (
    <span className={`badge badge-${name} ${earned ? 'earned' : 'locked'} ${small ? 'small' : ''}`}>
      <Icon size={small ? 20 : 30} strokeWidth={1.5} />
    </span>
  );
}

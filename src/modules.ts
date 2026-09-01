import { House, NotebookPen, Award, Shapes, Settings2, CalendarCheck2 } from 'lucide-react';
import type { Route } from './types';

// Add a route and component when a future tool becomes usable. No empty feature stubs.
export const modules = [
  { id: 'home', name: '工作台', icon: House, route: 'home', enabled: true, group: 'main' },
  { id: 'notes', name: '笔记', icon: NotebookPen, route: 'notes', enabled: true, group: 'main' },
  { id: 'daily', name: '每日任务', icon: CalendarCheck2, route: 'daily', enabled: true, group: 'main' },
  { id: 'achievements', name: '成就', icon: Award, route: 'achievements', enabled: true, group: 'main' },
  { id: 'tools', name: '更多工具', icon: Shapes, route: 'tools', enabled: true, group: 'main' },
  { id: 'settings', name: '设置', icon: Settings2, route: 'settings', enabled: true, group: 'bottom' },
] satisfies { id: string; name: string; icon: typeof House; route: Route; enabled: boolean; group: string }[];

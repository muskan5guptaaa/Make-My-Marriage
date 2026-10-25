// Sidebar icons from the UI design: 18px, 1.4px stroke, currentColor.
const base = { width: 18, height: 18, viewBox: '0 0 18 18', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, 'aria-hidden': true };

export const DashboardIcon = () => (
  <svg {...base}><rect x="2" y="2" width="6" height="6" rx="1" /><rect x="10" y="2" width="6" height="6" rx="1" /><rect x="2" y="10" width="6" height="6" rx="1" /><rect x="10" y="10" width="6" height="6" rx="1" /></svg>
);
export const AskIcon = () => (
  <svg {...base}><path d="M3 4.5A1.5 1.5 0 0 1 4.5 3h9A1.5 1.5 0 0 1 15 4.5v6a1.5 1.5 0 0 1-1.5 1.5H8l-3.5 3v-3h0A1.5 1.5 0 0 1 3 10.5z" /><line x1="6.5" y1="6.5" x2="11.5" y2="6.5" /><line x1="6.5" y1="9" x2="10" y2="9" /></svg>
);
export const FunctionsIcon = () => (
  <svg {...base}><rect x="2" y="3" width="14" height="12" rx="1.5" /><line x1="2" y1="7" x2="16" y2="7" /><line x1="6" y1="2" x2="6" y2="4" /><line x1="12" y1="2" x2="12" y2="4" /></svg>
);
export const TasksIcon = () => (
  <svg {...base}><line x1="5" y1="4" x2="15" y2="4" /><line x1="5" y1="9" x2="15" y2="9" /><line x1="5" y1="14" x2="15" y2="14" /><circle cx="2.2" cy="4" r="0.8" fill="currentColor" stroke="none" /><circle cx="2.2" cy="9" r="0.8" fill="currentColor" stroke="none" /><circle cx="2.2" cy="14" r="0.8" fill="currentColor" stroke="none" /></svg>
);
export const GuestsIcon = () => (
  <svg {...base}><circle cx="7" cy="7" r="3.2" /><circle cx="12.5" cy="8.5" r="2.4" /></svg>
);
export const ExpensesIcon = () => (
  <svg {...base}><rect x="2" y="4" width="14" height="10" rx="2" /><circle cx="12.5" cy="9" r="1.1" fill="currentColor" stroke="none" /></svg>
);
export const GalleryIcon = () => (
  <svg {...base}><rect x="2" y="3" width="14" height="12" rx="1.5" /><circle cx="6.5" cy="7.5" r="1.4" /><polygon points="4,13 8,9 11,12 14,8 16,13" /></svg>
);
export const SettingsIcon = () => (
  <svg {...base}><line x1="3" y1="5" x2="15" y2="5" /><circle cx="7" cy="5" r="1.4" fill="var(--surface)" /><line x1="3" y1="9" x2="15" y2="9" /><circle cx="12" cy="9" r="1.4" fill="var(--surface)" /><line x1="3" y1="13" x2="15" y2="13" /><circle cx="9" cy="13" r="1.4" fill="var(--surface)" /></svg>
);

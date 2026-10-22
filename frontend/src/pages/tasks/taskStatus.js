export const TASK_STATUS = {
  todo: { label: 'TO DO', name: 'To do', next: 'in-progress' },
  'in-progress': { label: 'IN PROGRESS', name: 'In progress', next: 'done' },
  done: { label: 'DONE', name: 'Done', next: 'todo' },
};

export const TASK_FILTERS = [
  ['all', 'All'],
  ['todo', 'To do'],
  ['in-progress', 'In progress'],
  ['done', 'Done'],
];

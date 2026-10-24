// A shared payment has no individual project allocation. Never expand it to IDs.
export const ALL_PROJECTS = '__all_projects__';
export const ALL_PROJECTS_LABEL = 'Все проекты';

const id = value => value?._id ? String(value._id) : value ? String(value) : null;

export function projectSelection(op) {
  if (op?.projectScope === 'all') return [ALL_PROJECTS];
  const ids = op?.projectIds?.length ? op.projectIds : op?.projectId ? [op.projectId] : [];
  return ids.map(id).filter(Boolean);
}

export function projectFields(selection, fallback = null) {
  const ids = [...new Set((Array.isArray(selection) ? selection : [selection]).map(id).filter(Boolean))];
  if (ids.includes(ALL_PROJECTS)) return { projectScope: 'all', projectId: null, projectIds: [] };
  if (!ids.length && fallback) ids.push(id(fallback));
  return { projectScope: 'selected', projectId: ids[0] || null, projectIds: ids.length > 1 ? ids : [] };
}

export function projectLabel(op, projects = [], fallback = 'Без проекта') {
  if (op?.projectScope === 'all') return ALL_PROJECTS_LABEL;
  const ids = projectSelection(op);
  const names = ids.map(pid => projects.find(p => id(p) === pid)?.name
    || (op.projectId && id(op.projectId) === pid ? op.projectId.name : null)
    || op.projectIds?.find(p => id(p) === pid)?.name).filter(Boolean);
  return names.join(', ') || op?.projectName || fallback;
}

export function projectGroupId(op) {
  return op?.projectScope === 'all' ? ALL_PROJECTS : id(op?.projectId) || (projectSelection(op).length === 1 ? projectSelection(op)[0] : null);
}

export function equalProjectShares(projectIds, amount) {
  const ids = [...new Set(projectIds.map(id).filter(Boolean))];
  const units = Math.round(Math.abs(Number(amount)) * 100);
  if (!ids.length || !Number.isSafeInteger(units)) throw new Error('Некорректная сумма распределения');
  const base = Math.floor(units / ids.length);
  const remainder = units % ids.length;
  const sign = Number(amount) < 0 ? -1 : 1;
  return ids.map((projectId, index) => ({ projectId, amount: sign * (base + (index < remainder ? 1 : 0)) / 100 }));
}

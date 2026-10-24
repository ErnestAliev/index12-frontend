export const entityId = value => value?._id ? String(value._id) : value ? String(value) : null;

export function getSubcategoryName(operation, subcategories = []) {
  const value = operation?.subcategoryId;
  const item = subcategories.find(item => entityId(item) === entityId(value));
  return item?.name || (typeof value === 'object' ? value?.name : '') || '';
}

export function getCategoryDetailLabel(operation, categories = [], subcategories = [], fallback = 'Без категории') {
  const category = categories.find(item => entityId(item) === entityId(operation?.categoryId));
  const parent = category?.name || operation?.categoryId?.name || fallback;
  const child = getSubcategoryName(operation, subcategories);
  return child ? `${parent} → ${child}` : parent;
}

// A subcategory is a dimension of one payment, never an additional payment.
export function aggregateSubcategories(operations, categories = [], subcategories = []) {
  const groups = new Map();
  const seen = new Set();
  for (const op of operations || []) {
    if (!op || op.isDeleted || op.isPhantom || op.excludeFromTotals || op.isWorkAct) continue;
    const opId = entityId(op);
    if (opId && seen.has(opId)) continue;
    if (opId) seen.add(opId);
    const subId = entityId(op.subcategoryId);
    const sub = subcategories.find(item => entityId(item) === subId) || (typeof op.subcategoryId === 'object' ? op.subcategoryId : null);
    const parentId = entityId(sub?.parentCategoryId) || entityId(op.categoryId);
    const parent = categories.find(item => entityId(item) === parentId);
    const parentName = parent?.name || op.categoryId?.name || 'Без категории';
    const name = sub?.name || 'Без подкатегории';
    const key = `${parentId || 'none'}:${subId || 'none'}`;
    if (!groups.has(key)) groups.set(key, { _id: key, subcategoryId: subId, parentCategoryId: parentId, name: `${parentName} → ${name}`, income: 0, expense: 0, transfers: 0, balance: 0 });
    const row = groups.get(key);
    const amount = Math.abs(Number(op.amount) || 0);
    if (op.type === 'transfer' || op.isTransfer || op.transferGroupId) row.transfers += amount;
    else if (op.type === 'income') { row.income += amount; row.balance += amount; }
    else if (op.type === 'expense') { row.expense += amount; row.balance -= amount; }
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
}

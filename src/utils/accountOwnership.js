const entityId = value => value && typeof value === 'object' ? value._id : value;

export function isValidOwnerKey(key, companies, individuals) {
  if (typeof key !== 'string' || !key) return false;
  const type = key.startsWith('company-') ? 'company' : key.startsWith('individual-') ? 'individual' : null;
  if (!type) return false;
  const id = key.slice(type.length + 1);
  return (type === 'company' ? companies : individuals).some(item => String(item._id) === id);
}

export function getAccountOwnerKey(account, companies, individuals) {
  const companyId = entityId(account?.companyId);
  const individualId = entityId(account?.individualId);
  // A valid account has exactly one existing owner.
  if (!!companyId === !!individualId) return null;
  const key = companyId ? `company-${companyId}` : `individual-${individualId}`;
  return isValidOwnerKey(key, companies, individuals) ? key : null;
}

export function needsAccountOwnerRepair(accountId, selectedOwner, accounts, companies, individuals) {
  if (!accountId) return false;
  const account = accounts.find(item => String(item._id) === String(accountId));
  const owner = getAccountOwnerKey(account, companies, individuals);
  return !owner || owner !== selectedOwner;
}

export function accountOwnerUpdates(links, accounts, companies, individuals) {
  const owners = new Map();
  const updates = [];
  for (const { accountId, ownerKey } of links) {
    const account = accounts.find(a => String(a._id) === String(accountId));
    if (!account) throw new Error('Выберите существующий счёт или создайте новый.');
    if (!isValidOwnerKey(ownerKey, companies, individuals)) throw new Error('Выберите владельца счёта.');
    if (owners.has(String(accountId)) && owners.get(String(accountId)) !== ownerKey) {
      throw new Error('Для одного счёта нельзя указать разных владельцев.');
    }
    if (owners.has(String(accountId))) continue;
    owners.set(String(accountId), ownerKey);
    if (getAccountOwnerKey(account, companies, individuals) === ownerKey) continue;
    const company = ownerKey.startsWith('company-');
    const id = ownerKey.slice(company ? 'company-'.length : 'individual-'.length);
    updates.push({ _id: account._id, companyId: company ? id : null, individualId: company ? null : id });
  }
  return updates;
}

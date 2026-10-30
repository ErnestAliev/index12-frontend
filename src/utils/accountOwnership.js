const entityId = value => value && typeof value === 'object' ? value._id : value;

export function isValidOwnerKey(key, companies, individuals) {
  if (!key) return false;
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

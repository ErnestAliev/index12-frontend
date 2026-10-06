import { ref } from 'vue';

const idOf = value => String(value?._id ?? value ?? '');
const versionOf = op => Number(op?.syncVersion || 0);

// Local intent remains authoritative until its HTTP write finishes. Confirmed
// revisions and deletion markers then prevent late reads/socket messages from
// restoring an older chip. State is scoped to one workspace session.
export function createOperationSync() {
  const entries = ref({});
  const confirmed = new Map();
  const buffered = new Map();
  const queues = new Map();
  let sequence = 0;
  let clearedThrough = 0;
  let generation = 0;

  const isDeleted = op => [op?._id, op?._id2, op?.parentOpId]
    .some(id => id && entries.value[idOf(id)]?.kind === 'delete');

  function begin(op, kind = 'upsert', original = op) {
    const id = idOf(op);
    if (!confirmed.has(id) && !entries.value[id]?.pending) confirmed.set(id, original);
    const entry = { kind, op, pending: true, token: ++sequence };
    entries.value = { ...entries.value, [id]: entry };
    return entry.token;
  }

  function isCurrent(id, token) {
    return entries.value[idOf(id)]?.token === token;
  }

  function preview(id, token, op) {
    if (!isCurrent(id, token)) return;
    entries.value = { ...entries.value, [idOf(id)]: { ...entries.value[idOf(id)], op } };
  }

  function acknowledge(id, token, op) {
    if (token <= clearedThrough) return false;
    id = idOf(id);
    const entry = entries.value[id];
    if (!entry) return false;
    if (op && (!confirmed.has(id) || versionOf(op) >= versionOf(confirmed.get(id)))) confirmed.set(id, op);
    if (!isCurrent(id, token)) return false;
    const remote = buffered.get(id);
    buffered.delete(id);
    const latest = remote && versionOf(remote) > versionOf(op) ? remote : op;
    if (latest) confirmed.set(id, latest);
    entries.value = { ...entries.value, [id]: { ...entry, pending: false, op: latest || entry.op } };
    return true;
  }

  function reject(id, token) {
    id = idOf(id);
    if (!isCurrent(id, token)) return false;
    const remote = buffered.get(id);
    const known = confirmed.get(id);
    const original = remote && versionOf(remote) > versionOf(known) ? remote : known;
    buffered.delete(id);
    entries.value = { ...entries.value, [id]: {
      kind: 'upsert', op: original, pending: false, token,
    } };
    return true;
  }

  function receive(op) {
    if (!op?._id || isDeleted(op)) return false;
    const id = idOf(op);
    const entry = entries.value[id];
    const known = confirmed.get(id);
    if (known && versionOf(op) < versionOf(known)) return false;
    if (entry?.pending) {
      if (!buffered.has(id) || versionOf(op) > versionOf(buffered.get(id))) buffered.set(id, op);
      return false;
    }
    // Equal versions are duplicates, including an old unversioned echo after
    // acknowledgement when talking to a server that predates syncVersion.
    if (entry && versionOf(op) <= versionOf(entry.op)) return false;
    confirmed.set(id, op);
    if (entry) entries.value = { ...entries.value, [id]: { ...entry, op } };
    return true;
  }

  function apply(ops, dateKey = null) {
    const state = entries.value;
    const result = (Array.isArray(ops) ? ops : []).map(op => {
      const known = confirmed.get(idOf(op));
      return known && versionOf(known) > versionOf(op) ? known : op;
    }).filter(op => {
      if (!op || isDeleted(op)) return false;
      if (dateKey && op.dateKey !== dateKey) return false;
      return state[idOf(op)]?.kind !== 'upsert' && state[idOf(op._id2)]?.kind !== 'upsert';
    });
    for (const entry of Object.values(state)) {
      if (entry.kind !== 'upsert' || !entry.op || isDeleted(entry.op)) continue;
      if (!dateKey || entry.op.dateKey === dateKey) result.push(entry.op);
    }
    return result;
  }

  function reconcileDay(ops, dateKey) {
    ops.forEach(receive);
    const byId = new Map(ops.map(op => [idOf(op), op]));
    const next = { ...entries.value };
    let changed = false;
    for (const [id, entry] of Object.entries(next)) {
      if (entry.pending || entry.kind === 'delete' || entry.op?.dateKey !== dateKey) continue;
      const serverOp = byId.get(id);
      if (serverOp && versionOf(serverOp) < versionOf(entry.op)) continue;
      delete next[id];
      if (!serverOp) confirmed.delete(id);
      changed = true;
    }
    if (changed) entries.value = next;
  }

  function enqueue(id, write) {
    id = idOf(id);
    const previous = queues.get(id) || Promise.resolve();
    const requestGeneration = generation;
    const next = previous.catch(() => {}).then(() => {
      if (requestGeneration !== generation) throw new Error('Проект изменился до сохранения операции');
      return write();
    });
    queues.set(id, next);
    const cleanup = () => { if (queues.get(id) === next) queues.delete(id); };
    next.then(cleanup, cleanup);
    return next;
  }

  function clear() {
    generation++;
    clearedThrough = sequence;
    entries.value = {};
    confirmed.clear();
    buffered.clear();
    queues.clear();
  }

  return { entries, begin, preview, acknowledge, reject, receive, reconcileDay, apply, enqueue, isCurrent, isDeleted, clear };
}

const STORAGE_PREFIX = 'ai_snapshot_checksum';

const toNum = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const hashString = (input) => {
  const text = String(input || '');
  let hash = 5381;
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) + hash) + text.charCodeAt(i);
    hash |= 0;
  }
  return `h${(hash >>> 0).toString(16)}`;
};

export const computeSnapshotNet = (tooltipSnapshot) => {
  const days = Array.isArray(tooltipSnapshot?.days) ? tooltipSnapshot.days : [];
  return days.reduce((sum, day) => {
    const income = toNum(day?.totals?.income);
    const expense = toNum(day?.totals?.expense);
    return sum + (income - expense);
  }, 0);
};

export const buildSnapshotChecksum = (tooltipSnapshot) => {
  if (!tooltipSnapshot || typeof tooltipSnapshot !== 'object') return '';
  const startDateKey = String(tooltipSnapshot?.range?.startDateKey || '').trim();
  if (!startDateKey) return '';
  const net = Math.round(computeSnapshotNet(tooltipSnapshot));
  return hashString(`${startDateKey}|${net}`);
};

const makeStorageKey = ({ timelineDateKey, source = 'chat' }) => {
  const timeline = String(timelineDateKey || '').trim() || 'no_timeline';
  const mode = String(source || 'chat').trim() || 'chat';
  return `${STORAGE_PREFIX}:${timeline}:${mode}`;
};

export const evaluateSnapshotDataChange = ({
  checksum,
  timelineDateKey,
  source = 'chat'
} = {}) => {
  const normalizedChecksum = String(checksum || '').trim();
  if (!normalizedChecksum || source === 'quick_button') {
    return {
      isDataChanged: false,
      previousChecksum: '',
      snapshotChecksum: normalizedChecksum,
      storageKey: ''
    };
  }

  const storageKey = makeStorageKey({ timelineDateKey, source });
  let previousChecksum = '';
  try {
    previousChecksum = String(localStorage.getItem(storageKey) || '').trim();
    localStorage.setItem(storageKey, normalizedChecksum);
  } catch (_) {
    return {
      isDataChanged: false,
      previousChecksum: '',
      snapshotChecksum: normalizedChecksum,
      storageKey
    };
  }

  return {
    isDataChanged: Boolean(previousChecksum && previousChecksum !== normalizedChecksum),
    previousChecksum,
    snapshotChecksum: normalizedChecksum,
    storageKey
  };
};

export const clearSnapshotChecksumCache = ({
  timelineDateKey,
  source = 'chat'
} = {}) => {
  const storageKey = makeStorageKey({ timelineDateKey, source });
  try {
    localStorage.removeItem(storageKey);
  } catch (_) {
    // ignore storage errors
  }
};

export default {
  computeSnapshotNet,
  buildSnapshotChecksum,
  evaluateSnapshotDataChange,
  clearSnapshotChecksumCache
};

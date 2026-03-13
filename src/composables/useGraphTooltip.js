/**
 * Shared utilities for graph tooltips (desktop and mobile)
 */

export const formatNumber = (num) => {
    if (num == null || isNaN(num)) return '0';
    const abs = Math.abs(Number(num));
    return abs.toLocaleString('ru-RU', { maximumFractionDigits: 0 });
};

export const downloadTextFile = (text, filename = 'chart-tooltip.txt') => {
    try {
        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    } catch (e) {
        console.warn('[useGraphTooltip] export failed', e);
    }
};

export const copyToClipboard = async (text) => {
    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch (e) { }

    // Fallback
    try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        ta.style.top = '-9999px';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        const ok = document.execCommand('copy');
        ta.remove();
        return ok;
    } catch (e) {
        return false;
    }
};

export const escapeHtml = (s) => {
    if (!s) return '';
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
};

export const ICON_COPY =
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';

export const ICON_EXPORT =
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';

export const ICON_CHECK =
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';

const TOOLTIP_ACCOUNT_BALANCE_PREFIX = '__tooltip_account_balance__:';

const normalizeTooltipMarkers = (markers) => {
    const safe = Array.isArray(markers) ? markers : [];
    return Array.from(new Set(
        safe
            .map((marker) => String(marker || '').trim().toLowerCase())
            .filter((marker) => marker === 'income' || marker === 'expense')
    ));
};

const getTooltipMarkerMeta = (marker) => {
    if (marker === 'income') return { color: '#34c759', label: 'Доход' };
    if (marker === 'expense') return { color: '#ff3b30', label: 'Расход' };
    return null;
};

export const buildTooltipAccountBalanceLine = ({ name = 'Счет', balance = 0, balanceText = '', markers = [] } = {}) => {
    const payload = {
        name: String(name || 'Счет'),
        balance: Number.isFinite(Number(balance)) ? Number(balance) : 0,
        balanceText: String(balanceText || ''),
        markers: normalizeTooltipMarkers(markers)
    };
    return `${TOOLTIP_ACCOUNT_BALANCE_PREFIX}${JSON.stringify(payload)}`;
};

export const parseTooltipAccountBalanceLine = (line) => {
    if (line && typeof line === 'object') {
        return {
            name: String(line?.name || 'Счет'),
            balance: Number.isFinite(Number(line?.balance)) ? Number(line.balance) : 0,
            balanceText: String(line?.balanceText || ''),
            markers: normalizeTooltipMarkers(line?.markers)
        };
    }

    const raw = String(line || '');
    if (!raw.startsWith(TOOLTIP_ACCOUNT_BALANCE_PREFIX)) return null;
    try {
        const payload = JSON.parse(raw.slice(TOOLTIP_ACCOUNT_BALANCE_PREFIX.length));
        return {
            name: String(payload?.name || 'Счет'),
            balance: Number.isFinite(Number(payload?.balance)) ? Number(payload.balance) : 0,
            balanceText: String(payload?.balanceText || ''),
            markers: normalizeTooltipMarkers(payload?.markers)
        };
    } catch (error) {
        return null;
    }
};

export const formatTooltipAccountBalanceExportLine = (payload) => {
    const accountLine = parseTooltipAccountBalanceLine(payload);
    if (!accountLine) return String(payload || '');
    const markerText = accountLine.markers
        .map((marker) => (marker === 'income' ? '[+]' : '[-]'))
        .join(' ');
    const balanceText = accountLine.balanceText || `${formatNumber(accountLine.balance)} т`;
    return `${markerText ? `${markerText} ` : ''}${accountLine.name} — ${balanceText}`;
};

export const renderTooltipAccountBalanceHtml = (payload) => {
    const accountLine = parseTooltipAccountBalanceLine(payload);
    if (!accountLine) return '';

    const markersHtml = accountLine.markers
        .map((marker) => {
            const meta = getTooltipMarkerMeta(marker);
            if (!meta) return '';
            return `<span title="${escapeHtml(meta.label)}" aria-label="${escapeHtml(meta.label)}" style="width:8px; height:8px; border-radius:999px; background:${meta.color}; display:inline-block; flex:0 0 auto;"></span>`;
        })
        .join('');

    const balanceText = accountLine.balanceText || `${formatNumber(accountLine.balance)} т`;

    return `
        <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom: 2px;">
            <div style="display:flex; align-items:center; gap:8px; min-width:0; flex:1 1 auto;">
                ${markersHtml ? `<span style="display:inline-flex; align-items:center; gap:4px; flex:0 0 auto;">${markersHtml}</span>` : ''}
                <span style="color:var(--tooltip-text-main); font-weight:400; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(accountLine.name || 'Счет')}</span>
            </div>
            <span style="color:var(--tooltip-text-main); font-weight:500; white-space:nowrap; flex:0 0 auto;">${escapeHtml(balanceText)}</span>
        </div>
    `;
};

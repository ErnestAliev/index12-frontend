import { onMounted, onUnmounted, shallowRef } from 'vue';

// Canvas needs resolved CSS colors. Refresh both charts when the theme changes.
export const useGraphPalette = () => {
  const palette = shallowRef({
    balanceActive: '#c4d5e838',
    balanceIdle: '#c4d5e81f',
    balanceEdge: 'transparent',
    balanceBorderWidth: 0,
    income: '#34c759',
    expense: '#ff3b30',
  });
  let observer;

  onMounted(() => {
    const root = document.documentElement;
    const refresh = () => {
      const style = getComputedStyle(root);
      const color = (name, fallback) => style.getPropertyValue(name).trim() || fallback;
      const balance = color('--graph-line-balance', '#c4d5e8');
      palette.value = {
        balanceActive: color('--graph-balance-active', `${balance}38`),
        balanceIdle: color('--graph-balance-idle', `${balance}1f`),
        balanceEdge: color('--graph-balance-edge', 'transparent'),
        balanceBorderWidth: color('--graph-balance-edge', '') ? 1 : 0,
        income: color('--graph-bar-income', '#34c759'),
        expense: color('--graph-bar-expense', '#ff3b30'),
      };
    };
    refresh();
    observer = new MutationObserver(refresh);
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme', 'class', 'data-appearance-revision'] });
  });

  onUnmounted(() => observer?.disconnect());
  return palette;
};

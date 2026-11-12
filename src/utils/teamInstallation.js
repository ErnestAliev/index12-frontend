// An install offer is single-use. Consume it before awaiting anything so another
// setup view cannot try to reuse it after a dismissal, navigation or unmount.
export async function requestChatInstallation() {
  const offer = window.index12InstallPrompt;
  window.index12InstallPrompt = null;
  try {
    // Newer browsers can open installation directly, without waiting for an
    // engagement-based beforeinstallprompt event. Invoke within the user's tap.
    if (typeof navigator.install === "function") {
      await navigator.install();
      window.index12ChatInstalled = true;
      return { outcome: "accepted", confirmed: true };
    }
    if (!offer) return { outcome: "unavailable", confirmed: false };
    await offer.prompt();
    const choice = await offer.userChoice;
    return { outcome: choice?.outcome || "dismissed", confirmed: false };
  } catch (error) {
    if (error?.name === "AbortError")
      return { outcome: "dismissed", confirmed: false };
    throw error;
  }
}

export function chatInstallInstructions() {
  const agent = navigator.userAgent;
  const ios =
    /iPhone|iPad|iPod/.test(agent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (ios)
    return [
      "В Safari нажмите «Поделиться» → «На экран Домой» → «Добавить».",
      "Откройте Chat с новой иконки и войдите в свой аккаунт.",
    ];
  if (/Android/.test(agent))
    return [
      "В Chrome нажмите ⋮ → «Добавить на главный экран» → «Установить».",
      "Откройте Chat с новой иконки.",
    ];
  if (
    /Mac/.test(agent) &&
    /Safari/.test(agent) &&
    !/Chrome|Chromium|Edg/.test(agent)
  )
    return [
      "В Safari выберите «Файл» → «Добавить в Dock» → «Добавить».",
      "Откройте Chat из Dock.",
    ];
  if (/Chrome|Chromium/.test(agent) && !/Edg/.test(agent))
    return [
      "В Chrome нажмите ⋮ справа вверху → «Транслировать, сохранить, поделиться» → «Установить страницу как приложение».",
      "Для восстановления удалённой иконки откройте chrome://apps, нажмите правой кнопкой на Chat → «Создать ярлык».",
    ];
  return [
    "Откройте эту ссылку в Chrome. В меню ⋮ выберите «Транслировать, сохранить, поделиться» → «Установить страницу как приложение».",
  ];
}

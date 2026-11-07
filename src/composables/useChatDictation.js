import { ref, watch, onBeforeUnmount } from "vue";
export function useChatDictation({ getText, setText, onError }) {
  const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
  const recording = ref(false),
    supported = !!Speech;
  let recognition,
    generation = 0,
    settling = false,
    lastApplied = "";
  function stop() {
    generation++;
    recording.value = false;
    settling = false;
    const current = recognition;
    recognition = null;
    if (!current) return;
    current.onresult = null;
    current.onerror = null;
    current.onend = null;
    try {
      if (current.abort) current.abort();
      else current.stop();
    } catch {
      /* Already stopped. */
    }
  }
  function toggle() {
    if (recording.value) {
      settling = true;
      recording.value = false;
      try {
        recognition.stop();
      } catch {
        stop();
      }
      return;
    }
    if (!supported) return;
    stop();
    const ticket = ++generation,
      base = getText();
    lastApplied = base;
    const current = new Speech();
    recognition = current;
    current.lang = "ru-RU";
    current.continuous = true;
    current.interimResults = true;
    current.onresult = (event) => {
      if (ticket !== generation || (!recording.value && !settling)) return;
      const words = Array.from(event.results)
        .map((row) => row[0].transcript)
        .join(" ")
        .trim();
      lastApplied =
        base + (base && words && !/\s$/.test(base) ? " " : "") + words;
      setText(lastApplied);
    };
    current.onend = () => {
      if (ticket === generation) {
        recording.value = false;
        settling = false;
        recognition = null;
      }
    };
    current.onerror = (event) => {
      if (ticket !== generation) return;
      recording.value = false;
      settling = false;
      recognition = null;
      if (["aborted", "no-speech"].includes(event.error)) return;
      onError(
        event.error === "not-allowed" || event.error === "service-not-allowed"
          ? "Разрешите доступ к микрофону для диктовки."
          : "Не удалось распознать речь. Проверьте микрофон и подключение.",
      );
    };
    recording.value = true;
    try {
      current.start();
    } catch {
      stop();
      onError(
        "Не удалось включить голосовой ввод. Проверьте доступ к микрофону.",
      );
    }
  }
  watch(getText, (value) => {
    if ((recording.value || settling) && value !== lastApplied) stop();
  });
  onBeforeUnmount(stop);
  return { recording, supported, toggle, stop };
}

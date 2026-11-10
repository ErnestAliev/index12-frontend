// Decode locally: file bytes and generated thumbnails stay in the user's scoped cache.
let active = 0;
const jobs = [];
const cancelled = () => new DOMException("Thumbnail cancelled", "AbortError");
export function thumbnailJob(run, signal) {
  return new Promise((resolve, reject) => {
    const job = { run, resolve, reject, signal };
    job.cancel = () => {
      const index = jobs.indexOf(job);
      if (index >= 0) jobs.splice(index, 1);
      reject(cancelled());
    };
    if (signal?.aborted) {
      reject(cancelled());
      return;
    }
    signal?.addEventListener("abort", job.cancel, { once: true });
    jobs.push(job);
    pump();
  });
}
function pump() {
  while (active < 2 && jobs.length) {
    const job = jobs.shift();
    job.signal?.removeEventListener("abort", job.cancel);
    if (job.signal?.aborted) {
      job.reject(cancelled());
      continue;
    }
    active++;
    Promise.resolve()
      .then(job.run)
      .then(job.resolve, job.reject)
      .finally(() => {
        active--;
        pump();
      });
  }
}
export function mediaThumbnail(blob, kind, { signal, maxEdge = 640 } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(cancelled());
      return;
    }
    const video = kind === "video",
      media = document.createElement(video ? "video" : "img"),
      url = URL.createObjectURL(blob);
    let done = false,
      drawing = false;
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      media.onload =
        media.onerror =
        media.onloadeddata =
        media.onloadedmetadata =
        media.onseeked =
          null;
      if (video) {
        media.pause();
        media.removeAttribute("src");
        media.load();
      } else media.removeAttribute("src");
      URL.revokeObjectURL(url);
    };
    const finish = (error, result) => {
      if (done) return;
      done = true;
      cleanup();
      if (error) reject(error);
      else resolve(result);
    };
    const abort = () => finish(cancelled());
    const timer = setTimeout(
      () => finish(new Error("Предпросмотр недоступен")),
      15000,
    );
    async function draw() {
      if (done || drawing) return;
      if (video && media.readyState < 2) return;
      const width = video ? media.videoWidth : media.naturalWidth,
        height = video ? media.videoHeight : media.naturalHeight;
      if (!width || !height) return;
      drawing = true;
      try {
        const factor = Math.min(1, maxEdge / Math.max(width, height)),
          canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(width * factor));
        canvas.height = Math.max(1, Math.round(height * factor));
        const context = canvas.getContext("2d");
        if (!context) throw Error("Canvas unavailable");
        context.drawImage(media, 0, 0, canvas.width, canvas.height);
        const result = await new Promise((resolve) =>
          canvas.toBlob(resolve, video ? "image/jpeg" : "image/webp", 0.82),
        );
        canvas.width = canvas.height = 0;
        if (!result) throw Error("Thumbnail unavailable");
        finish(null, result);
      } catch (error) {
        finish(error);
      }
    }
    signal?.addEventListener("abort", abort, { once: true });
    media.onerror = () =>
      finish(new Error("Формат не поддерживается браузером"));
    if (video) {
      media.muted = true;
      media.playsInline = true;
      media.preload = "auto";
      let seek = false;
      media.onloadedmetadata = () => {
        const time =
          Number.isFinite(media.duration) && media.duration > 0.15
            ? Math.min(0.15, media.duration / 2)
            : 0;
        if (time > 0) {
          seek = true;
          media.currentTime = time;
        }
      };
      media.onloadeddata = () => {
        if (!seek || !media.seeking) void draw();
      };
      media.onseeked = () => void draw();
      media.src = url;
      media.load();
    } else {
      media.onload = () => void draw();
      media.src = url;
    }
  });
}

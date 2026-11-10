export const fileTypeLabels = {
  image: "Изображения",
  pdf: "PDF",
  spreadsheet: "Таблицы",
  document: "Документы",
  video: "Видео",
  audio: "Аудио",
  other: "Другие",
};
export const fileIcon = (type) =>
  ({
    image: "image",
    spreadsheet: "sheet",
    document: "file",
    pdf: "file",
    video: "video",
    audio: "audio",
  })[type] || "file";
export function fileMime(file) {
  if (file.mimeType?.toLowerCase() === "image/jpg") return "image/jpeg";
  if (file.mimeType && file.mimeType !== "application/octet-stream")
    return file.mimeType;
  const ext = file.name?.split(".").at(-1)?.toLowerCase();
  return (
    {
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      webp: "image/webp",
      gif: "image/gif",
      avif: "image/avif",
      heic: "image/heic",
      heif: "image/heif",
      bmp: "image/bmp",
      svg: "image/svg+xml",
      tif: "image/tiff",
      tiff: "image/tiff",
      pdf: "application/pdf",
      mp4: "video/mp4",
      webm: "video/webm",
      mov: "video/quicktime",
      m4v: "video/mp4",
      mp3: "audio/mpeg",
      wav: "audio/wav",
      ogg: "audio/ogg",
      m4a: "audio/mp4",
      txt: "text/plain",
      csv: "text/csv",
      json: "application/json",
    }[ext] || "application/octet-stream"
  );
}
export const fileSize = (bytes) =>
  bytes >= 1048576
    ? `${(bytes / 1048576).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} МБ`
    : `${Math.max(1, Math.ceil((bytes || 0) / 1024))} КБ`;
export const fileDay = (date) =>
  date
    ? new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Almaty",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(date))
    : "";
export const fileDate = (date) =>
  date
    ? new Date(date).toLocaleString("ru-RU", {
        timeZone: "Asia/Almaty",
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";
export const dayLabel = (day) =>
  day
    ? new Date(day + "T12:00:00Z").toLocaleDateString("ru-RU", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "Без даты";

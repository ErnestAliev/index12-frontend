const spreadsheets = new Set([
  "xlsx",
  "xls",
  "xlsm",
  "xlsb",
  "ods",
  "fods",
  "csv",
  "tsv",
  "numbers",
]);
const documents = new Set(["docx", "doc", "odt", "rtf", "pptx"]);
const texts = new Set([
  "txt",
  "text",
  "md",
  "markdown",
  "json",
  "xml",
  "html",
  "htm",
  "log",
  "yaml",
  "yml",
  "ini",
  "toml",
  "css",
  "js",
  "ts",
  "py",
  "sql",
  "tex",
]);
export function documentFormat(file) {
  const extension = (file?.name || "").split(".").at(-1).toLowerCase();
  if (
    spreadsheets.has(extension) ||
    documents.has(extension) ||
    texts.has(extension) ||
    extension === "gsheet"
  )
    return extension;
  const mime = (file?.mimeType || file?.type || "").toLowerCase().split(";")[0];
  if (mime.includes("spreadsheetml") || mime.includes("ms-excel"))
    return "xlsx";
  if (mime === "application/vnd.oasis.opendocument.spreadsheet") return "ods";
  if (mime.includes("wordprocessingml")) return "docx";
  if (mime === "application/msword") return "doc";
  if (mime === "application/vnd.oasis.opendocument.text") return "odt";
  if (mime === "text/csv" || mime === "text/tab-separated-values") return "csv";
  if (mime === "application/rtf" || mime === "text/rtf") return "rtf";
  if (
    mime.startsWith("text/") ||
    ["application/json", "application/xml"].includes(mime)
  )
    return "txt";
  return null;
}
export const isSpreadsheet = (format) => spreadsheets.has(format);

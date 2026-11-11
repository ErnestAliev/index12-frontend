// Persist commands as plain task text so the same intent reaches search, calendar and MCP.
export const taskInvoiceCommands = [
  { id: 'pay', label: 'Оплатить счёт', prefix: 'Оплатить счёт: ' },
  { id: 'issue', label: 'Выставить счёт', prefix: 'Выставить счёт: ' },
];
export function splitTaskInvoiceCommand(value = '') {
  const command = taskInvoiceCommands.find(item => value.startsWith(item.prefix.trimEnd()));
  return { command: command || null, text: command ? value.slice(command.prefix.trimEnd().length).replace(/^ /, '') : value };
}
export function setTaskInvoiceCommand(value, id) {
  const command = taskInvoiceCommands.find(item => item.id === id);
  const { text } = splitTaskInvoiceCommand(value);
  return command ? command.prefix + text : text;
}

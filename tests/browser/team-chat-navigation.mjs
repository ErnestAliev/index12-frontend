export async function selectSection(frame, label) {
  const select = frame.getByRole("combobox", {
    name: "Раздел чата",
    exact: true,
  });
  if (await select.count()) await select.selectOption({ label });
  else await frame.getByRole("tab", { name: new RegExp("^" + label) }).click();
}
export async function hasSection(frame, label) {
  const select = frame.getByRole("combobox", {
    name: "Раздел чата",
    exact: true,
  });
  if (await select.count())
    return select.locator("option").filter({ hasText: label }).count();
  return frame.getByRole("tab", { name: new RegExp("^" + label) }).count();
}

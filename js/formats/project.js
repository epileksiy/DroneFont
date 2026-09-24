// ---------------------------------------------------------------------------
// Родной формат проекта (.json) — для сохранения и продолжения редактирования.
// Пиксели пакуются в компактную base64-строку (4 бита на пиксель хватило бы,
// но проще и надёжнее — по 1 байту; gzip тут не нужен, json.gz усложнит UX).
// ---------------------------------------------------------------------------

export function buildProjectJSON({ projectName, modeId, charW, charH, characters }) {
  const packed = characters.map((px) => btoa(String.fromCharCode(...px)));
  const project = {
    app: "osd-font-editor",
    version: 1,
    projectName,
    modeId,
    charW,
    charH,
    charCount: characters.length,
    characters: packed,
  };
  return JSON.stringify(project);
}

export function parseProjectJSON(text) {
  const project = JSON.parse(text);
  if (project.app !== "osd-font-editor") {
    throw new Error("Это не файл проекта редактора OSD-шрифтов.");
  }
  const characters = project.characters.map((b64) => {
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr;
  });
  return {
    projectName: project.projectName || "Проект",
    modeId: project.modeId,
    charW: project.charW,
    charH: project.charH,
    charCount: project.charCount,
    characters,
  };
}

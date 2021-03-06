export type PropertyPath = (string | number | [string, number])[];

export function iteratePath(
  path: PropertyPath,
  obj: any,
  f?: (x: any) => void
) {
  for (const p of path) {
    if (p == "$") continue;
    if (!obj) break;

    f && f(obj);

    if (typeof p === "string" || typeof p === "number") {
      obj = obj[p];
    } else {
      // Sequence
      obj = obj[p[0]][p[1]];
    }
  }

  return obj;
}

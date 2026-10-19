import { isAbsolute, relative, resolve, sep } from "node:path";

export function isInside(root: string, target: string): boolean {
  const rel = relative(resolve(root), resolve(target));

  if (rel === "" || isAbsolute(rel)) {
    return false;
  }

  return rel !== ".." && !rel.startsWith(`..${sep}`);
}
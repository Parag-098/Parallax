import { createTwoFilesPatch, diffLines } from 'diff';
export interface DiffResult { patch: string; added: number; removed: number; }
export function compareText(before: string, after: string, path: string): DiffResult {
 const changes = diffLines(before, after); let added = 0, removed = 0;
 for (const c of changes) { if (c.added) added += c.count ?? 0; else if (c.removed) removed += c.count ?? 0; }
 return { patch: createTwoFilesPatch(path, path, before, after), added, removed };
}

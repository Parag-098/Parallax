import { createHash } from 'crypto';
export function hashContent(text: string): string { return createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex'); }
export function isSupportedText(buffer: Buffer): boolean { if (buffer.includes(0) || buffer.length > 10 * 1024 * 1024) return false; try { new TextDecoder('utf-8', { fatal: true }).decode(buffer); return true; } catch { return false; } }

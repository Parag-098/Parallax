/**
 * Exclusion pattern matching for Parallax.
 * Determines whether a file or directory path should be excluded from recording.
 */
import * as path from 'path';
import * as vscode from 'vscode';

/** Default patterns always excluded regardless of user config */
const DEFAULT_EXCLUDE_PATTERNS: string[] = [
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  'out',
  '.next',
  '.nuxt',
  'vendor',
  '__pycache__',
  '.venv',
  'venv',
  '.DS_Store',
];

export class ExclusionMatcher {
  private patterns: string[];

  constructor(extraPatterns: string[] = []) {
    const configured = this.getConfiguredPatterns();
    this.patterns = [
      ...new Set([...DEFAULT_EXCLUDE_PATTERNS, ...configured, ...extraPatterns]),
    ];
  }

  private getConfiguredPatterns(): string[] {
    try {
      const config = vscode.workspace.getConfiguration('parallax');
      const raw = config.get<string[]>('excludePatterns');
      return Array.isArray(raw) ? raw : [];
    } catch {
      return [];
    }
  }

  /**
   * Returns true when the given absolute or relative path should be excluded.
   */
  isExcluded(filePath: string): boolean {
    const normalised = filePath.replace(/\\/g, '/');
    const parts = normalised.split('/');

    for (const pattern of this.patterns) {
      // Simple directory-name match
      if (parts.includes(pattern)) {
        return true;
      }
      // Wildcard suffix match (e.g. *.log)
      if (pattern.startsWith('*')) {
        const ext = pattern.slice(1); // e.g. ".log"
        const basename = path.basename(normalised);
        if (basename.endsWith(ext)) {
          return true;
        }
      }
      // Suffix without wildcard treated as extension (e.g. ".lock")
      if (pattern.startsWith('.') && !pattern.startsWith('.*')) {
        const basename = path.basename(normalised);
        if (basename.endsWith(pattern)) {
          return true;
        }
      }
    }
    return false;
  }

  /** Reload patterns from configuration */
  refresh(): void {
    const configured = this.getConfiguredPatterns();
    this.patterns = [...new Set([...DEFAULT_EXCLUDE_PATTERNS, ...configured])];
  }

  getPatterns(): readonly string[] {
    return this.patterns;
  }
}

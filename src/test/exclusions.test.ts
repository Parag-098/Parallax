/**
 * Tests for exclusion pattern matching.
 * Tests the pure matching logic independent of VS Code APIs.
 */
import * as assert from 'assert';
import * as path from 'path';

/** Mirrors the ExclusionMatcher.isExcluded logic for unit testing */
function isExcluded(filePath: string, patterns: string[]): boolean {
  const normalised = filePath.replace(/\\/g, '/');
  const parts = normalised.split('/');

  for (const pattern of patterns) {
    if (parts.includes(pattern)) {
      return true;
    }
    if (pattern.startsWith('*')) {
      const ext = pattern.slice(1);
      const basename = path.basename(normalised);
      if (basename.endsWith(ext)) {
        return true;
      }
    }
    if (pattern.startsWith('.') && !pattern.startsWith('.*')) {
      const basename = path.basename(normalised);
      if (basename.endsWith(pattern)) {
        return true;
      }
    }
  }
  return false;
}

const DEFAULT_PATTERNS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  'out',
  '.next',
  '__pycache__',
];

describe('Exclusions', () => {
  describe('Default exclusions', () => {
    it('excludes node_modules directory', () => {
      assert.ok(isExcluded('/project/node_modules/react/index.js', DEFAULT_PATTERNS));
    });

    it('excludes nested node_modules', () => {
      assert.ok(isExcluded('/project/packages/core/node_modules/lodash/index.js', DEFAULT_PATTERNS));
    });

    it('excludes .git directory', () => {
      assert.ok(isExcluded('/project/.git/COMMIT_EDITMSG', DEFAULT_PATTERNS));
    });

    it('excludes dist directory', () => {
      assert.ok(isExcluded('/project/dist/bundle.js', DEFAULT_PATTERNS));
    });

    it('excludes build directory', () => {
      assert.ok(isExcluded('/project/build/output.js', DEFAULT_PATTERNS));
    });

    it('excludes coverage directory', () => {
      assert.ok(isExcluded('/project/coverage/lcov.info', DEFAULT_PATTERNS));
    });

    it('does not exclude regular source files', () => {
      assert.ok(!isExcluded('/project/src/app.ts', DEFAULT_PATTERNS));
    });

    it('does not exclude root package.json', () => {
      assert.ok(!isExcluded('/project/package.json', DEFAULT_PATTERNS));
    });

    it('does not exclude README.md', () => {
      assert.ok(!isExcluded('/project/README.md', DEFAULT_PATTERNS));
    });
  });

  describe('Configurable exclusions', () => {
    it('respects custom directory exclusion', () => {
      const patterns = [...DEFAULT_PATTERNS, 'generated'];
      assert.ok(isExcluded('/project/generated/models.ts', patterns));
      assert.ok(!isExcluded('/project/src/models.ts', patterns));
    });

    it('respects wildcard extension exclusion', () => {
      const patterns = [...DEFAULT_PATTERNS, '*.log'];
      assert.ok(isExcluded('/project/logs/app.log', patterns));
      assert.ok(!isExcluded('/project/src/app.ts', patterns));
    });

    it('respects .lock file exclusion', () => {
      const patterns = [...DEFAULT_PATTERNS, '*.lock'];
      // yarn.lock ends in .lock
      assert.ok(isExcluded('/project/yarn.lock', patterns));
      // package-lock.json does NOT end in .lock
      assert.ok(!isExcluded('/project/package-lock.json', patterns));
    });

    it('multiple custom patterns all work', () => {
      const patterns = [...DEFAULT_PATTERNS, 'tmp', '*.min.js', '__snapshots__'];
      assert.ok(isExcluded('/project/tmp/scratch.ts', patterns));
      assert.ok(isExcluded('/project/static/lib.min.js', patterns));
      assert.ok(isExcluded('/project/src/__snapshots__/test.snap', patterns));
    });
  });

  describe('Windows paths', () => {
    it('handles backslash separators', () => {
      assert.ok(isExcluded('C:\\project\\node_modules\\react\\index.js', DEFAULT_PATTERNS));
    });

    it('handles mixed separators', () => {
      assert.ok(isExcluded('C:/project/dist\\bundle.js', DEFAULT_PATTERNS));
    });
  });
});

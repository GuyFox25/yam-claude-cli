// Files that waste context when Read whole: lockfiles, build output, minified/generated code, huge files.
import { statSync } from 'node:fs';
import { basename } from 'node:path';
import { LOCKFILES } from './detect.mjs';

export const MAX_READ_BYTES = 256 * 1024;
const BUILD_DIRS = new Set(['dist', 'build', 'out', 'coverage', '.next', '.nuxt', '.turbo', '.cache', 'storybook-static']);
const GENERATED = [
  [/\.min\.(js|css)$/, 'is minified'],
  [/\.map$/, 'is a source map'],
  [/\.generated\.[^/]+$/, 'is generated'],
  [/(^|\/)__generated__\//, 'is generated'],
  [/(^|\/)meta\/[^/]*_snapshot\.json$/, 'is a generated Drizzle snapshot'],
];

// rel: posix path relative to the project root (case-folded on Windows). Returns why the file is heavy, or null.
export const heavyReason = (abs, rel) => {
  const name = basename(rel);
  if (LOCKFILES.includes(name)) return 'is a lockfile (for an installed version use `npm ls <pkg>` or node_modules/<pkg>/package.json)';
  const dir = rel.split('/').slice(0, -1).find((seg) => BUILD_DIRS.has(seg));
  if (dir) return `is build output (${dir}/); read the source instead`;
  const generated = GENERATED.find(([re]) => re.test(rel));
  if (generated) return generated[1];
  try {
    const { size } = statSync(abs);
    if (size > MAX_READ_BYTES) return `is ${Math.round(size / 1024)} KB`;
  } catch {
    // missing file: let Read report it
  }

  return null;
};

// Import specifiers in JS/TS source, and whether a specifier points at a given file.
import { dirname, resolve } from 'node:path';
import { IS_WIN, toPosix } from './detect.mjs';

// import/export ... from, import(), require(), side-effect import.
const SPEC_RE = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|^\s*import\s+)['"]([^'"]+)['"]/gm;
const CODE_EXT = /\.[cm]?[jt]sx?$/i;

export const importSpecs = (text) => [...String(text ?? '').matchAll(SPEC_RE)].map((m) => m[1]);

// Posix path without the code extension and a trailing /index, case-folded on Windows: comparable module id.
export const moduleId = (abs) => {
  const posix = toPosix(abs).replace(CODE_EXT, '').replace(/\/index$/, '');

  return IS_WIN ? posix.toLowerCase() : posix;
};

// Does the relative specifier `spec`, imported from `fromAbs`, resolve to `targetAbs`? (extension and /index optional)
export const resolvesTo = (fromAbs, spec, targetAbs) => {
  if (!spec.startsWith('.')) return false;

  // './user.js' in TS ESM points at user.ts: moduleId drops the extension on both sides.
  return moduleId(resolve(dirname(fromAbs), spec)) === moduleId(targetAbs);
};

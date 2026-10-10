// A short stack summary (client flavor + backend) cached per project in the hook state dir. session-context writes it
// at every session start; the status line reads it, because detecting the stack (walking client files) is too slow to
// run on every status refresh.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { statePath } from './edits.mjs';
import { detectBackend, detectClient } from './detect.mjs';

const cachePath = (root) => statePath(root, 'stack');

// { client: 'react-ts' | 'react-js' | null, backend: 'express' | 'nestjs' | 'node' | 'dotnet' | 'external' }
export const detectShortStack = (root, client = detectClient(root), backend = detectBackend(root)) => ({
  client: client ? `react-${client.lang}` : null,
  backend,
});

export const writeStackCache = (root, stack) => {
  try {
    mkdirSync(dirname(cachePath(root)), { recursive: true });
    writeFileSync(cachePath(root), JSON.stringify(stack));
  } catch {
    // the status line falls back to detecting it itself
  }
};

export const readStackCache = (root) => {
  try {
    return JSON.parse(readFileSync(cachePath(root), 'utf8'));
  } catch {
    return null;
  }
};

// react-ts, react-js+express, react-ts+dotnet, nestjs. An external backend (SAP, another repo) adds nothing.
export const formatStack = (stack) => [stack?.client, stack?.backend === 'external' ? null : stack?.backend].filter(Boolean).join('+');

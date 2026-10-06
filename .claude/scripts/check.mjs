#!/usr/bin/env node
// Usage: node .claude/scripts/check.mjs <test|lint|typecheck> [client|server|db|utils|dotnet|.|--changed ...] [-- extra args]
//        node .claude/scripts/check.mjs <test|lint|typecheck> --files <file...>   (only those files; see lib/scoped.mjs)
// Resolves the package manager and script name per package (or the dotnet CLI for a .NET backend),
// so callers never need project-specific commands.
import {
  projectRoot,
  existingPackages,
  existingTargets,
  resolveCheck,
  run,
  changedFiles,
  packageOf,
  resolveInRoot,
} from '../lib/detect.mjs';
import { scopedChecks } from '../lib/scoped.mjs';

const root = projectRoot();
const argv = process.argv.slice(2);
const dashIdx = argv.indexOf('--');
const own = dashIdx === -1 ? argv : argv.slice(0, dashIdx);
const extra = dashIdx === -1 ? [] : argv.slice(dashIdx + 1);
const [kind, ...targets] = own;

if (!['test', 'lint', 'typecheck'].includes(kind)) {
  process.stderr.write('Usage: check.mjs <test|lint|typecheck> [pkg... | --changed | --files <file...>] [-- extra args]\n');
  process.exit(1);
}

if (targets[0] === '--files') {
  const files = targets.slice(1).map((f) => resolveInRoot(root, f).rel);
  const results = scopedChecks(root, files, [kind]);
  if (!results.length) process.stdout.write(`[check] nothing to ${kind} for these files\n`);
  for (const r of results) {
    process.stdout.write(`[check] ${r.pkg}: ${r.label} ${r.status.toUpperCase()}${r.note ? ` (${r.note})` : ''}\n`);
    if (r.output) process.stdout.write(`${r.output}\n`);
  }
  process.exit(results.some((r) => r.status === 'fail') ? 1 : 0);
}

const resolveTargets = () => {
  const existing = existingTargets(root);
  if (targets.includes('--changed')) {
    const touched = new Set(changedFiles(root).map((f) => packageOf(root, f)).filter(Boolean));
    // utils holds shared TS schemas/types: its changes ripple to the other Node packages.
    if (touched.has('utils')) existingPackages(root).forEach((p) => touched.add(p));

    return existing.filter((p) => touched.has(p));
  }
  if (targets.length) {
    // A typo (or 'dotnet' when the .NET target is 'server') must fail loudly, not "skip" and look green.
    const unknown = targets.filter((t) => t !== '.' && !existing.includes(t));
    if (unknown.length) {
      process.stderr.write(`[check] unknown target(s): ${unknown.join(', ')}. Available: ${[...existing, '.'].join(', ')}\n`);
      process.exit(1);
    }

    return targets;
  }

  return existing.length ? existing : ['.'];
};

const pkgs = resolveTargets();
if (!pkgs.length) {
  process.stdout.write(`[check] no changed packages, nothing to ${kind}\n`);
  process.exit(0);
}

let failed = 0;
for (const pkg of pkgs) {
  const plan = resolveCheck(root, pkg, kind, extra);
  if (!plan || plan.skip) {
    process.stdout.write(`[check] ${pkg}: ${plan?.skip ?? `no ${kind} script`}, skipped\n`);
    continue;
  }
  process.stdout.write(`[check] ${pkg}: ${plan.label} ${extra.join(' ')}\n`);
  const { code } = run(plan.cmd, plan.args, { cwd: plan.cwd, inherit: true, timeout: 600_000 });
  if (code !== 0) {
    failed++;
    process.stdout.write(`[check] ${pkg}: ${kind} FAILED (exit ${code})\n`);
  }
}

process.exit(failed ? 1 : 0);

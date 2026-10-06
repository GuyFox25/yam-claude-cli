// Shared stdin/exit helpers for hooks. Exit 2 = block (stderr goes to Claude); exit 1 does NOT block.
export const block = (message) => {
  process.stderr.write(`${message}\n`);
  process.exit(2);
};

export const allow = () => process.exit(0);

// strict: guard hooks fail closed (block) on unparseable input instead of silently allowing.
export const readInput = async ({ strict = false } = {}) => {
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;
  try {
    return JSON.parse(raw || '{}');
  } catch {
    if (strict) block('Blocked: the hook could not parse its input JSON, so the action could not be checked.');

    return {};
  }
};

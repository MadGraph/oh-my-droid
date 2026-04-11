#!/usr/bin/env node
import { guardOmd } from './lib/omd-guard.mjs';

// Guard: skip hook if OMD is not enabled (vanilla droid mode)
await guardOmd();

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

async function main() {
  // Read stdin
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
  }

  try {
    const data = JSON.parse(input);
    const { processPreCompact } = await import('../dist/hooks/pre-compact/index.js');
    const result = await processPreCompact(data);
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error('[pre-compact] Error:', error.message);
    process.exit(0); // Don't block on errors
  }
}

main();

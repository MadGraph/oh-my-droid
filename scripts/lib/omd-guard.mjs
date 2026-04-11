/**
 * OMD Guard - Skip hooks unless OMD_ENABLED is set
 * 
 * This implements opt-in behavior:
 * - `droid` (vanilla) = OMD_ENABLED not set = hooks pass through (no effect)
 * - `omd` (wrapper)   = OMD_ENABLED=1 = hooks fully active
 * 
 * Usage in hook scripts:
 *   import { guardOmd, readStdin } from './lib/omd-guard.mjs';
 *   await guardOmd(); // Exits early if OMD_ENABLED is not set
 */

// Read all stdin
export async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

/**
 * Check if OMD is explicitly disabled (emergency override)
 */
export function isOmdDisabled() {
  const val = process.env.DISABLE_OMD;
  return val === '1' || val === 'true';
}

/**
 * Check if OMD is enabled (for scripts that need conditional behavior)
 * Emergency override: DISABLE_OMD always wins
 */
export function isOmdEnabled() {
  // Emergency override: DISABLE_OMD always wins
  if (isOmdDisabled()) return false;
  
  const val = process.env.OMD_ENABLED;
  return val === '1' || val === 'true';
}

/**
 * Guard function - exits early if OMD is NOT enabled (opt-in model)
 * Passes through stdin unchanged so hook has no effect
 * 
 * Environment variables checked (via isOmdEnabled):
 * - DISABLE_OMD=1 -> always disabled (emergency override)
 * - OMD_ENABLED=1 or OMD_ENABLED=true -> hooks active
 * - Otherwise -> hooks pass through
 */
export async function guardOmd() {
  if (!isOmdEnabled()) {
    // Pass through stdin unchanged - hook has no effect
    const stdin = await readStdin();
    try {
      const input = JSON.parse(stdin);
      console.log(JSON.stringify(input));
    } catch {
      // If not JSON, just pass through raw
      console.log(stdin);
    }
    process.exit(0);
  }
}

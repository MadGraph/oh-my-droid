/**
 * Environment Detection
 *
 * Detects available worker spawn modes (CMUX, tmux, nohup) and performs
 * smoke tests to validate CMUX functionality.
 */

import { execCommand, ExecErrorCode } from './exec-utils.js';
import type { WorkerMode } from './types.js';

/**
 * Result of environment detection
 */
export interface DetectionResult {
  /** Best available worker mode */
  mode: WorkerMode;
  /** Whether CMUX is available and functional */
  cmuxAvailable: boolean;
  /** Whether tmux is available */
  tmuxAvailable: boolean;
  /** Whether CMUX smoke test passed */
  cmuxSmokeTestPassed: boolean;
  /** Error message if detection failed */
  error?: string;
}

/**
 * Result of CMUX smoke test
 */
export interface SmokeTestResult {
  /** Whether the smoke test passed */
  passed: boolean;
  /** Error message if test failed */
  error?: string;
}

/**
 * Check if CMUX environment variable is set
 *
 * @returns true if CMUX_SURFACE_ID is set
 */
export function hasCmuxEnv(): boolean {
  return !!process.env.CMUX_SURFACE_ID;
}

/**
 * Perform CMUX smoke test
 *
 * Actually runs a CMUX command to verify it works.
 * Uses read-screen on the current surface (from env var) as a harmless test.
 *
 * @returns SmokeTestResult with passed status and optional error
 */
export function cmuxSmokeTest(): SmokeTestResult {
  const surfaceId = process.env.CMUX_SURFACE_ID;
  if (!surfaceId) {
    return { passed: false, error: 'CMUX_SURFACE_ID not set' };
  }

  // Try a harmless CMUX command that returns quickly
  const result = execCommand(
    `cmux read-screen --surface surface:${surfaceId} --lines 1`,
    { timeoutMs: 5000 }
  );

  if (!result.success) {
    // Distinguish between command not found and other errors
    if (result.errorCode === ExecErrorCode.COMMAND_NOT_FOUND) {
      return { passed: false, error: 'cmux command not found' };
    }
    return { passed: false, error: result.errorMessage };
  }

  return { passed: true };
}

/**
 * Check if tmux is available
 *
 * @returns true if inside tmux session OR tmux command exists
 */
export function isTmuxAvailable(): boolean {
  // Check if already inside a tmux session
  if (process.env.TMUX) {
    return true;
  }

  // Check if tmux command exists
  const result = execCommand('which tmux', { timeoutMs: 2000 });
  return result.success && result.output.length > 0;
}

/**
 * Detect the best available worker mode
 *
 * Priority order:
 * 1. CMUX (if env var set AND smoke test passes)
 * 2. tmux (if available)
 * 3. nohup (always available, but deferred to v4)
 *
 * @returns DetectionResult with mode and availability flags
 */
export function detectWorkerMode(): DetectionResult {
  const cmuxEnv = hasCmuxEnv();
  let cmuxSmoke: SmokeTestResult = { passed: false, error: undefined };

  // Only run smoke test if env var is set
  if (cmuxEnv) {
    cmuxSmoke = cmuxSmokeTest();
  }

  const tmuxAvailable = isTmuxAvailable();

  // Determine best mode
  let mode: WorkerMode;
  if (cmuxEnv && cmuxSmoke.passed) {
    mode = 'cmux';
  } else if (tmuxAvailable) {
    mode = 'tmux';
  } else {
    mode = 'nohup';
  }

  return {
    mode,
    cmuxAvailable: cmuxEnv && cmuxSmoke.passed,
    tmuxAvailable,
    cmuxSmokeTestPassed: cmuxSmoke.passed,
    error: cmuxSmoke.error,
  };
}

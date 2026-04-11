// src/team/cmux-worker.ts
import { execCommand, ExecResult } from './exec-utils.js';
import { WorkerConfig, WorkerHandle } from './types.js';

const SURFACE_REGEX = /surface:(\d+)/;

export interface CmuxSpawnResult {
  success: boolean;
  handle?: WorkerHandle;
  error?: string;
}

/**
 * Parse surface ID from cmux new-split output
 * Output format: "OK surface:XX workspace:Y"
 */
function parseSurfaceId(output: string): string | null {
  const match = output.match(SURFACE_REGEX);
  if (!match) return null;
  // Return full format "surface:XX" as required by API
  return `surface:${match[1]}`;
}

/**
 * Build the droid exec command from config
 */
function buildDroidCommand(config: WorkerConfig): string {
  let cmd = `droid exec --auto ${config.autoLevel} -f ${config.promptFile}`;
  if (config.model) {
    cmd += ` --model ${config.model}`;
  }
  return cmd;
}

/**
 * Spawn a worker in a new CMUX split
 *
 * Commands used (verified):
 * - cmux new-split right → "OK surface:XX workspace:Y"
 * - cmux send --surface surface:XX "cmd" → OK
 * - cmux send-key --surface surface:XX Return → OK
 */
export function spawnCmuxWorker(config: WorkerConfig): CmuxSpawnResult {
  // Step 1: Create split
  const splitResult = execCommand('cmux new-split right', { timeoutMs: 10000 });

  if (!splitResult.success) {
    return {
      success: false,
      error: `Failed to create split: ${splitResult.errorMessage}`,
    };
  }

  const surfaceId = parseSurfaceId(splitResult.output);
  if (!surfaceId) {
    return {
      success: false,
      error: `Failed to parse surface ID from: ${splitResult.output}`,
    };
  }

  // Step 2: Send droid exec command
  const droidCmd = buildDroidCommand(config);
  // Escape double quotes in command
  const escapedCmd = droidCmd.replace(/"/g, '\\"');
  const sendResult = execCommand(
    `cmux send --surface ${surfaceId} "${escapedCmd}"`,
    { timeoutMs: 5000 }
  );

  if (!sendResult.success) {
    // Attempt cleanup
    execCommand(`cmux close-surface --surface ${surfaceId}`);
    return {
      success: false,
      error: `Failed to send command: ${sendResult.errorMessage}`,
    };
  }

  // Step 3: Send Return key to execute
  const keyResult = execCommand(
    `cmux send-key --surface ${surfaceId} Return`,
    { timeoutMs: 5000 }
  );

  if (!keyResult.success) {
    // Attempt cleanup
    execCommand(`cmux close-surface --surface ${surfaceId}`);
    return {
      success: false,
      error: `Failed to send Return key: ${keyResult.errorMessage}`,
    };
  }

  return {
    success: true,
    handle: {
      id: config.id,
      surfaceId,
      status: 'running',
      startedAt: Date.now(),
    },
  };
}

/**
 * Read screen content from a worker's surface
 */
export function readCmuxScreen(surfaceId: string, lines: number = 50): ExecResult {
  return execCommand(
    `cmux read-screen --surface ${surfaceId} --lines ${lines}`,
    { timeoutMs: 5000 }
  );
}

/**
 * Close a worker's surface
 */
export function closeCmuxWorker(surfaceId: string): ExecResult {
  return execCommand(
    `cmux close-surface --surface ${surfaceId}`,
    { timeoutMs: 5000 }
  );
}

/**
 * Check if worker appears to have completed by reading screen
 * Looks for completion markers in output
 */
export function checkCmuxWorkerCompletion(surfaceId: string): {
  completed: boolean;
  output: string;
} {
  const result = readCmuxScreen(surfaceId, 100);
  if (!result.success) {
    return { completed: false, output: '' };
  }

  // Look for completion markers
  const completionMarkers = [
    'Task completed',
    'DONE',
    'All tasks completed',
    '✓ Completed',
  ];

  const completed = completionMarkers.some(marker =>
    result.output.includes(marker)
  );

  return { completed, output: result.output };
}

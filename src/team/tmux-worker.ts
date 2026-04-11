// src/team/tmux-worker.ts
import { execCommand, ExecResult } from './exec-utils.js';
import { WorkerConfig, WorkerHandle } from './types.js';

export interface TmuxSpawnResult {
  success: boolean;
  handle?: WorkerHandle;
  error?: string;
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
 * Spawn a worker in a tmux pane
 * Uses explicit dimensions (-x 200 -y 50) to prevent silent worker failure
 */
export function spawnTmuxWorker(
  config: WorkerConfig,
  sessionName: string
): TmuxSpawnResult {
  // Check if session exists, create if not
  const checkSession = execCommand(`tmux has-session -t ${sessionName} 2>/dev/null`);

  if (!checkSession.success) {
    // Create new session with explicit dimensions
    const createResult = execCommand(
      `tmux new-session -d -s ${sessionName} -x 200 -y 50`,
      { timeoutMs: 10000 }
    );
    if (!createResult.success) {
      return {
        success: false,
        error: `Failed to create session: ${createResult.errorMessage}`,
      };
    }
  }

  // Split window horizontally
  const splitResult = execCommand(
    `tmux split-window -t ${sessionName} -h`,
    { timeoutMs: 5000 }
  );

  if (!splitResult.success) {
    return {
      success: false,
      error: `Failed to split window: ${splitResult.errorMessage}`,
    };
  }

  // Get new pane ID
  const paneResult = execCommand(
    `tmux display-message -t ${sessionName} -p '#{pane_id}'`,
    { timeoutMs: 2000 }
  );

  const paneId = paneResult.output.trim();

  // Send command
  const droidCmd = buildDroidCommand(config);
  const sendResult = execCommand(
    `tmux send-keys -t ${paneId} "${droidCmd}" Enter`,
    { timeoutMs: 5000 }
  );

  if (!sendResult.success) {
    return {
      success: false,
      error: `Failed to send command: ${sendResult.errorMessage}`,
    };
  }

  return {
    success: true,
    handle: {
      id: config.id,
      tmuxPane: paneId,
      status: 'running',
      startedAt: Date.now(),
    },
  };
}

/**
 * Read pane content
 */
export function readTmuxPane(paneId: string): ExecResult {
  return execCommand(`tmux capture-pane -t ${paneId} -p`, { timeoutMs: 5000 });
}

/**
 * Close a tmux pane
 */
export function closeTmuxWorker(paneId: string): ExecResult {
  return execCommand(`tmux kill-pane -t ${paneId}`, { timeoutMs: 5000 });
}

/**
 * Check if a tmux session exists
 */
export function tmuxSessionExists(sessionName: string): boolean {
  const result = execCommand(`tmux has-session -t ${sessionName} 2>/dev/null`);
  return result.success;
}

/**
 * Kill an entire tmux session
 */
export function killTmuxSession(sessionName: string): ExecResult {
  return execCommand(`tmux kill-session -t ${sessionName}`, { timeoutMs: 5000 });
}

/**
 * Check if worker appears to have completed by reading pane content
 * Looks for completion markers in output
 */
export function checkTmuxWorkerCompletion(paneId: string): {
  completed: boolean;
  output: string;
} {
  const result = readTmuxPane(paneId);
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

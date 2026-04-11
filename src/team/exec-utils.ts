/**
 * Exec Utilities
 *
 * Wrapper around execSync with robust error handling and typed error codes.
 * Provides consistent error handling for CMUX, tmux, and shell commands.
 */

import { execSync, type ExecSyncOptions } from 'child_process';

/**
 * Error codes for exec command failures
 */
export enum ExecErrorCode {
  /** Command executed successfully */
  SUCCESS = 'SUCCESS',
  /** Command not found (ENOENT) */
  COMMAND_NOT_FOUND = 'COMMAND_NOT_FOUND',
  /** Command timed out */
  TIMEOUT = 'TIMEOUT',
  /** Permission denied (EACCES) */
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  /** Generic/unknown error */
  GENERIC_ERROR = 'GENERIC_ERROR',
}

/**
 * Result of executing a shell command
 */
export interface ExecResult {
  /** Whether the command succeeded */
  success: boolean;
  /** Command output (stdout) */
  output: string;
  /** Error code classification */
  errorCode: ExecErrorCode;
  /** Human-readable error message (if failed) */
  errorMessage?: string;
}

/**
 * Execute a shell command with robust error handling
 *
 * @param cmd - Shell command to execute
 * @param options - execSync options plus optional timeoutMs
 * @returns ExecResult with success status and typed error code
 */
export function execCommand(
  cmd: string,
  options: ExecSyncOptions & { timeoutMs?: number } = {}
): ExecResult {
  const { timeoutMs = 30000, ...execOptions } = options;

  try {
    const output = execSync(cmd, {
      encoding: 'utf-8',
      timeout: timeoutMs,
      stdio: ['pipe', 'pipe', 'pipe'],
      ...execOptions,
    });
    // With encoding: 'utf-8', output is always a string
    const outputStr = typeof output === 'string' ? output : output.toString();
    return {
      success: true,
      output: outputStr.trim(),
      errorCode: ExecErrorCode.SUCCESS,
    };
  } catch (err: unknown) {
    const error = err as NodeJS.ErrnoException & {
      stdout?: Buffer | string;
      stderr?: Buffer | string;
      killed?: boolean;
    };

    // Parse specific error types
    if (error.code === 'ENOENT') {
      return {
        success: false,
        output: '',
        errorCode: ExecErrorCode.COMMAND_NOT_FOUND,
        errorMessage: `Command not found: ${cmd.split(' ')[0]}`,
      };
    }

    if (error.code === 'ETIMEDOUT' || error.killed) {
      return {
        success: false,
        output: '',
        errorCode: ExecErrorCode.TIMEOUT,
        errorMessage: `Command timed out after ${timeoutMs}ms`,
      };
    }

    if (error.code === 'EACCES') {
      return {
        success: false,
        output: '',
        errorCode: ExecErrorCode.PERMISSION_DENIED,
        errorMessage: 'Permission denied',
      };
    }

    // Generic error - extract stdout/stderr if available
    const stdout = error.stdout?.toString() || '';
    const stderr = error.stderr?.toString() || String(error);

    return {
      success: false,
      output: stdout,
      errorCode: ExecErrorCode.GENERIC_ERROR,
      errorMessage: stderr,
    };
  }
}

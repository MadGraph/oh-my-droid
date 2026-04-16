#!/usr/bin/env node
/**
 * Plugin Post-Install Setup
 *
 * Configures HUD statusline when plugin is installed.
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CLAUDE_DIR = join(homedir(), '.factory');
const HUD_DIR = join(CLAUDE_DIR, 'hud');
const SETTINGS_FILE = join(CLAUDE_DIR, 'settings.json');

console.log('[OMD] Running post-install setup...');

// 1. Create HUD directory
if (!existsSync(HUD_DIR)) {
  mkdirSync(HUD_DIR, { recursive: true });
}

// 2. Create HUD wrapper script
const hudScriptPath = join(HUD_DIR, 'omd-hud.mjs');
const hudScript = `#!/usr/bin/env node
/**
 * OMD HUD - Statusline Script
 * Wrapper that imports from dev paths, plugin cache, or npm package
 */

import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

async function main() {
  const home = homedir();

  // 1. Development paths (preferred for local development)
  const devPaths = [
    join(home, "Workspace/oh-my-droid/dist/hud/index.js"),
    join(home, "workspace/oh-my-droid/dist/hud/index.js"),
    join(home, "projects/oh-my-droid/dist/hud/index.js"),
  ];

  for (const devPath of devPaths) {
    if (existsSync(devPath)) {
      try {
        await import(pathToFileURL(devPath).href);
        return;
      } catch { /* continue */ }
    }
  }

  // 2. Plugin cache (for production installs)
  const pluginCacheBase = join(home, ".factory/plugins/cache/oh-my-droid/oh-my-droid");
  if (existsSync(pluginCacheBase)) {
    try {
      const versions = readdirSync(pluginCacheBase);
      if (versions.length > 0) {
        const latestVersion = versions
          .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
          .reverse()[0];
        const pluginPath = join(pluginCacheBase, latestVersion, "dist/hud/index.js");
        if (existsSync(pluginPath)) {
          await import(pathToFileURL(pluginPath).href);
          return;
        }
      }
    } catch { /* continue */ }
  }

  // 3. npm package (global or local install)
  try {
    await import("oh-my-droid/dist/hud/index.js");
    return;
  } catch { /* continue */ }

  // 4. Fallback
  console.log("[OMD HUD] run /omd-setup to install properly");
}

main();
`;

writeFileSync(hudScriptPath, hudScript);
try {
  chmodSync(hudScriptPath, 0o755);
} catch { /* Windows doesn't need this */ }
console.log('[OMD] Installed HUD wrapper script');

// 3. Configure settings.json
try {
  let settings = {};
  if (existsSync(SETTINGS_FILE)) {
    settings = JSON.parse(readFileSync(SETTINGS_FILE, 'utf-8'));
  }

  // Update statusLine to use new HUD path
  settings.statusLine = {
    type: 'command',
    command: `node ${hudScriptPath}`
  };

  // Required for true parallel shell execution
  settings.allowBackgroundProcesses = true;

  // Ensure maxBackgroundTasks is set with default 5, clamped to 1..20
  if (typeof settings.maxBackgroundTasks !== 'number' ||
      settings.maxBackgroundTasks < 1 ||
      settings.maxBackgroundTasks > 20) {
    settings.maxBackgroundTasks = 5;
  }

  writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
  console.log('[OMD] Configured HUD statusLine + allowBackgroundProcesses in settings.json');
} catch (e) {
  console.log('[OMD] Warning: Could not configure settings.json:', e.message);
}

console.log('[OMD] Setup complete! Restart Factory Droid to activate HUD.');

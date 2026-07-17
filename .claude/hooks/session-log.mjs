#!/usr/bin/env node
// .claude/hooks/session-log.mjs
//
// Stop-hook: writes one entry per session_id into <repo>/SESSIONS.md.
// Idempotent — every Stop fires update the same entry rather than duplicating.
// Fails silently (always exits 0) so it never blocks the rest of the Stop chain.

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(SCRIPT_DIR, '..', '..');
const SESSIONS_PATH = path.join(REPO, 'SESSIONS.md');
const ERR_LOG = path.join(SCRIPT_DIR, 'session-log.err.log');

const HEADER = `# Agent sessions

Auto-appended record of Claude Code sessions in this repo. Each entry is written by \`.claude/hooks/session-log.mjs\` on the \`Stop\` hook and is idempotent — re-fires update the existing entry for that \`session_id\` rather than duplicating. Newest at top.

Disable by removing the \`Stop\` block from \`.claude/settings.json\` or deleting the script.

---
`;

function logErr(msg) {
  try {
    fs.mkdirSync(path.dirname(ERR_LOG), { recursive: true });
    fs.appendFileSync(ERR_LOG, `${new Date().toISOString()} ${msg?.stack || msg}\n`);
  } catch {}
}

async function readStdin() {
  if (process.stdin.isTTY) return null;
  return await new Promise((resolve) => {
    let buf = '';
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      try { resolve(JSON.parse(buf)); } catch { resolve(null); }
    };
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (d) => { buf += d; });
    process.stdin.on('end', finish);
    setTimeout(finish, 1500).unref();
  });
}

function stripCommandWrappers(text) {
  if (!text) return '';
  const cmdMsg = text.match(/<command-message>([\s\S]*?)<\/command-message>/);
  if (cmdMsg) {
    const argsMatch = text.match(/<command-args>([\s\S]*?)<\/command-args>/);
    const args = argsMatch ? ' ' + argsMatch[1].trim() : '';
    return cmdMsg[1].trim() + args;
  }
  const cmdName = text.match(/<command-name>([\s\S]*?)<\/command-name>/);
  if (cmdName) {
    const argsMatch = text.match(/<command-args>([\s\S]*?)<\/command-args>/);
    const args = argsMatch ? ' ' + argsMatch[1].trim() : '';
    return cmdName[1].trim() + args;
  }
  return text;
}

function extractText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter((c) => c && c.type === 'text')
      .map((c) => c.text || '')
      .join(' ');
  }
  return '';
}

function isToolResultMessage(content) {
  return Array.isArray(content) && content.some((c) => c && c.type === 'tool_result');
}

function parseTranscript(transcriptPath) {
  const stats = {
    firstPrompt: null,
    lastAssistant: null,
    tools: {},
    files: new Set(),
    subagents: [],
    startTime: null,
    endTime: null,
  };
  if (!transcriptPath || !fs.existsSync(transcriptPath)) return stats;

  let raw;
  try { raw = fs.readFileSync(transcriptPath, 'utf8'); } catch { return stats; }

  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    let evt;
    try { evt = JSON.parse(line); } catch { continue; }

    if (evt.timestamp) {
      if (!stats.startTime) stats.startTime = evt.timestamp;
      stats.endTime = evt.timestamp;
    }

    const msg = evt.message || {};
    const content = msg.content;

    if (evt.type === 'user' && !stats.firstPrompt) {
      if (!isToolResultMessage(content)) {
        const rawText = extractText(content).trim();
        if (rawText) {
          const clean = stripCommandWrappers(rawText).trim();
          if (clean && !clean.startsWith('<system-reminder>')) {
            stats.firstPrompt = clean.replace(/\s+/g, ' ').slice(0, 240);
          }
        }
      }
    }

    if (evt.type === 'assistant' && Array.isArray(content)) {
      for (const block of content) {
        if (!block || typeof block !== 'object') continue;
        if (block.type === 'text' && typeof block.text === 'string' && block.text.trim()) {
          stats.lastAssistant = block.text.trim();
        }
        if (block.type === 'tool_use') {
          let bucket = block.name || '?';
          if (bucket.startsWith('mcp__')) bucket = 'MCP';
          stats.tools[bucket] = (stats.tools[bucket] || 0) + 1;
          const input = block.input || {};
          if (block.name === 'Write' || block.name === 'Edit' || block.name === 'MultiEdit') {
            if (input.file_path) stats.files.add(input.file_path);
          }
          if (block.name === 'Agent' || block.name === 'Task') {
            stats.subagents.push({
              type: input.subagent_type || 'general-purpose',
              description: input.description || '(no description)',
            });
          }
        }
      }
    }
  }
  return stats;
}

function gitInfo(repo) {
  const run = (cmd) => execSync(cmd, {
    cwd: repo,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
  try {
    return { branch: run('git symbolic-ref --short HEAD'), head: run('git rev-parse --short HEAD') };
  } catch {
    return { branch: null, head: null };
  }
}

function humanDuration(startIso, endIso) {
  if (!startIso || !endIso) return '—';
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function formatEntry({ sessionId, stats, git, repo }) {
  const shortId = sessionId.slice(0, 8);
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const dur = humanDuration(stats.startTime, stats.endTime);
  const branch = git.branch || '(not a git repo)';
  const head = git.head ? `\`${git.head}\`` : '—';

  const prompt = (stats.firstPrompt || '(no prompt captured)').replace(/"/g, '\\"');
  const outcome = (stats.lastAssistant || '(no outcome captured)')
    .replace(/\s+/g, ' ')
    .slice(0, 480);

  const toolEntries = Object.entries(stats.tools)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}×${v}`)
    .join(' · ') || '(none)';

  const files = stats.files.size > 0
    ? Array.from(stats.files)
        .map((f) => (path.isAbsolute(f) ? (path.relative(repo, f) || f) : f))
        .map((f) => `\`${f}\``)
        .join(', ')
    : '(none)';

  const subagents = stats.subagents.length > 0
    ? stats.subagents.map((s) => `\`${s.type}\` — "${s.description}"`).join('; ')
    : '(none)';

  return `## ${now} · \`${shortId}\` · ${dur}

**Branch**: ${branch} · **HEAD**: ${head}
**Prompt**: "${prompt}"

**Tools**: ${toolEntries}
**Files touched**: ${files}
**Subagents**: ${subagents}

**Outcome**: ${outcome}

---
`;
}

function upsertEntry(entry, sessionId) {
  let content;
  if (fs.existsSync(SESSIONS_PATH)) {
    content = fs.readFileSync(SESSIONS_PATH, 'utf8');
    if (!content.startsWith('# Agent sessions')) {
      content = HEADER + '\n' + content;
    }
  } else {
    content = HEADER;
  }

  // Remove any existing entry for this session_id (idempotent upsert).
  const shortId = sessionId.slice(0, 8);
  const marker = `\`${shortId}\` · `;
  const markerIdx = content.indexOf(marker);
  if (markerIdx !== -1) {
    const entryStart = content.lastIndexOf('## ', markerIdx);
    if (entryStart !== -1) {
      const closer = content.indexOf('\n---\n', entryStart);
      const entryEnd = closer === -1 ? content.length : closer + 5;
      content = content.slice(0, entryStart) + content.slice(entryEnd);
    }
  }

  // Insert new entry immediately after the header's first "---\n".
  const headerEnd = content.indexOf('\n---\n');
  if (headerEnd === -1) {
    content = HEADER + '\n' + entry;
  } else {
    const insertAt = headerEnd + 5;
    const tail = content.slice(insertAt).replace(/^\n+/, '');
    content = content.slice(0, insertAt) + '\n' + entry + (tail ? '\n' + tail : '');
  }

  const tmp = SESSIONS_PATH + '.tmp';
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, SESSIONS_PATH);
}

// Hard kill at 2.5s — never block the Stop chain.
setTimeout(() => process.exit(0), 2500).unref();

try {
  const input = await readStdin();
  if (!input) process.exit(0);
  if (input.stop_hook_active === true) process.exit(0);

  const sessionId = input.session_id;
  const cwd = input.cwd;
  if (!sessionId || !cwd) process.exit(0);

  const repoReal = fs.realpathSync(REPO);
  let cwdReal = cwd;
  try { cwdReal = fs.realpathSync(cwd); } catch {}
  if (!cwdReal.startsWith(repoReal)) process.exit(0);

  const stats = parseTranscript(input.transcript_path);
  if (!stats.firstPrompt && Object.keys(stats.tools).length === 0) process.exit(0);

  const git = gitInfo(REPO);
  const entry = formatEntry({ sessionId, stats, git, repo: REPO });
  upsertEntry(entry, sessionId);
} catch (e) {
  logErr(e);
}
process.exit(0);

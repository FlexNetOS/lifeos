
from __future__ import annotations
import csv, hashlib, os, re, sys, time
import fcntl
import json
from pathlib import Path
from datetime import datetime, timezone

TASK_COLUMNS = ['task_id', 'parent_id', 'phase', 'title', 'goal', 'owner_lane', 'owner_agent', 'helper_id', 'model_tag', 'agent_runtime', 'shell_mode', 'repo_target', 'repo_path', 'filesystem_scope', 'input_files', 'target_files', 'target_artifacts', 'allowed_paths', 'blocked_paths', 'depends_on', 'blocks', 'parallel_group', 'can_run_parallel', 'max_parallel', 'start_after', 'priority', 'status', 'execution_cell', 'required_tools', 'command_template', 'verification_command', 'completion_gate', 'proof_required', 'proof_uri', 'heartbeat_file', 'logs_uri', 'rollback_plan', 'risk_level', 'human_approval_required', 'notes', 'anchor_binding', 'needs_capability_probe', 'probe_class', 'source_graph_uri']
PACKET_EXTRA_FIELDS = ['packet_schema_version','source_graph_uri','generated_at']
PROOF_FIELDS = ['proof_schema_version','task_id','status','started_at','completed_at','actor','helper_id','model_tag','repo_path','files_changed','commands_run','verification_output','checksums','logs_uri','rollback_point','evidence','failure_reason','next_action']
REDACTION_TARGET_PREFIXES = (
    "execution-framework/logs/",
    "execution-framework/proof_records/",
    "execution-framework/generated/",
    "execution-framework/state/",
)

_REDACTION_PATTERNS: list[re.Pattern[str]] | None = None
_REDACTION_TOKEN = "<REDACTED:SECRET>"
_ORIGINAL_PATH_WRITE_TEXT = Path.write_text


def _redaction_patterns() -> list[re.Pattern[str]]:
    global _REDACTION_PATTERNS, _REDACTION_TOKEN
    if _REDACTION_PATTERNS is not None:
        return _REDACTION_PATTERNS
    patterns: list[re.Pattern[str]] = []
    try:
        from redaction_controls import load_patterns, REDACTION_TOKEN
        _REDACTION_TOKEN = REDACTION_TOKEN
        for pattern in load_patterns():
            patterns.append(pattern.compiled)
    except Exception:
        for regex in [
            r"(?i)\bauthorization\s*[:=]\s*bearer\s+[A-Za-z0-9._~+/=-]+",
            r"(?i)\b(api[_-]?key|secret|password|passwd|private[_-]?key|authorization|bearer)\b\s*[:=]\s*(\"[^\"]+\"|'[^']+'|[^\s,}]+)",
            r"(?i)\baws_access_key_id\s*=\s*[A-Z0-9]{16,}",
            r"(?i)\baws_secret_access_key\s*=\s*[A-Za-z0-9/+=]{20,}",
            r"(?i)\bprivate[_-]?key\b",
            r"\bsk-[A-Za-z0-9_-]{20,}\b",
            r"\bgh[pousr]_[A-Za-z0-9_]{20,}\b",
        ]:
            patterns.append(re.compile(regex))
        _REDACTION_PATTERNS = patterns
        return patterns
    _REDACTION_PATTERNS = patterns
    return patterns


def _should_redact_path(path: Path) -> bool:
    try:
        rel = path.resolve().relative_to(package_root())
    except ValueError:
        return False
    rel_path = rel.as_posix().lstrip("/")
    return any(rel_path == prefix.rstrip("/") or rel_path.startswith(prefix) for prefix in REDACTION_TARGET_PREFIXES)


def _redact_text(value: str) -> str:
    redacted = value
    for pattern in _redaction_patterns():
        redacted = pattern.sub(_REDACTION_TOKEN, redacted)
    return redacted


def _redact_payload(value):
    if isinstance(value, str):
        return _redact_text(value)
    if isinstance(value, list):
        return [_redact_payload(item) for item in value]
    if isinstance(value, tuple):
        return tuple(_redact_payload(item) for item in value)
    if isinstance(value, dict):
        return {key: _redact_payload(item) for key, item in value.items()}
    return value


def _redact_before_write(path: Path, value: str) -> str:
    if not isinstance(value, str):
        return value
    if _should_redact_path(path):
        return _redact_text(value)
    return value


def _redacted_write_text(self: Path, *args, **kwargs):
    data = kwargs.pop("data") if "data" in kwargs else args[0]
    rest = args[1:] if "data" not in kwargs else args
    if isinstance(data, str):
        data = _redact_before_write(self, data)
    return _ORIGINAL_PATH_WRITE_TEXT(self, data, *rest, **kwargs)


if not getattr(Path, "_security_redaction_patch_applied", False):
    Path.write_text = _redacted_write_text  # type: ignore[assignment]
    setattr(Path, "_security_redaction_patch_applied", True)

def now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()

def root() -> Path:
    return Path(__file__).resolve().parents[1]

def package_root() -> Path:
    return root().parent

def read_task_graph(path: str | Path):
    p = Path(path)
    if not p.is_absolute():
        p = root() / p
    with p.open(newline='', encoding='utf-8') as f:
        rows = list(csv.DictReader(f))
    return rows

def write_json(path: str | Path, obj):
    p = Path(path)
    if not p.is_absolute():
        p = root() / p
    p.parent.mkdir(parents=True, exist_ok=True)
    payload = _redact_payload(obj) if _should_redact_path(p) else obj
    with p.open('w', encoding='utf-8') as f:
        json.dump(payload, f, indent=2, sort_keys=False)
        f.write('\n')

def read_json(path: str | Path):
    p = Path(path)
    if not p.is_absolute():
        p = root() / p
    return json.loads(p.read_text(encoding='utf-8'))

def split_list(value: str):
    if value is None:
        return []
    value = str(value).strip()
    if not value:
        return []
    return [x.strip() for x in value.split('|') if x.strip()]

def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda: f.read(1024*1024), b''):
            h.update(chunk)
    return h.hexdigest()

def file_checksums(paths):
    out = {}
    base = package_root()
    for raw in paths:
        p = Path(raw)
        if not p.is_absolute():
            p = base / raw
        if p.exists() and p.is_file():
            try:
                out[str(p.relative_to(base))] = sha256_file(p)
            except ValueError:
                out[str(p)] = sha256_file(p)
    return out

def load_ledger():
    ledger = root() / 'proof_records' / 'proof_ledger.jsonl'
    records = []
    if ledger.exists():
        for line in ledger.read_text(encoding='utf-8').splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                records.append(json.loads(line))
            except json.JSONDecodeError:
                records.append({'task_id':'__LEDGER_PARSE_ERROR__','status':'failed','failure_reason':'Invalid JSONL line'})
    return records

def append_proof(record: dict):
    pr = root() / 'proof_records'
    pr.mkdir(parents=True, exist_ok=True)
    sanitized_record = _redact_payload(record) if _should_redact_path(pr / f"{record['task_id']}.proof.json") else record
    proof_path = pr / f"{record['task_id']}.proof.json"
    ledger = pr / 'proof_ledger.jsonl'
    lock_path = pr / 'proof_ledger.jsonl.lock'
    current_payload = (
        json.dumps(sanitized_record, indent=2, sort_keys=False) + '\n'
    ).encode('utf-8')
    ledger_line = json.dumps(sanitized_record, sort_keys=False)

    with lock_path.open('a+b') as lock:
        fcntl.flock(lock.fileno(), fcntl.LOCK_EX)
        if proof_path.is_file():
            previous_payload = proof_path.read_bytes()
            if previous_payload != current_payload:
                previous_digest = hashlib.sha256(previous_payload).hexdigest()
                history_path = (
                    pr
                    / 'history'
                    / str(record['task_id'])
                    / f'{previous_digest}.proof.json'
                )
                history_path.parent.mkdir(parents=True, exist_ok=True)
                if history_path.exists():
                    if history_path.read_bytes() != previous_payload:
                        raise RuntimeError(
                            f'proof history collision at {history_path}'
                        )
                else:
                    history_path.write_bytes(previous_payload)

        proof_path.write_bytes(current_payload)
        existing_records = load_ledger()
        if sanitized_record not in existing_records:
            needs_newline = (
                ledger.is_file()
                and ledger.stat().st_size > 0
                and not ledger.read_bytes().endswith(b'\n')
            )
            with ledger.open('a', encoding='utf-8') as handle:
                if needs_newline:
                    handle.write('\n')
                handle.write(ledger_line + '\n')
                handle.flush()
                os.fsync(handle.fileno())
        fcntl.flock(lock.fileno(), fcntl.LOCK_UN)
    return proof_path

def make_proof(task_id: str, status: str, actor: str, helper_id: str, model_tag: str, repo_path: str, files_changed: list[str], commands_run: list[str], verification_output, evidence: list[str], failure_reason: str = '', next_action: str = ''):
    ts = now()
    return {
        'proof_schema_version':'1.0',
        'task_id':task_id,
        'status':status,
        'started_at':ts,
        'completed_at':ts,
        'actor':actor,
        'helper_id':helper_id,
        'model_tag':model_tag,
        'repo_path':repo_path,
        'files_changed':files_changed,
        'commands_run':commands_run,
        'verification_output':verification_output,
        'checksums':file_checksums(files_changed),
        'logs_uri':f'logs/{task_id}.log',
        'rollback_point':'history/pre_execution_framework_manifest.json',
        'evidence':evidence,
        'failure_reason':failure_reason,
        'next_action':next_action,
    }

def task_lookup(rows):
    return {r['task_id']: r for r in rows}

def split-list [value: string] {
  $value
  | split row ";"
  | each {|semicolon| $semicolon | split row "," }
  | flatten
  | each {|item| $item | str trim }
  | where {|item| not ($item | is-empty) }
}

def normalized-status [value: string] {
  let status = (
    $value
    | str trim
    | str downcase
    | str replace --all --regex "[^a-z0-9]+" "_"
    | str trim --char "_"
  )
  if ($status | is-empty) { "unknown" } else { $status }
}

def save-json [value: any, target: path] {
  $value | to json | $in + "\n" | save --force $target
}

let required_columns = [
  task_id parent_id phase title owner_agent goal inputs target_artifacts
  allowed_paths blocked_paths simulation_required execution_cell
  verification_gate rollback_plan status proof_uri next_action
]
let required_nonempty = [
  task_id allowed_paths blocked_paths verification_gate rollback_plan proof_uri
  execution_cell
]
let source_path = "yazelix_runtime_convergence/task_graph.source.csv"
let raw_path = "yazelix_runtime_convergence/generated/task_graph.raw.json"
let normalized_path = "yazelix_runtime_convergence/generated/task_graph.normalized.json"
let index_path = "yazelix_runtime_convergence/generated/task_graph.index.json"
let report_path = "yazelix_runtime_convergence/generated/task_graph.normalize_report.json"
let generated_at = (
  date now | date to-timezone "+0000" | format date "%Y-%m-%dT%H:%M:%SZ"
)
let source_rows = (open --raw $source_path | from csv --no-infer)

if ($source_rows | is-empty) {
  error make {msg: $"task graph has no rows: ($source_path)"}
}
if (($source_rows | columns) != $required_columns) {
  error make {msg: "task graph columns do not match the required v0 schema"}
}

let raw_rows = ($source_rows | enumerate | each {|entry| {
  source_row_number: ($entry.index + 2)
  columns: $entry.item
}})
let raw = {
  schema_version: "lifeos-planning-spine.task-graph.raw.v0"
  generated_at: $generated_at
  source: {
    format: "csv"
    path: $source_path
    header: $required_columns
    row_count: ($raw_rows | length)
    empty_rows_skipped: []
  }
  rows: $raw_rows
}

let tasks = ($raw_rows | each {|raw_row|
  let row = $raw_row.columns
  for field in $required_nonempty {
    if (($row | get $field | str trim) | is-empty) {
      error make {msg: $"row ($raw_row.source_row_number) has empty required field ($field)"}
    }
  }
  if not ($row.task_id =~ "^[A-Z][A-Z0-9]*-[0-9]{3}$") {
    error make {msg: $"invalid task ID: ($row.task_id)"}
  }
  let simulation = ($row.simulation_required | str downcase)
  if not ($simulation in ["true" "yes" "y" "1" "false" "no" "n" "0"]) {
    error make {msg: $"invalid simulation_required for ($row.task_id): ($simulation)"}
  }
  {
    task_id: ($row.task_id | str trim)
    source_row_number: $raw_row.source_row_number
    phase: ($row.phase | str trim)
    title: ($row.title | str trim)
    owner_agent: ($row.owner_agent | str trim)
    goal: ($row.goal | str trim)
    simulation_required: ($simulation in ["true" "yes" "y" "1"])
    execution_cell: ($row.execution_cell | str trim)
    verification_gate: ($row.verification_gate | str trim)
    rollback_plan: ($row.rollback_plan | str trim)
    status: (normalized-status $row.status)
    proof_uri: ($row.proof_uri | str trim)
    next_action: ($row.next_action | str trim)
    source_columns: $row
    parent_ids: (split-list $row.parent_id)
    inputs: (split-list $row.inputs)
    target_artifacts: (split-list $row.target_artifacts)
    allowed_paths: (split-list $row.allowed_paths)
    blocked_paths: (split-list $row.blocked_paths)
  }
})

let task_ids = ($tasks | get task_id)
if (($task_ids | uniq | length) != ($task_ids | length)) {
  error make {msg: "task graph contains duplicate task IDs"}
}

let index_parts = ($tasks | enumerate | reduce --fold {
  by_task_id: {}
  tasks_by_status: {}
  tasks_by_phase: {}
  children_by_parent: {}
  proof_uri_by_task: {}
} {|entry, acc|
  let task = $entry.item
  let index_entry = {
    index: $entry.index
    source_row_number: $task.source_row_number
    phase: $task.phase
    status: $task.status
    parent_ids: $task.parent_ids
    proof_uri: $task.proof_uri
    execution_cell: $task.execution_cell
  }
  let status_tasks = ($acc.tasks_by_status | get --optional $task.status | default [])
  let phase_tasks = ($acc.tasks_by_phase | get --optional $task.phase | default [])
  let children = ($task.parent_ids | reduce --fold $acc.children_by_parent {|parent, current|
    if not ($parent =~ "^[A-Z][A-Z0-9]*-[0-9]{3}$") {
      error make {msg: $"invalid parent ID for ($task.task_id): ($parent)"}
    }
    let current_children = ($current | get --optional $parent | default [])
    $current | upsert $parent ($current_children | append $task.task_id)
  })
  {
    by_task_id: ($acc.by_task_id | upsert $task.task_id $index_entry)
    tasks_by_status: (
      $acc.tasks_by_status
      | upsert $task.status ($status_tasks | append $task.task_id)
    )
    tasks_by_phase: (
      $acc.tasks_by_phase
      | upsert $task.phase ($phase_tasks | append $task.task_id)
    )
    children_by_parent: $children
    proof_uri_by_task: (
      $acc.proof_uri_by_task | upsert $task.task_id $task.proof_uri
    )
  }
})
let all_parent_ids = ($tasks | get parent_ids | flatten | uniq | sort)
let missing_parent_ids = (
  $all_parent_ids
  | where {|parent| not ($task_ids | any {|task_id| $task_id == $parent }) }
)
if not ($missing_parent_ids | is-empty) {
  error make {msg: $"task graph has missing parents: ($missing_parent_ids | str join ', ')"}
}

let normalized = {
  schema_version: "lifeos-planning-spine.task-graph.normalized.v0"
  generated_at: $generated_at
  source_graph_uri: $raw_path
  task_count: ($tasks | length)
  source: {
    schema_version: $raw.schema_version
    generated_at: $raw.generated_at
    format: $raw.source.format
    path: $raw.source.path
    row_count: $raw.source.row_count
    empty_rows_skipped: $raw.source.empty_rows_skipped
    required_columns: $required_columns
  }
  tasks: $tasks
}
let index = {
  schema_version: "lifeos-planning-spine.task-graph.index.v0"
  generated_at: $generated_at
  source_graph_uri: $raw_path
  task_count: ($tasks | length)
  task_ids: $task_ids
  ready_task_ids: ($index_parts.tasks_by_status | get --optional ready | default [])
  complete_task_ids: ($index_parts.tasks_by_status | get --optional complete | default [])
  by_task_id: $index_parts.by_task_id
  tasks_by_id: $index_parts.by_task_id
  tasks_by_status: $index_parts.tasks_by_status
  tasks_by_phase: $index_parts.tasks_by_phase
  children_by_parent: $index_parts.children_by_parent
  proof_uri_by_task: $index_parts.proof_uri_by_task
  missing_parent_ids: $missing_parent_ids
}
let report = {
  schema_version: "lifeos-planning-spine.task-graph.normalize-report.v0"
  generated_at: $generated_at
  source_graph_uri: $raw_path
  result: "pass"
  task_count: ($tasks | length)
  error_count: 0
  errors: []
}

save-json $raw $raw_path
save-json $normalized $normalized_path
save-json $index $index_path
save-json $report $report_path
print $"regenerated ($tasks | length) tasks through profile-owned Nushell"

## Requirements

### Requirement: AgentDB cognition boundary

The existing LifeOS Mempalace surface SHALL persist its durable node, edge, and
drawer projections in `lifeos_agentdb.exp_nodes`, `lifeos_agentdb.exp_edges`,
and `lifeos_agentdb.notes`. This is a PostgreSQL-owned projection of the
per-agent cognition boundary; it SHALL not introduce a second local durable
store.

#### Scenario: Node and edge round-trip

- **WHEN** node and edge upserts are issued with valid JSON payloads
- **THEN** the rows SHALL be available through the corresponding PostgreSQL
  getters with their timestamps projected to Unix seconds

#### Scenario: Edge endpoints are enforced

- **WHEN** an edge references a missing node
- **THEN** the operation SHALL return `StorageError::ForeignKeyViolation`
- **AND** no edge SHALL be created

#### Scenario: Clear is transactionally ordered

- **WHEN** `mempalace::clear()` runs
- **THEN** edges, nodes, and notes SHALL be deleted in one PostgreSQL
  transaction while raw source objects remain untouched

### Requirement: No ungoverned write-back

The storage module SHALL not write directly to Mempalace or AgentDB network
endpoints. Any future sync is a governed return path with PostgreSQL as the
canonical durable record and an explicit repository-owned contract.

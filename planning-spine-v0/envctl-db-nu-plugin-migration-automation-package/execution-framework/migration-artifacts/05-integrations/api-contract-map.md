# API Contract Map

Task: `ART-110_API_CATALOG`
Generated at: `2026-07-28T11:21:45+00:00`
Target: `flexnetos-vs-lifeos`
Target root: `/home/flexnetos/FlexNetOS`

## Contract Links

| Surface | Surface ID | Schemas | Auth | Consumers |
|---|---|---|---|---|
| endpoint | `endpoint-flexnetos_runner-get--id-actions-97dba57c554f` | `schemas/shared_protocol.schema.json#/$defs/Operation` | `unknown` | `nu_plugin, artifact-agent` |
| endpoint | `endpoint-flexnetos_runner-post--api-053b7db11b39` | `schemas/shared_protocol.schema.json#/$defs/Operation` | `unknown` | `nu_plugin, artifact-agent` |
| endpoint | `endpoint-flexnetos_runner-get--api-health-bcb0b1f075dc` | `schemas/shared_protocol.schema.json#/$defs/Operation` | `unknown` | `nu_plugin, artifact-agent` |
| endpoint | `endpoint-flexnetos_runner-post--api-health-decay-56b370795e47` | `schemas/shared_protocol.schema.json#/$defs/Operation` | `unknown` | `nu_plugin, artifact-agent` |
| endpoint | `endpoint-flexnetos_runner-post--api-health-prune-b355ccd9ee0b` | `schemas/shared_protocol.schema.json#/$defs/Operation` | `unknown` | `nu_plugin, artifact-agent` |
| endpoint | `endpoint-flexnetos_runner-get--api-memoirs-21999cc2a981` | `schemas/shared_protocol.schema.json#/$defs/Operation` | `unknown` | `nu_plugin, artifact-agent` |
| endpoint | `endpoint-flexnetos_runner-get--api-memories-be8f5b7e6d7b` | `schemas/shared_protocol.schema.json#/$defs/Operation` | `unknown` | `nu_plugin, artifact-agent` |
| endpoint | `endpoint-flexnetos_runner-get--api-memories-search-6b454950e802` | `schemas/shared_protocol.schema.json#/$defs/Operation` | `unknown` | `nu_plugin, artifact-agent` |
| endpoint | `endpoint-flexnetos_runner-get--api-stats-6397ad732462` | `schemas/shared_protocol.schema.json#/$defs/Operation` | `unknown` | `nu_plugin, artifact-agent` |
| endpoint | `endpoint-flexnetos_runner-get--api-topics-cbd11223a095` | `schemas/shared_protocol.schema.json#/$defs/Operation` | `unknown` | `nu_plugin, artifact-agent` |
| endpoint | `endpoint-flexnetos_runner-post--api-topics-n-consolidate-6294c501a886` | `schemas/shared_protocol.schema.json#/$defs/Operation` | `unknown` | `nu_plugin, artifact-agent` |
| endpoint | `endpoint-flexnetos_runner-get--api-topics-n-health-21498d300436` | `schemas/shared_protocol.schema.json#/$defs/Operation` | `unknown` | `nu_plugin, artifact-agent` |
| endpoint | `endpoint-flexnetos_runner-post--api-v1-audit-verify-460c39403d9a` | `schemas/shared_protocol.schema.json#/$defs/Operation` | `unknown` | `nu_plugin, artifact-agent` |
| endpoint | `endpoint-flexnetos_runner-put--api-v1-budget-budget-a6d57f6d1a15` | `schemas/shared_protocol.schema.json#/$defs/Operation` | `unknown` | `nu_plugin, artifact-agent` |
| endpoint | `endpoint-flexnetos_runner-post--api-v1-context-gather-smart-894edca9be71` | `schemas/shared_protocol.schema.json#/$defs/Operation` | `unknown` | `nu_plugin, artifact-agent` |
| endpoint | `endpoint-flexnetos_runner-post--api-v1-cost-estimate-bbb1a0169017` | `schemas/shared_protocol.schema.json#/$defs/Operation` | `unknown` | `nu_plugin, artifact-agent` |
| endpoint | `endpoint-flexnetos_runner-post--api-v1-custody-sign-b495abeafa22` | `schemas/shared_protocol.schema.json#/$defs/Operation` | `unknown` | `nu_plugin, artifact-agent` |
| endpoint | `endpoint-flexnetos_runner-post--api-v1-gc-run-5bb6ca9be8a2` | `schemas/shared_protocol.schema.json#/$defs/Operation` | `unknown` | `nu_plugin, artifact-agent` |
| endpoint | `endpoint-flexnetos_runner-post--api-v1-goal-emit-f7eb9a9152fa` | `schemas/shared_protocol.schema.json#/$defs/Operation` | `unknown` | `nu_plugin, artifact-agent` |
| endpoint | `endpoint-flexnetos_runner-get--api-v1-identity-a474f798cb6b` | `schemas/shared_protocol.schema.json#/$defs/Operation` | `unknown` | `nu_plugin, artifact-agent` |
| endpoint | `endpoint-flexnetos_runner-post--api-v1-input-process-86a186024ab0` | `schemas/shared_protocol.schema.json#/$defs/Operation` | `unknown` | `nu_plugin, artifact-agent` |
| endpoint | `endpoint-flexnetos_runner-get--api-v1-lineage-ancestry-version_id-d726a05475ce` | `schemas/shared_protocol.schema.json#/$defs/Operation` | `unknown` | `nu_plugin, artifact-agent` |
| endpoint | `endpoint-flexnetos_runner-post--api-v1-moderation-check-69cf999eba7b` | `schemas/shared_protocol.schema.json#/$defs/Operation` | `unknown` | `nu_plugin, artifact-agent` |
| endpoint | `endpoint-flexnetos_runner-post--api-v1-prompts-8036e7fe7c70` | `schemas/shared_protocol.schema.json#/$defs/Operation` | `unknown` | `nu_plugin, artifact-agent` |
| endpoint | `endpoint-flexnetos_runner-patch--api-v1-prompts-id-3b0c0d15f3bd` | `schemas/shared_protocol.schema.json#/$defs/Operation` | `unknown` | `nu_plugin, artifact-agent` |
| endpoint | `endpoint-flexnetos_runner-post--api-v1-providers-register-320b525fac35` | `schemas/shared_protocol.schema.json#/$defs/Operation` | `unknown` | `nu_plugin, artifact-agent` |
| endpoint | `endpoint-flexnetos_runner-post--api-v1-rollouts-advance-7767454647bf` | `schemas/shared_protocol.schema.json#/$defs/Operation` | `unknown` | `nu_plugin, artifact-agent` |
| endpoint | `endpoint-flexnetos_runner-post--api-v1-satisfaction-csat-4cd03274430a` | `schemas/shared_protocol.schema.json#/$defs/Operation` | `unknown` | `nu_plugin, artifact-agent` |
| endpoint | `endpoint-flexnetos_runner-get--api-v1-swarm-bundle-9a4dbd87fed2` | `schemas/shared_protocol.schema.json#/$defs/Operation` | `unknown` | `nu_plugin, artifact-agent` |
| endpoint | `endpoint-flexnetos_runner-post--app-installations-140063898-access_tokens-2f63769e3c97` | `schemas/shared_protocol.schema.json#/$defs/Operation` | `unknown` | `nu_plugin, artifact-agent` |
| endpoint | `endpoint-flexnetos_runner-post--app-installations-id-access_tokens-f3c8687b2da9` | `schemas/shared_protocol.schema.json#/$defs/Operation` | `unknown` | `nu_plugin, artifact-agent` |
| endpoint | `endpoint-flexnetos_runner-post--close-env-330d7aef4583` | `schemas/shared_protocol.schema.json#/$defs/Operation` | `unknown` | `nu_plugin, artifact-agent` |
| endpoint | `endpoint-flexnetos_runner-get--health-b1337464b52b` | `schemas/shared_protocol.schema.json#/$defs/Operation` | `unknown` | `nu_plugin, artifact-agent` |
| endpoint | `endpoint-flexnetos_runner-delete--installation-token-845e8f3db8f3` | `schemas/shared_protocol.schema.json#/$defs/Operation` | `unknown` | `nu_plugin, artifact-agent` |
| endpoint | `endpoint-flexnetos_runner-post--interview-529d9b89ee94` | `schemas/shared_protocol.schema.json#/$defs/Operation` | `unknown` | `nu_plugin, artifact-agent` |
| endpoint | `endpoint-flexnetos_runner-post--migration-approvals-approval_id-decision-20f071632d01` | `schemas/shared_protocol.schema.json#/$defs/Operation` | `unknown` | `nu_plugin, artifact-agent` |
| endpoint | `endpoint-flexnetos_runner-get--migration-runs-run_id-events-946715d066d7` | `schemas/shared_protocol.schema.json#/$defs/Operation` | `unknown` | `nu_plugin, artifact-agent` |
| endpoint | `endpoint-flexnetos_runner-get--migration-runs-run_id-status-891ee41348e9` | `schemas/shared_protocol.schema.json#/$defs/Operation` | `unknown` | `nu_plugin, artifact-agent` |
| endpoint | `endpoint-flexnetos_runner-post--orgs-org-actions-runners-generate-jitconfig-2b2d785e8315` | `schemas/shared_protocol.schema.json#/$defs/Operation` | `unknown` | `nu_plugin, artifact-agent` |
| endpoint | `endpoint-flexnetos_runner-get--repos-source_repo-milestones-1d8c70f0fcec` | `schemas/shared_protocol.schema.json#/$defs/Operation` | `unknown` | `nu_plugin, artifact-agent` |
| endpoint | `endpoint-flexnetos_runner-get--repos-owner-repo-hash-algorithm-acbd7b278949` | `schemas/shared_protocol.schema.json#/$defs/Operation` | `unknown` | `nu_plugin, artifact-agent` |
| endpoint | `endpoint-flexnetos_runner-post--start-2658491a4489` | `schemas/shared_protocol.schema.json#/$defs/Operation` | `unknown` | `nu_plugin, artifact-agent` |
| endpoint | `endpoint-flexnetos_runner-get--user-b95b23320064` | `schemas/shared_protocol.schema.json#/$defs/Operation` | `unknown` | `nu_plugin, artifact-agent` |
| endpoint | `endpoint-flexnetos_runner-post--v1-images-edits-685444d17a99` | `schemas/shared_protocol.schema.json#/$defs/Operation` | `unknown` | `nu_plugin, artifact-agent` |
| endpoint | `endpoint-flexnetos_runner-post--v1-images-generations-53f357413748` | `schemas/shared_protocol.schema.json#/$defs/Operation` | `unknown` | `nu_plugin, artifact-agent` |
| endpoint | `endpoint-flexnetos_runner-post--v1-messages-5b0823e5f53a` | `schemas/shared_protocol.schema.json#/$defs/Operation` | `unknown` | `nu_plugin, artifact-agent` |
| endpoint | `endpoint-flexnetos_runner-post--v1-presence-token-0f0b91ea70c8` | `schemas/shared_protocol.schema.json#/$defs/Operation` | `unknown` | `nu_plugin, artifact-agent` |
| endpoint | `endpoint-flexnetos_runner-post--v1-relay-swap-f988cce8cd34` | `schemas/shared_protocol.schema.json#/$defs/Operation` | `unknown` | `nu_plugin, artifact-agent` |
| endpoint | `endpoint-flexnetos_runner-get--v1-runs-id-acb92e309d1d` | `schemas/shared_protocol.schema.json#/$defs/Operation` | `unknown` | `nu_plugin, artifact-agent` |
| endpoint | `endpoint-flexnetos_runner-post--v2-pipeline-f388897d8934` | `schemas/shared_protocol.schema.json#/$defs/Operation` | `unknown` | `nu_plugin, artifact-agent` |
| event | `event-envctl-runevent` | `schemas/shared_protocol.schema.json#/$defs/RunEvent` | `n/a` | `nu_plugin` |
| event | `event-flexnetos_runner-agent-2a2627bb515b` | `schemas/shared_protocol.schema.json#/$defs/RunEvent` | `n/a` | `envctl, nu_plugin` |
| event | `event-flexnetos_runner-agentaction-0f5a9cb7db2e` | `schemas/shared_protocol.schema.json#/$defs/RunEvent` | `n/a` | `envctl, nu_plugin` |
| event | `event-flexnetos_runner-agentaudited-623a20dcfb29` | `schemas/shared_protocol.schema.json#/$defs/RunEvent` | `n/a` | `envctl, nu_plugin` |
| event | `event-flexnetos_runner-agentdoctored-9e86e086fdeb` | `schemas/shared_protocol.schema.json#/$defs/RunEvent` | `n/a` | `envctl, nu_plugin` |
| event | `event-flexnetos_runner-agentedited-af3ebb04ca2b` | `schemas/shared_protocol.schema.json#/$defs/RunEvent` | `n/a` | `envctl, nu_plugin` |
| event | `event-flexnetos_runner-agentinitfinished-90871c4757d2` | `schemas/shared_protocol.schema.json#/$defs/RunEvent` | `n/a` | `envctl, nu_plugin` |
| event | `event-flexnetos_runner-agentlisted-220324dec81e` | `schemas/shared_protocol.schema.json#/$defs/RunEvent` | `n/a` | `envctl, nu_plugin` |
| event | `event-flexnetos_runner-agentlockchecked-4b0d00fcc95a` | `schemas/shared_protocol.schema.json#/$defs/RunEvent` | `n/a` | `envctl, nu_plugin` |
| event | `event-flexnetos_runner-agentrunfinished-e4a97aed3470` | `schemas/shared_protocol.schema.json#/$defs/RunEvent` | `n/a` | `envctl, nu_plugin` |
| event | `event-flexnetos_runner-agentrunstarted-ab01698ba658` | `schemas/shared_protocol.schema.json#/$defs/RunEvent` | `n/a` | `envctl, nu_plugin` |
| event | `event-flexnetos_runner-catalogrendered-ad9904069f14` | `schemas/shared_protocol.schema.json#/$defs/RunEvent` | `n/a` | `envctl, nu_plugin` |
| event | `event-flexnetos_runner-dashboard-ad24f0673cfa` | `schemas/shared_protocol.schema.json#/$defs/RunEvent` | `n/a` | `envctl, nu_plugin` |
| event | `event-flexnetos_runner-dashboarddeployed-5ecea55ee616` | `schemas/shared_protocol.schema.json#/$defs/RunEvent` | `n/a` | `envctl, nu_plugin` |
| event | `event-flexnetos_runner-doctored-c53dac8ec4e7` | `schemas/shared_protocol.schema.json#/$defs/RunEvent` | `n/a` | `envctl, nu_plugin` |
| event | `event-flexnetos_runner-guardrefused-2bdf1e6a426a` | `schemas/shared_protocol.schema.json#/$defs/RunEvent` | `n/a` | `envctl, nu_plugin` |
| event | `event-flexnetos_runner-kind-bfd5b473dcb7` | `schemas/shared_protocol.schema.json#/$defs/RunEvent` | `n/a` | `envctl, nu_plugin` |
| event | `event-flexnetos_runner-log-d8c086d11eb8` | `schemas/shared_protocol.schema.json#/$defs/RunEvent` | `n/a` | `envctl, nu_plugin` |
| event | `event-flexnetos_runner-migrationreported-2a73fa32480d` | `schemas/shared_protocol.schema.json#/$defs/RunEvent` | `n/a` | `envctl, nu_plugin` |
| event | `event-flexnetos_runner-report-899a55b88e28` | `schemas/shared_protocol.schema.json#/$defs/RunEvent` | `n/a` | `envctl, nu_plugin` |
| event | `event-flexnetos_runner-runfinished-e0fe5839407c` | `schemas/shared_protocol.schema.json#/$defs/RunEvent` | `n/a` | `envctl, nu_plugin` |
| event | `event-flexnetos_runner-runstarted-d903013f149e` | `schemas/shared_protocol.schema.json#/$defs/RunEvent` | `n/a` | `envctl, nu_plugin` |
| event | `event-flexnetos_runner-secretsresult-3eaa0b693c1c` | `schemas/shared_protocol.schema.json#/$defs/RunEvent` | `n/a` | `envctl, nu_plugin` |
| event | `event-flexnetos_runner-selfuninstall-dbd506e79b2e` | `schemas/shared_protocol.schema.json#/$defs/RunEvent` | `n/a` | `envctl, nu_plugin` |
| event | `event-flexnetos_runner-stepfinished-625ed56290c4` | `schemas/shared_protocol.schema.json#/$defs/RunEvent` | `n/a` | `envctl, nu_plugin` |
| event | `event-flexnetos_runner-stepstarted-72b9cd945f76` | `schemas/shared_protocol.schema.json#/$defs/RunEvent` | `n/a` | `envctl, nu_plugin` |
| event | `event-flexnetos_runner-telemetry-a510118cbeb9` | `schemas/shared_protocol.schema.json#/$defs/RunEvent` | `n/a` | `envctl, nu_plugin` |
| event | `event-flexnetos_runner-agent_control_fixture_ready-16bfab63b836` | `schemas/shared_protocol.schema.json#/$defs/RunEvent` | `n/a` | `envctl, nu_plugin` |
| event | `event-flexnetos_runner-checkpoint_recorded-d891e5b91c01` | `schemas/shared_protocol.schema.json#/$defs/RunEvent` | `n/a` | `envctl, nu_plugin` |
| event | `event-flexnetos_runner-default-054ede2bff41` | `schemas/shared_protocol.schema.json#/$defs/RunEvent` | `n/a` | `envctl, nu_plugin` |
| event | `event-flexnetos_runner-integration_run_started-573afa75906f` | `schemas/shared_protocol.schema.json#/$defs/RunEvent` | `n/a` | `envctl, nu_plugin` |
| event | `event-flexnetos_runner-operation_started-e7190fbf00b7` | `schemas/shared_protocol.schema.json#/$defs/RunEvent` | `n/a` | `envctl, nu_plugin` |
| event | `event-flexnetos_runner-operation_succeeded-de4f133e2881` | `schemas/shared_protocol.schema.json#/$defs/RunEvent` | `n/a` | `envctl, nu_plugin` |
| event | `event-flexnetos_runner-out_of_order-7e522c4e53bb` | `schemas/shared_protocol.schema.json#/$defs/RunEvent` | `n/a` | `envctl, nu_plugin` |
| event | `event-flexnetos_runner-plugin_projection_ready-3920a5571ac1` | `schemas/shared_protocol.schema.json#/$defs/RunEvent` | `n/a` | `envctl, nu_plugin` |
| event | `event-flexnetos_runner-proof_linked-9982ac931ecf` | `schemas/shared_protocol.schema.json#/$defs/RunEvent` | `n/a` | `envctl, nu_plugin` |
| event | `event-flexnetos_runner-release-28b740f6aa9f` | `schemas/shared_protocol.schema.json#/$defs/RunEvent` | `n/a` | `envctl, nu_plugin` |
| event | `event-flexnetos_runner-replay_fixture_ready-4a608a6492f6` | `schemas/shared_protocol.schema.json#/$defs/RunEvent` | `n/a` | `envctl, nu_plugin` |
| event | `event-flexnetos_runner-rollback_approved-e6a987087ef1` | `schemas/shared_protocol.schema.json#/$defs/RunEvent` | `n/a` | `envctl, nu_plugin` |
| event | `event-flexnetos_runner-rollback_planned-cedac2403b2d` | `schemas/shared_protocol.schema.json#/$defs/RunEvent` | `n/a` | `envctl, nu_plugin` |
| event | `event-flexnetos_runner-rollback_substrate_fixture_started-180efe55fad0` | `schemas/shared_protocol.schema.json#/$defs/RunEvent` | `n/a` | `envctl, nu_plugin` |
| event | `event-flexnetos_runner-run_completed-c4ff2b85ac5f` | `schemas/shared_protocol.schema.json#/$defs/RunEvent` | `n/a` | `envctl, nu_plugin` |
| event | `event-flexnetos_runner-run_created-83e3746c1b04` | `schemas/shared_protocol.schema.json#/$defs/RunEvent` | `n/a` | `envctl, nu_plugin` |
| event | `event-flexnetos_runner-secret_read-f8be61a63da5` | `schemas/shared_protocol.schema.json#/$defs/RunEvent` | `n/a` | `envctl, nu_plugin` |
| event | `event-flexnetos_runner-unlock-f5aab1841b39` | `schemas/shared_protocol.schema.json#/$defs/RunEvent` | `n/a` | `envctl, nu_plugin` |

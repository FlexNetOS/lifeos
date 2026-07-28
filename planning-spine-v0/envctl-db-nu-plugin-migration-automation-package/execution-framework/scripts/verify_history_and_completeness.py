
from __future__ import annotations
import json
from pathlib import Path
from _common import root, package_root, read_task_graph, split_list, load_ledger, write_json, make_proof, append_proof, now

REQUIRED_OUTPUTS = [
 'docs/GAP_ANALYSIS.md','docs/APPLIED_UPGRADES.md','docs/FINAL_VERIFICATION.md','generated/package_scan.json','generated/gap_report.json','generated/task_graph.csv','generated/task_graph.normalized.json','generated/task_graph.index.json','generated/execution_manifest.json','generated/status_report.json','generated/final_verification_report.json','schemas/task_graph.schema.json','scripts/validate_task_graph.py','templates/TASK_GRAPH_TEMPLATE.csv','proof_records/proof_ledger.jsonl'
]
SOURCE_SECTIONS = ['README.md','PACKAGE_MANIFEST.json','specs','prompts','codex','schemas','examples','helpers','sql','source','expected-output','history']
REQUIREMENT_KEYWORDS = {
 'system_inventory':'ART-100_SYSTEM_INVENTORY','dependency_graph':'ART-103_SERVICE_DEP_GRAPH','data_flow_graph':'ART-107_DATA_FLOW_GRAPH','source_to_target_mapping':'ART-109_DATA_LINEAGE','environment_matrix':'ART-114_ENV_CONFIG_MATRIX','toolchain_dependency_tree':'ART-104_TOOLCHAIN_TREE','api_event_contract_catalog':'ART-110_API_CATALOG','cutover_checklist':'ART-121_CUTOVER','rollback_plan':'ART-122_ROLLBACK','risk_register':'ART-125_RISK_REGISTER','decision_log':'ART-126_DECISION_LOG','envctl_database':'REQ-020_ENVCTL_DB_SCHEMA','nu_plugin':'REQ-030_PLUGIN_PROTOCOL_MANIFEST','goal_loop':'EF-007_GOAL_LOOP','proof_ledger':'EF-008_VERIFY_HISTORY_COMPLETENESS','two_repo':'REQ-041_TWO_REPO_INTEGRATION','flexnetos':'REQ-201_FLEXNETOS_LIFEOS_COMPARISON'
}
TERMINAL_COMPLETE = {'completed', 'complete', 'pass', 'passed'}


def packet_implementation_obligation(packet):
    reasons = []
    if packet.get('needs_capability_probe') is True:
        reasons.append('needs_capability_probe is true')
    if str(packet.get('probe_class', '')).strip().lower() == 'drift-canary':
        reasons.append('probe_class is drift-canary')
    gate_and_notes = ' '.join(
        str(packet.get(field, ''))
        for field in ('completion_gate', 'notes')
    ).lower()
    if 'not evidence of implementation' in gate_and_notes:
        reasons.append('packet explicitly disclaims implementation evidence')
    return '; '.join(reasons) if reasons else None


def proof_completion_blocker(proof):
    if str(proof.get('status', '')).lower() not in TERMINAL_COMPLETE:
        return None
    output = proof.get('verification_output')
    if not isinstance(output, dict):
        return 'terminal completion lacks structured task evidence'
    if output.get('packet_execution_proven') is not True:
        return 'terminal completion does not affirm exact packet execution'
    if output.get('task_completion_proven') is not True:
        return str(
            output.get('honesty_note')
            or 'terminal completion does not affirm task completion'
        )
    scope = output.get('implementation_scope')
    if scope != 'full_lifecycle_completed':
        return f'implementation scope is {scope or "missing"}'
    lifecycle = output.get('lifecycle')
    if not isinstance(lifecycle, dict):
        return 'terminal completion lacks structured lifecycle evidence'
    if lifecycle.get('stage') != 'completed':
        return 'proof lifecycle stage is not completed'
    missing = [
        field
        for field in (
            'implementation_proven',
            'independent_verification_proven',
            'activation_proven',
            'adopted',
        )
        if lifecycle.get(field) is not True
    ]
    if missing:
        return 'proof lifecycle does not affirm ' + ', '.join(missing)
    return None


def unresolved_packet_implementation_obligation(packet, proof):
    obligation = packet_implementation_obligation(packet)
    if not obligation:
        return None
    if not proof:
        return f'{obligation}; no proof exists'
    status = str(proof.get('status', '')).lower()
    if status not in TERMINAL_COMPLETE:
        return f'{obligation}; proof status is {status or "missing"}'
    blocker = proof_completion_blocker(proof)
    if blocker:
        return f'{obligation}; {blocker}'
    return None


def final_status(local_complete, external_blockers):
    if not local_complete:
        return 'failed'
    return 'blocked' if external_blockers else 'pass'


def main():
    base = package_root(); ef = root()
    rows = read_task_graph('generated/task_graph.csv')
    task_ids = {r['task_id'] for r in rows}
    proofs = load_ledger()
    proofs_by_task = {p.get('task_id'):p for p in proofs if p.get('task_id')}
    missing_outputs = [p for p in REQUIRED_OUTPUTS if not (ef/p).exists()]
    packet_dir = ef / 'generated' / 'execution_packets'
    packets = sorted(packet_dir.glob('*.json')) if packet_dir.exists() else []
    packet_task_ids = {p.stem for p in packets}
    tasks_without_packets = sorted(task_ids - packet_task_ids)
    packet_missing_fields = []
    unresolved_implementation_obligations = []
    for p in packets:
        try:
            obj = json.loads(p.read_text(encoding='utf-8'))
            for field in ['depends_on','parallel_group','can_run_parallel','max_parallel','verification_command','completion_gate','proof_uri','allowed_paths','blocked_paths']:
                if field not in obj:
                    packet_missing_fields.append({'packet':str(p.relative_to(ef)),'field':field})
            task_id = obj.get('task_id', p.stem)
            obligation = unresolved_packet_implementation_obligation(
                obj,
                proofs_by_task.get(task_id),
            )
            if obligation:
                unresolved_implementation_obligations.append({
                    'task_id': task_id,
                    'packet': str(p.relative_to(ef)),
                    'reason': obligation,
                })
        except Exception as e:
            packet_missing_fields.append({'packet':str(p.relative_to(ef)),'field':'json_parse','error':str(e)})
    source_scan = {s:(base/s).exists() for s in SOURCE_SECTIONS}
    ignored_sections = [s for s,v in source_scan.items() if not v]
    completed_without_proof = []
    for r in rows:
        if r.get('status','').lower() == 'complete' and r['task_id'] not in proofs_by_task:
            completed_without_proof.append(r['task_id'])
    nonimplementation_completion_proofs = [
        {
            'task_id': task_id,
            'reason': blocker,
        }
        for task_id, proof in sorted(proofs_by_task.items())
        if task_id in task_ids
        if (blocker := proof_completion_blocker(proof)) is not None
    ]
    coverage = {k:{'task_id':tid,'covered':tid in task_ids} for k,tid in REQUIREMENT_KEYWORDS.items()}
    unresolved_gaps = []
    gp = ef / 'generated' / 'gap_report.json'
    if gp.exists():
        gaps = json.loads(gp.read_text(encoding='utf-8')).get('gaps',[])
        unresolved_gaps = [g for g in gaps if str(g.get('status','')).lower() not in {'fixed','fixed_with_external_blocker','documented_blocker'}]
    manifest_exists = (ef/'generated/execution_manifest.json').exists()
    upgrade_exists = (ef/'generated/upgrade_report.json').exists()
    applied_exists = (ef/'docs/APPLIED_UPGRADES.md').exists()
    goal_state = json.loads((ef/'generated/status_report.json').read_text(encoding='utf-8')) if (ef/'generated/status_report.json').exists() else {}
    goal_loop_complete = (
        goal_state.get('task_count') == goal_state.get('complete_count')
        and goal_state.get('failed_count') == 0
        and goal_state.get('pending_count') == 0
        and goal_state.get('blocked_count') == 0
    )
    external_blockers = [
        {'blocker_id':'EXT-DRIVE-WRITE','status':'documented','detail':'Authenticated Google Drive file edit/revision API is not available in this environment; upgraded package archive is produced for upload/application to Drive.'}
    ]
    pass_local = (
        not missing_outputs
        and not tasks_without_packets
        and not packet_missing_fields
        and not completed_without_proof
        and not unresolved_implementation_obligations
        and not nonimplementation_completion_proofs
        and goal_loop_complete
        and all(x['covered'] for x in coverage.values())
        and not unresolved_gaps
        and manifest_exists
        and upgrade_exists
        and applied_exists
    )
    status = final_status(pass_local, external_blockers)
    overall_complete = status == 'pass'
    report = {
      'schema_version':'1.0','generated_at':now(),'status':status,'local_package_complete':pass_local,'overall_complete':overall_complete,'task_count':len(rows),'packet_count':len(packets),'proof_count':len(proofs_by_task),'missing_outputs':missing_outputs,'tasks_without_packets':tasks_without_packets,'packet_missing_fields':packet_missing_fields,'source_sections':source_scan,'ignored_sections':ignored_sections,'completed_without_proof':completed_without_proof,'unresolved_implementation_obligation_count':len(unresolved_implementation_obligations),'unresolved_implementation_obligations':unresolved_implementation_obligations,'nonimplementation_completion_proof_count':len(nonimplementation_completion_proofs),'nonimplementation_completion_proofs':nonimplementation_completion_proofs,'goal_loop_complete':goal_loop_complete,'coverage':coverage,'unresolved_gaps':unresolved_gaps,'goal_loop_summary':goal_state,'external_blockers':external_blockers
    }
    write_json('generated/final_verification_report.json', report)
    md = ['# Final Verification', '', f"Status: **{status}**", '', f"Task count: {len(rows)}", f"Execution packet count: {len(packets)}", f"Proof count: {len(proofs_by_task)}", '', '## Coverage']
    for k,v in coverage.items():
        md.append(f"- {k}: {'covered' if v['covered'] else 'missing'} via `{v['task_id']}`")
    md += ['', '## External blockers']
    for b in external_blockers:
        md.append(f"- `{b['blocker_id']}`: {b['detail']}")
    md += ['', '## Missing outputs', json.dumps(missing_outputs, indent=2), '', '## Tasks without packets', json.dumps(tasks_without_packets, indent=2), '', '## Packet missing fields', json.dumps(packet_missing_fields, indent=2)]
    md += ['', '## Unresolved implementation obligations', json.dumps(unresolved_implementation_obligations, indent=2), '', '## Non-implementation completion proofs', json.dumps(nonimplementation_completion_proofs, indent=2)]
    (ef/'docs/FINAL_VERIFICATION.md').write_text('\n'.join(md)+'\n', encoding='utf-8')
    proof_status = 'completed' if status == 'pass' else status
    proof = make_proof('EF-008_VERIFY_HISTORY_COMPLETENESS',proof_status,'local-execution-framework','helper-final-01','gpt-5.3-spark','execution-framework',['execution-framework/generated/final_verification_report.json','execution-framework/docs/FINAL_VERIFICATION.md'],['python3 scripts/verify_history_and_completeness.py'],report,['generated/final_verification_report.json','docs/FINAL_VERIFICATION.md'],'' if status == 'pass' else 'see final report','resolve every reported blocker and rerun final verification')
    append_proof(proof)
    print(f"final verification status={status} tasks={len(rows)} packets={len(packets)} proofs={len(proofs_by_task)}")
    if status != 'pass':
        raise SystemExit(1)

if __name__ == '__main__':
    main()

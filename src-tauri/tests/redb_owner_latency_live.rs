//! Live ARCHBP redb owner latency measurements.

use flexnetos_redb_owner::{OwnerClient, OwnerService, ProjectionReader};
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Instant;

static ROOT_COUNTER: AtomicU64 = AtomicU64::new(0);

fn temp_root() -> PathBuf {
    let id = ROOT_COUNTER.fetch_add(1, Ordering::SeqCst);
    let root =
        std::env::temp_dir().join(format!("lifeos-redb-latency-{}-{id}", std::process::id()));
    std::fs::create_dir_all(&root).expect("create latency root");
    root
}

fn percentile(samples: &[f64], p: f64) -> f64 {
    let mut sorted = samples.to_vec();
    sorted.sort_by(|left, right| left.total_cmp(right));
    let index = (((p / 100.0) * sorted.len() as f64).ceil() as usize).saturating_sub(1);
    sorted[index.min(sorted.len() - 1)]
}

#[test]
fn measures_commit_projection_event_latency() {
    let root = temp_root();
    let _owner = OwnerService::start(&root).expect("owner starts");
    let mut client = OwnerClient::connect(&root).expect("client connects");
    let mut samples = Vec::with_capacity(100);

    for index in 0..100_u64 {
        let key = format!("latency/{index}");
        let started = Instant::now();
        let seq = client.put(&key, "ready").expect("owner put");
        let projection = ProjectionReader::read(&root).expect("projection read");
        assert_eq!(projection.local_seq, seq);
        let events = client.events(seq - 1, 1).expect("event read");
        assert_eq!(events.first().map(|event| event.seq), Some(seq));
        samples.push(started.elapsed().as_secs_f64() * 1_000.0);
    }

    let sum: f64 = samples.iter().sum();
    println!(
        "ARCHBP_REDB_LATENCY {}",
        serde_json::json!({
            "schemaVersion": "lifeos.redb-owner-latency.v1",
            "sampleCount": samples.len(),
            "samplesMs": samples,
            "meanMs": sum / 100.0,
            "p50Ms": percentile(&samples, 50.0),
            "p95Ms": percentile(&samples, 95.0),
            "p99Ms": percentile(&samples, 99.0),
            "workload": "owner commit -> mmap checksum read -> ordered event receipt",
        })
    );
    std::fs::remove_dir_all(root).ok();
}

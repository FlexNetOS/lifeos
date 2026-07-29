//! Live ARCHBP redb-owner boundary checks through the LifeOS Tauri dependency.

use flexnetos_redb_owner::{read_events, OwnerClient, OwnerError, OwnerService, ProjectionReader};
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};

static ROOT_COUNTER: AtomicU64 = AtomicU64::new(0);

fn temp_root(label: &str) -> PathBuf {
    let id = ROOT_COUNTER.fetch_add(1, Ordering::SeqCst);
    let root = std::env::temp_dir().join(format!(
        "lifeos-redb-owner-{label}-{}-{id}",
        std::process::id()
    ));
    std::fs::create_dir_all(&root).expect("create owner test root");
    root
}

fn cleanup(root: &PathBuf) {
    std::fs::remove_dir_all(root).ok();
}

#[test]
fn authenticated_owner_publishes_checksummed_projection_and_ordered_events() {
    let root = temp_root("live");
    let owner = OwnerService::start(&root).expect("owner starts");
    let mut client = OwnerClient::connect(&root).expect("client connects");

    assert_eq!(client.put("session", "active").expect("put"), 1);
    assert_eq!(client.put("branch", "main").expect("put"), 2);

    let projection = ProjectionReader::read(&root).expect("read projection");
    assert_eq!(projection.local_seq, 2);
    assert_eq!(
        projection.entries.get("session"),
        Some(&"active".to_string())
    );
    assert!(!projection.checksum.is_empty());

    let events = read_events(&root, 0).expect("read ordered events");
    assert_eq!(
        events.iter().map(|event| event.seq).collect::<Vec<_>>(),
        [1, 2]
    );
    assert!(events
        .iter()
        .all(|event| event.slot == "a" || event.slot == "b"));

    let mut bad = OwnerClient::connect(&root).expect("bad client connects");
    bad.override_token("invalid-token");
    assert!(matches!(
        bad.put("denied", "write"),
        Err(OwnerError::Rejected(_))
    ));

    drop(owner);
    cleanup(&root);
}

#[test]
fn owner_republishes_a_commit_after_projection_publish_failure() {
    let root = temp_root("replay");
    {
        let owner = OwnerService::start(&root).expect("owner starts");
        let mut client = OwnerClient::connect(&root).expect("client connects");
        assert_eq!(client.put("stable", "1").expect("stable put"), 1);
        owner.inject_publish_crash();
        assert!(client.put("replayed", "2").is_err());
        assert_eq!(
            ProjectionReader::read(&root)
                .expect("read stale projection")
                .local_seq,
            1
        );
    }

    let _owner = OwnerService::start(&root).expect("owner restarts and replays");
    let projection = ProjectionReader::read(&root).expect("read replayed projection");
    assert_eq!(projection.local_seq, 2);
    assert_eq!(projection.entries.get("replayed"), Some(&"2".to_string()));
    cleanup(&root);
}

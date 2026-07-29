#![cfg(feature = "storage")]

use lifeos_core::storage::Storage;

#[tokio::test]
#[ignore = "requires the canonical live PostgreSQL database"]
async fn canonical_migrations_apply_through_the_storage_runner() {
    let url = std::env::var("LIFEOS_DATABASE_URL").expect("LIFEOS_DATABASE_URL");
    let storage = Storage::new(&url).await.expect("connect canonical database");
    let report = storage.migrate().await.expect("apply embedded migrations");
    assert_eq!(report.applied, report.total);
    assert_eq!(report.total, 61);
}

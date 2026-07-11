use redb::{Database, Durability, ReadableDatabase, TableDefinition};
use std::time::{Instant, SystemTime, UNIX_EPOCH};

const TABLE: TableDefinition<u64, &[u8]> = TableDefinition::new("bench");

fn percentile(values: &mut [u128], percentile: usize) -> u128 {
    values.sort_unstable();
    values[(values.len() - 1) * percentile / 100]
}

fn print_stats(name: &str, mut values: Vec<u128>) {
    let p50 = percentile(&mut values, 50);
    let p95 = percentile(&mut values, 95);
    let p99 = percentile(&mut values, 99);
    println!(
        "{name},count={},p50_ns={p50},p95_ns={p95},p99_ns={p99}",
        values.len()
    );
}

fn cosine(a: &[f32], b: &[f32]) -> f32 {
    let mut dot = 0.0;
    let mut aa = 0.0;
    let mut bb = 0.0;
    for index in 0..a.len() {
        dot += a[index] * b[index];
        aa += a[index] * a[index];
        bb += b[index] * b[index];
    }
    dot / (aa.sqrt() * bb.sqrt())
}

fn main() {
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let path = std::env::temp_dir().join(format!("nbverify-redb-bench-{stamp}.redb"));
    let database = Database::create(&path).unwrap();
    let payload = vec![7_u8; 384 * 4];

    {
        let mut write = database.begin_write().unwrap();
        write.set_durability(Durability::Immediate).unwrap();
        {
            let mut table = write.open_table(TABLE).unwrap();
            table.insert(0, &payload[..]).unwrap();
        }
        write.commit().unwrap();
    }

    let mut reads = Vec::with_capacity(5_000);
    for _ in 0..5_000 {
        let started = Instant::now();
        let read = database.begin_read().unwrap();
        let table = read.open_table(TABLE).unwrap();
        std::hint::black_box(table.get(0).unwrap().unwrap().value());
        reads.push(started.elapsed().as_nanos());
    }
    print_stats("redb_read_1536b", reads);

    let mut writes = Vec::with_capacity(250);
    for key in 1..=250 {
        let started = Instant::now();
        let mut write = database.begin_write().unwrap();
        write.set_durability(Durability::Immediate).unwrap();
        {
            let mut table = write.open_table(TABLE).unwrap();
            table.insert(key, &payload[..]).unwrap();
        }
        write.commit().unwrap();
        writes.push(started.elapsed().as_nanos());
    }
    print_stats("redb_write_commit_immediate_1536b", writes);

    for dimension in [384_usize, 4096_usize] {
        let a = vec![0.25_f32; dimension];
        let b = vec![0.5_f32; dimension];
        let mut times = Vec::with_capacity(10_000);
        for _ in 0..10_000 {
            let started = Instant::now();
            std::hint::black_box(cosine(&a, &b));
            times.push(started.elapsed().as_nanos());
        }
        print_stats(&format!("application_cosine_dim_{dimension}"), times);
    }

    println!("db_bytes={}", std::fs::metadata(&path).unwrap().len());
    let _ = std::fs::remove_file(path);
}

export def fixture-init [
    name: string
    --enabled
] {
    let metadata = {
        name: $name
        enabled: $enabled
        source: "codedb-fixture"
    }

    $metadata | upsert initialized_at "static"
}

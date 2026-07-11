let rows = 1000
let runs = 200
let warmup_runs = 20
let data = (0..<$rows | each {|i|
  {
    module_path: $"src/module_($i).rs"
    symbol: $"function_($i)"
    kind: "function"
    line: ($i + 1)
    public: ($i mod 2 == 0)
    hash: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
    embedding_dimensions: 384
    tags: ["rust" "code" "fixture"]
  }
})

0..<$warmup_runs | each { $data | to msgpack | ignore } | ignore
0..<$warmup_runs | each { $data | to json --raw | ignore } | ignore

let msgpack_ns = (0..<$runs | each { timeit { $data | to msgpack } | into int })
let json_ns = (0..<$runs | each { timeit { $data | to json --raw } | into int })
let msgpack_size = ($data | to msgpack | bytes length)
let json_size = ($data | to json --raw | str length)

{
  rows: $rows
  runs: $runs
  warmup_runs: $warmup_runs
  msgpack_size_bytes: $msgpack_size
  json_size_bytes: $json_size
  msgpack_ns: $msgpack_ns
  json_ns: $json_ns
} | to json --raw

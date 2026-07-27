# Dirty repository fixture

To materialize this fixture, copy `../clean_repo` to a temporary directory,
initialize a Git repository, commit the two crate files, and then append a
comment to `src/lib.rs` without committing it. The expected repository state
is one modified tracked file.

The mutation is described instead of committed because Git does not preserve a
working-tree dirty bit in a portable fixture.

# Portable symlink fixture

`symlink_manifest.txt` declares a relative symbolic link. Test harnesses should
copy this directory and create the link in that temporary copy:

```text
link.txt -> target.txt
```

Resolving the link must produce the exact contents of `target.txt`.

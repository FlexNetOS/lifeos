# ART-116 Infrastructure Topology Map

Generated: `2026-07-24T10:29:52+00:00`

Host: `drdave-TRX50-AI-TOP` — built from **direct, read-only probing of the live host in this session** (not a repo-file scan). The prior version of this generator performed a repo-filename evidence scan against a target descriptor (/home/flexnetos/FlexNetOS) and never probed real host infrastructure. This version replaces that scan with genuine host probing per the ART-116 packet contract.

## Compute

- Hostname: `drdave-TRX50-AI-TOP`
- Kernel: `Linux 7.0.0-28-generic` (`#28-Ubuntu SMP PREEMPT_DYNAMIC Sun Jun 21 01:01:36 UTC 2026`), arch `x86_64`
- CPU model: `AMD Ryzen Threadripper PRO 7965WX 24-Cores`
- Logical CPUs: `48` (os.cpu_count), `48` (sched affinity), `48` (/proc/cpuinfo)
- Physical packages: `1`; cores/package: `['24']`; siblings/package: `['48']`
- Memory: total `498.9 GiB`, available `453.2 GiB`, free `190.2 GiB`
- Load average (1/5/15 min): `3.81 7.12 7.00`; runnable/total procs `3/4651`

## Networking

- Address source: `/usr/sbin/ip -j addr`
- Route source: `/usr/sbin/ip route`
- Listener source: `/bin/ss -tlnp`

### Interfaces

| Interface | State | MAC | IPv4 |
| --- | --- | --- | --- |
| lo | UNKNOWN | 00:00:00:00:00:00 | 127.0.0.1/8 |
| eno1 | UP | 10:ff:e0:b3:9e:55 | 10.0.1.172/24 |
| enp73s0 | DOWN | 10:ff:e0:b3:9e:56 | none |
| wlp71s0 | UP | 04:68:74:aa:a0:65 | 10.0.1.161/24 |
| virbr0 | DOWN | 52:54:00:a2:9b:31 | 192.168.122.1/24 |
| docker0 | DOWN | 12:21:ba:7e:a7:04 | 172.17.0.1/16 |
| br-6fff958fc08d | DOWN | f2:76:d1:42:b6:e1 | 172.18.0.1/16 |
| enxb6c23dc46927 | UP | b6:c2:3d:c4:69:27 | none |
| enxde98079bf2db | UNKNOWN | de:98:07:9b:f2:db | none |

### Default routes

- `default via 10.0.1.1 dev eno1 proto dhcp src 10.0.1.172 metric 104 `
- `default via 10.0.1.1 dev wlp71s0 proto dhcp src 10.0.1.161 metric 600 `

### Listening sockets

Total real listening sockets observed this session: `134`. Well-known ports matched:

| Local address | Likely service | Process |
| --- | --- | --- |
| 192.168.122.1:53 | DNS | n/a |
| 127.0.0.53%lo:53 | DNS | n/a |
| 127.0.0.54:53 | DNS | n/a |
| 127.0.0.1:1420 | LifeOS Vite dev server | users:(("MainThread",pid=971327,fd=20)) |
| 127.0.0.1:5432 | PostgreSQL | users:((".postgres-wrapp",pid=2891097,fd=6)) |

Full machine-readable listener list (including ephemeral dev-tool ports) is in `topology.json` under `networking.listening_sockets`.

## Storage

### Filesystems (real mounts; tmpfs/devtmpfs/efivarfs/snap-loop omitted for readability)

| Filesystem | Size | Used | Available | Capacity | Mounted on |
| --- | --- | --- | --- | --- | --- |
| /dev/nvme1n1p2 | 3.6TiB | 956.1GiB | 2.5TiB | 28% | / |
| /dev/nvme1n1p1 | 1.0GiB | 6.3MiB | 1.0GiB | 1% | /boot/efi |
| /dev/sdc1 | 21.8TiB | 1.7TiB | 20.1TiB | 8% | /run/media/flexnetos/BackupHDD |
| /dev/sdd | 31.9MiB | 236.0KiB | 31.7MiB | 1% | /run/media/flexnetos/COGNITUM |

(Full `df -B1 -P` output, including tmpfs/snap mounts, is in `topology.json` and the task log.)

### Block devices (physical disks)

| Device | Size | Model | Serial | Partitions (fstype@mountpoint) |
| --- | --- | --- | --- | --- |
| sda | 18.2T | ST20000NT001-3MB101 | ZYD2RJEG | sda1:ntfs@unmounted |
| sdb | 238.5G | SSK Portable SSD 256GB | SSKPSSD0000000002268 | sdb1:vfat@/run/media/drdave/UBUNTU 26_0 |
| sdc | 21.8T | ST24000NT002-3N1101 | ZYD4DN2H | sdc1:ntfs@/run/media/flexnetos/BackupHDD |
| sdd | 32M | File-Stor Gadget | 0e34a5e5-a7b6-4c68-ad04-e437e22f326a | no partitions |
| sde | 18.2T | ST20000NT001-3MB101 | ZYD2L293 | sde1:?@unmounted; sde2:vfat@unmounted; sde3:ext4@unmounted |
| nvme1n1 | 3.6T | Samsung SSD 9100 PRO 4TB | S7YANJ0Y315416B | nvme1n1p1:vfat@/boot/efi; nvme1n1p2:ext4@/ |
| nvme0n1 | 3.6T | Samsung SSD 9100 PRO 4TB | S7YANJ0Y403683Y | nvme0n1p1:vfat@unmounted; nvme0n1p2:ext4@unmounted; nvme0n1p3:ext4@unmounted |

### PostgreSQL datadir footprint

- Process running: `True`
- Datadir: `/home/flexnetos/meta/var/lib/postgresql/17`
- Datadir exists: `True`
- On-disk size (`du -sh`): `25G`
- Hosted on filesystem: `/`

## DNS

- Nameservers (from `/etc/resolv.conf`): `127.0.0.53`
- Search domains: `lan`

### /etc/hosts entries (non-default)

- No custom entries beyond loopback/IPv6 defaults.

## Load balancers / reverse proxies

- Status: `none_detected`
- No reverse-proxy or load-balancer process, nor a known config directory, was found on this host.

## Firewalls

- Status: `ruleset_read_permission_denied`
- Kernel netfilter modules loaded: `nft_compat, x_tables, nf_tables`
- `nft`: binary=`/usr/sbin/nft`, permitted=`False`, message=`Operation not permitted (you must be root)
netlink: Error: cache initialization failed: Operation not permitted`
- `iptables`: binary=`/sbin/iptables`, permitted=`False`, message=`iptables v1.8.11 (nf_tables): Could not fetch rule set generation id: Permission denied (you must be root)`
- `ufw`: binary=`/usr/sbin/ufw`, permitted=`False`, message=`ERROR: You need to be root to run this script`
- Note: Kernel netfilter subsystem is active (modules loaded: nft_compat, x_tables, nf_tables) but this session lacks the root privilege required to enumerate nft/iptables/ufw rules. Ruleset contents are not available and are not fabricated.

## Certificates

- Trust store directories present: `['/etc/ssl/certs', '/usr/lib/ssl/certs', '/usr/local/share/ca-certificates', '/usr/share/ca-certificates']` (checked: `['/etc/ssl/certs', '/usr/lib/ssl/certs', '/etc/pki/tls/certs', '/usr/local/share/ca-certificates', '/usr/share/ca-certificates']`)
- Total cert-like files found (path enumeration only): `252`
- Sampled for metadata extraction (openssl x509 -noout, never raw content): `20`

| Path | Kind | Subject | Issuer | Not After |
| --- | --- | --- | --- | --- |
| /etc/ssl/certs/ca-certificates.crt | file | CN=ACCVRAIZ1, OU=PKIACCV, O=ACCV, C=ES | CN=ACCVRAIZ1, OU=PKIACCV, O=ACCV, C=ES | Dec 31 09:37:37 2030 GMT |
| /usr/lib/ssl/certs/ca-certificates.crt | file | CN=ACCVRAIZ1, OU=PKIACCV, O=ACCV, C=ES | CN=ACCVRAIZ1, OU=PKIACCV, O=ACCV, C=ES | Dec 31 09:37:37 2030 GMT |
| /usr/local/share/ca-certificates/cognitum-ca.crt | file | CN=Cognitum Device CA, O=Cognitum One, OU=Device Security | CN=Cognitum Device CA, O=Cognitum One, OU=Device Security | Jun 13 11:17:14 2046 GMT |
| /usr/local/share/ca-certificates/lane.crt | file | CN=lane Root CA, O=lane | CN=lane Root CA, O=lane | Jun 10 22:30:20 2036 GMT |
| /etc/ssl/certs/002c0b4f.0 | symlink | C=BE, O=GlobalSign nv-sa, CN=GlobalSign Root R46 | C=BE, O=GlobalSign nv-sa, CN=GlobalSign Root R46 | Mar 20 00:00:00 2046 GMT |
| /etc/ssl/certs/0179095f.0 | symlink | C=CN, O=BEIJING CERTIFICATE AUTHORITY, CN=BJCA Global Root CA1 | C=CN, O=BEIJING CERTIFICATE AUTHORITY, CN=BJCA Global Root CA1 | Dec 12 03:16:17 2044 GMT |
| /etc/ssl/certs/062cdee6.0 | symlink | OU=GlobalSign Root CA - R3, O=GlobalSign, CN=GlobalSign | OU=GlobalSign Root CA - R3, O=GlobalSign, CN=GlobalSign | Mar 18 10:00:00 2029 GMT |
| /etc/ssl/certs/064e0aa9.0 | symlink | C=BM, O=QuoVadis Limited, CN=QuoVadis Root CA 2 G3 | C=BM, O=QuoVadis Limited, CN=QuoVadis Root CA 2 G3 | Jan 12 18:59:32 2042 GMT |
| /etc/ssl/certs/06dc52d5.0 | symlink | C=US, ST=Texas, L=Houston, O=SSL Corporation, CN=SSL.com EV Root Certification Authority RSA R2 | C=US, ST=Texas, L=Houston, O=SSL Corporation, CN=SSL.com EV Root Certification Authority RSA R2 | May 30 18:14:37 2042 GMT |
| /etc/ssl/certs/09789157.0 | symlink | C=US, ST=Arizona, L=Scottsdale, O=Starfield Technologies, Inc., CN=Starfield Services Root Certificate Authority - G2 | C=US, ST=Arizona, L=Scottsdale, O=Starfield Technologies, Inc., CN=Starfield Services Root Certificate Authority - G2 | Dec 31 23:59:59 2037 GMT |
| /etc/ssl/certs/0a775a30.0 | symlink | C=US, O=Google Trust Services LLC, CN=GTS Root R3 | C=US, O=Google Trust Services LLC, CN=GTS Root R3 | Jun 22 00:00:00 2036 GMT |
| /etc/ssl/certs/0b1b94ef.0 | symlink | C=CN, O=China Financial Certification Authority, CN=CFCA EV ROOT | C=CN, O=China Financial Certification Authority, CN=CFCA EV ROOT | Dec 31 03:07:01 2029 GMT |
| /etc/ssl/certs/0b9bc432.0 | symlink | C=US, O=Internet Security Research Group, CN=ISRG Root X2 | C=US, O=Internet Security Research Group, CN=ISRG Root X2 | Sep 17 16:00:00 2040 GMT |
| /etc/ssl/certs/0bf05006.0 | symlink | C=US, ST=Texas, L=Houston, O=SSL Corporation, CN=SSL.com Root Certification Authority ECC | C=US, ST=Texas, L=Houston, O=SSL Corporation, CN=SSL.com Root Certification Authority ECC | Feb 12 18:14:03 2041 GMT |
| /etc/ssl/certs/0f5dc4f3.0 | symlink | C=CN, O=UniTrust, CN=UCA Extended Validation Root | C=CN, O=UniTrust, CN=UCA Extended Validation Root | Dec 31 00:00:00 2038 GMT |
| /etc/ssl/certs/0f6fa695.0 | symlink | C=CN, O=GUANG DONG CERTIFICATE AUTHORITY CO.,LTD., CN=GDCA TrustAUTH R5 ROOT | C=CN, O=GUANG DONG CERTIFICATE AUTHORITY CO.,LTD., CN=GDCA TrustAUTH R5 ROOT | Dec 31 15:59:59 2040 GMT |
| /etc/ssl/certs/1001acf7.0 | symlink | C=US, O=Google Trust Services LLC, CN=GTS Root R1 | C=US, O=Google Trust Services LLC, CN=GTS Root R1 | Jun 22 00:00:00 2036 GMT |
| /etc/ssl/certs/1359544c.0 | symlink | CN=Cognitum Device CA, O=Cognitum One, OU=Device Security | CN=Cognitum Device CA, O=Cognitum One, OU=Device Security | Jun 13 11:17:14 2046 GMT |
| /etc/ssl/certs/14bc7599.0 | symlink | C=IN, OU=emSign PKI, O=eMudhra Technologies Limited, CN=emSign ECC Root CA - G3 | C=IN, OU=emSign PKI, O=eMudhra Technologies Limited, CN=emSign ECC Root CA - G3 | Feb 18 18:30:00 2043 GMT |
| /etc/ssl/certs/1cef98f5.0 | symlink | C=CN, O=TrustAsia Technologies, Inc., CN=TrustAsia Global Root CA G4 | C=CN, O=TrustAsia Technologies, Inc., CN=TrustAsia Global Root CA G4 | May 19 02:10:22 2046 GMT |

## Topology graph

| Node | Kind | Label |
| --- | --- | --- |
| host:drdave-TRX50-AI-TOP | compute | Local host (drdave-TRX50-AI-TOP) |
| network:lo | networking | Interface lo (UNKNOWN) 127.0.0.1/8 |
| network:eno1 | networking | Interface eno1 (UP) 10.0.1.172/24 |
| network:wlp71s0 | networking | Interface wlp71s0 (UP) 10.0.1.161/24 |
| network:virbr0 | networking | Interface virbr0 (DOWN) 192.168.122.1/24 |
| network:docker0 | networking | Interface docker0 (DOWN) 172.17.0.1/16 |
| network:br-6fff958fc08d | networking | Interface br-6fff958fc08d (DOWN) 172.18.0.1/16 |
| network:enxb6c23dc46927 | networking | Interface enxb6c23dc46927 (UP) |
| storage:postgresql-datadir | storage | PostgreSQL 17 datadir (/home/flexnetos/meta/var/lib/postgresql/17, 25G) |
| disk:sda | storage | sda 18.2T ST20000NT001-3MB101 |
| disk:sdb | storage | sdb 238.5G SSK Portable SSD 256GB |
| disk:sdc | storage | sdc 21.8T ST24000NT002-3N1101 |
| disk:sdd | storage | sdd 32M File-Stor Gadget |
| disk:sde | storage | sde 18.2T ST20000NT001-3MB101 |
| disk:nvme1n1 | storage | nvme1n1 3.6T Samsung SSD 9100 PRO 4TB |
| disk:nvme0n1 | storage | nvme0n1 3.6T Samsung SSD 9100 PRO 4TB |
| dns:resolver | dns | DNS resolver(s): 127.0.0.53 |
| firewall:netfilter | firewall | Kernel netfilter (nft_compat, x_tables, nf_tables) |
| certificates:system-trust-store | certificates | System trust store (252 cert files under /etc/ssl/certs) |

| From | Type | To |
| --- | --- | --- |
| host:drdave-TRX50-AI-TOP | has_interface | network:lo |
| host:drdave-TRX50-AI-TOP | has_interface | network:eno1 |
| host:drdave-TRX50-AI-TOP | has_interface | network:wlp71s0 |
| host:drdave-TRX50-AI-TOP | has_interface | network:virbr0 |
| host:drdave-TRX50-AI-TOP | has_interface | network:docker0 |
| host:drdave-TRX50-AI-TOP | has_interface | network:br-6fff958fc08d |
| network:eno1 | default_route | network:default-gateway |
| network:wlp71s0 | default_route | network:default-gateway |
| storage:postgresql-datadir | resides_on | disk:nvme1n1 |
| firewall:netfilter | constrains | host:drdave-TRX50-AI-TOP |
| certificates:system-trust-store | secures | host:drdave-TRX50-AI-TOP |

## Gaps

| Category | Gap | Next evidence needed |
| --- | --- | --- |
| firewalls | Ruleset enumeration (nft/iptables/ufw) requires root privilege, not available in this session. | Re-run the firewall probe as root or with CAP_NET_ADMIN to capture actual rule contents. |
| load_balancers | No reverse-proxy/load-balancer process or config directory detected on this host. | If a load balancer is expected for this workload, confirm it runs on a different host/container outside this process namespace. |

## Evidence boundary

- Secret-like paths are excluded by policy and were never read: `**/.env`, `**/secrets/**`, `**/private_keys/**`, `**/*.pem`, `**/*.key`. Certificate files under public trust-store directories are the sole exception, and only their non-secret x509 metadata (subject/issuer/expiry) is extracted via `openssl x509 -noout`; no private key is ever read.
- Firewall ruleset contents were not available in this session (no root privilege); this is recorded honestly above rather than fabricated.
- All commands executed and their real output are recorded in `logs/ART-116_INFRA_TOPOLOGY.log` and in `topology.json`'s `commands_executed` list.

// readex — data layer

window.READEX_DATA = {
  filesystems: [
    { id: "fat",       name: "FAT12 / 16 / 32",   era: "1977→",   family: "DOS / Windows", origin: "Microsoft", caps: { read:1, write:1, check:1, fix:1, undelete:1 }, blurb: "The reference driver. Boot sectors, FATs, root dirs, long-name VFAT, FAT12 packed nibbles, FAT32 dual-FAT mirroring — all covered. The only driver that ships full auto-repair." },
    { id: "ntfs",      name: "NTFS",              era: "1993→",   family: "Windows NT",    origin: "Microsoft", caps: { read:1, write:1, check:1, fix:0, undelete:1 }, blurb: "MFT records, $FILE_NAME mirrors, hard links, resident → non-resident INDEX_ROOT promotion, INDX-block splits. Single staged plan per mutation — no torn pictures even at depth-1 → 2 mid-tier promotes." },
    { id: "ext4",      name: "ext4",              era: "2008→",   family: "Linux",         origin: "Wheeler/Mason et al.", caps: { read:1, write:1, check:1, fix:0, undelete:1 }, blurb: "Extents, htree directories, 64-bit block addressing. Shares the validator with ext2 — one source of truth for bitmap math after the E2 consolidation." },
    { id: "ext2",      name: "ext2",              era: "1993→",   family: "Linux",         origin: "Rémy Card",    caps: { read:1, write:1, check:1, fix:0, undelete:1 }, blurb: "Block groups, indirect blocks, classic inode layout. Strict structural validator consolidated in `check.rs` — no duplicated walker logic." },
    { id: "ods2",      name: "ODS-2",             era: "1979→",   family: "OpenVMS",       origin: "DEC",          caps: { read:1, write:1, check:1, fix:0, undelete:1 }, blurb: "Files-11 On-Disk Structure Level 2. Home block, INDEXF.SYS, file headers with retrieval pointers. CD images parsed via FFBY=0 DEC convention." },
    { id: "ufs",       name: "UFS1",              era: "1984→",   family: "BSD / Solaris", origin: "McKusick et al.", caps: { read:1, write:1, check:1, fix:0, undelete:1 }, blurb: "Berkeley FFS lineage. Cylinder groups, direct/indirect/double/triple-indirect blocks, frag allocation. Sits behind BSD disklabel fallback." },
    { id: "hfs",       name: "HFS (Classic)",     era: "1985→",   family: "Mac OS",        origin: "Apple",        caps: { read:1, write:1, check:1, fix:0, undelete:0 }, blurb: "Hierarchical File System. B-tree catalog, allocation block map, resource forks. Five layers of Apple-incompatible on-disk layouts corrected for a 1989 floppy." },
    { id: "hpfs",      name: "HPFS",              era: "1989→",   family: "OS/2",          origin: "Microsoft/IBM", caps: { read:1, write:1, check:1, fix:0, undelete:1 }, blurb: "High Performance File System. Superblock, spare blocks, F-nodes, dnodes. Root traversal expects the root dnode in a direct extent — exotic root layouts fail closed." },
    { id: "efs",       name: "EFS",               era: "1989→",   family: "SGI IRIX",      origin: "SGI",          caps: { read:1, write:1, check:1, fix:1, undelete:0 }, blurb: "SGI Extent File System. Has a Phase-2 narrow auto-fix: mirror-recover from the secondary replica via `fix --repair-replica`." },
    { id: "xfs",       name: "XFS",               era: "1993→",   family: "SGI / Linux",   origin: "SGI",          caps: { read:1, write:1, check:1, fix:0, undelete:0 }, blurb: "Allocation groups, B+tree directories (dir1 + dir2 formats), 64-bit inode numbers. The reference driver for adding new filesystems — ~42 touch points walked end to end." },
    { id: "hpux_hfs",  name: "HP-UX HFS",         era: "1980s→",  family: "HP-UX",         origin: "HP",           caps: { read:1, write:1, check:1, fix:0, undelete:0 }, blurb: "Hewlett-Packard's UFS-derived filesystem. Sits behind the HP-UX LVM partition scheme alongside VxFS." },
    { id: "aix_jfs1",  name: "AIX JFS1",          era: "1990→",   family: "AIX",           origin: "IBM",          caps: { read:1, write:1, check:1, fix:0, undelete:0 }, blurb: "IBM's original Journaled File System for AIX. Superblock, allocation groups, inode aggregates." },
    { id: "cpm",       name: "CP/M",              era: "1974→",   family: "CP/M / DOS-era", origin: "Digital Research", caps: { read:1, write:1, check:1, fix:0, undelete:0 }, blurb: "Disk Parameter Blocks vary wildly per machine. Built-in DPB profile list — `kaypro_ii_dsdd` was added after the corpus stress test flagged a missing profile." },
    { id: "rt11",      name: "RT-11",             era: "1973→",   family: "PDP-11",        origin: "DEC",          caps: { read:1, write:1, check:1, fix:0, undelete:0 }, blurb: "DEC's PDP-11 operating system. Home block + contiguous-file directory segments. Accepts checksum=0x0000 with a diagnostic — real floppies in the wild leave it zeroed." },
    { id: "adfs",      name: "ADFS",              era: "1983→",   family: "Acorn",         origin: "Acorn",        caps: { read:1, write:1, check:1, fix:0, undelete:0 }, blurb: "Acorn Disc Filing System — Archimedes and RISC OS era. Big-endian on-disk layout, FileCore catalog." },
    { id: "acorn_dfs", name: "Acorn DFS",         era: "1982→",   family: "Acorn",         origin: "Acorn",        caps: { read:1, write:1, check:1, fix:0, undelete:0 }, blurb: "BBC Micro Disc Filing System. 256-byte sectors, catalog at track zero. Validator was relaxed after 7/47 → 47/47 DFS corpus images passing." },
    { id: "iso9660",   name: "ISO 9660",          era: "1988→",   family: "Optical",       origin: "ECMA / ISO",   caps: { read:1, write:0, check:1, fix:0, undelete:0 }, blurb: "CD-ROM filesystem. Read-only by design — optical mutation flows are out of scope. Sits behind CUE/BIN parsing for MODE1/2048 and MODE1/2352 tracks." },
    { id: "vxfs",      name: "VxFS",              era: "1991→",   family: "HP-UX",         origin: "Veritas",      caps: { read:1, write:0, check:1, fix:0, undelete:0 }, blurb: "Veritas File System on HP-UX LVM volumes. Read-only — write support not implemented, parsing only." },
  ],

  pipeline: [
    {
      id: "container",
      name: "Container",
      desc: "Open the image file",
      files: "src/container/",
      detail: {
        title: "Open the image and resolve sector size",
        body: "The container layer abstracts over raw images and CUE/BIN optical sets. It opens the file, takes an OS-level file lock (POSIX F_WRLCK or Win32 LockFileEx) for the writer-exclusivity guarantee, and resolves the sector size — 512 by default, 2048 forced for optical containers, anything else override-able with `--sector-size`.",
        bullets: [
          "Single-writer file lock — cross-process, no torn pictures",
          "Read-only opens take a shared lock; writable opens exclude both",
          "CUE/BIN parsing: relative FILE…BINARY, MODE1/2048 + MODE1/2352",
          "No support for VHD, VHDX, VMDK or QCOW2 (yet)"
        ],
        code: "$ readex inspect disk.img\nFormat:       raw\nSectorSize:   512\nSectorCount:  4096\nSize:         2.0 MB"
      }
    },
    {
      id: "partition",
      name: "Partition",
      desc: "Detect layout",
      files: "src/partition/",
      detail: {
        title: "Probe every known partition scheme",
        body: "Nine partition schemes are tried in order, ranked by the strength of their signatures. MBR is recognised with DOS extended-partition chains; GPT carries a backup-header fallback that surfaces a [GPT_BACKUP_USED] diagnostic when the primary header is damaged.",
        bullets: [
          "MBR (with DOS extended chains)",
          "GPT (with backup-header fallback)",
          "BSD disklabel — also runs as MBR-fallback so NetBSD UFS images detect",
          "Apple Partition Map · Sun VTOC · SGI Volume Header",
          "AIX LVM · HP-UX LVM · MxDisk (CP/M hard disk)"
        ],
        code: "Region: partition-0 start=1 count=4095\n  Partition: type=0x0c bootable=true"
      }
    },
    {
      id: "detect",
      name: "Detection",
      desc: "Identify each region",
      files: "src/fs/detect.rs",
      detail: {
        title: "Rank every driver against every region",
        body: "Each filesystem driver implements a `detect()` method that returns a confidence ordinal — None, Low, Medium, or High — plus optional Evidence strings describing what made it confident. The detect engine probes every region against every registered driver and the highest-confidence match wins.",
        bullets: [
          "DetectionConfidence: None · Low · Medium · High",
          "Drivers attach Evidence strings ('FAT_TYPE=FAT32', 'NTFS_OEM=NTFS    ')",
          "Ambiguous cases surface in CLI with --fs override",
          "Same machinery used by `readex inspect` to print the full report"
        ],
        code: "Filesystem: FatFamily confidence=High\n  Evidence: FAT_TYPE=FAT32\n  FAT: variant=FAT32 oem=\"MSWIN4.1\"\n       clusters=69368 spc=1"
      }
    },
    {
      id: "mount",
      name: "Mount",
      desc: "Parse superblock",
      files: "src/fs/traits.rs",
      detail: {
        title: "Build the in-memory view",
        body: "`FileSystemDriver::mount()` parses the on-disk structures and returns a `MountedFileSystem` (read-only view) plus an optional `WritableFileSystem` (write capability). All drivers share a deferred-cache layer: children are loaded lazily, with a `max_nodes` budget (100,000 by default) bounding memory growth.",
        bullets: [
          "MountedFileSystem: lookup, stat, list_children, read_file, metadata_view",
          "WritableFileSystem: create, write, truncate, delete, rename, mkdir, set_metadata",
          "Deferred caching with generation-tracked staleness checks",
          "Wide critical sections keep cache_generation in lockstep with fs.gen"
        ],
        code: "let mount = driver.mount(DriverMountRequest {\n    device, region, sector_size, …\n})?;\nmount.mounted.list_children(root)?;"
      }
    },
    {
      id: "op",
      name: "Operation",
      desc: "Inspect · Read · Write",
      files: "src/cli/",
      detail: {
        title: "Eleven verbs, one staged pipeline",
        body: "Every CLI verb funnels into the same Container → Partition → Detection → Mount stack. Read verbs go straight to the mounted view; write verbs route through the overlay transaction layer, where mutations are staged in memory and only land on disk at `commit`.",
        bullets: [
          "Read: inspect · list · cat · extract · undelete",
          "Mutate (staged): put · mkdir · delete · rename",
          "Session: txn · checkpoint · revert · commit",
          "Lifecycle: mount · unmount · check (--rescue-log) · fix"
        ],
        code: "$ readex put image.img local.txt /GUEST.TXT --txn s1\n$ readex checkpoint s1 \"before risky change\"\n$ readex commit s1 --mode export --output out.img"
      }
    }
  ],

  commands: [
    {
      id: "inspect",
      cmd: "readex inspect disk.img",
      desc: "Probe partitions, identify filesystems, print evidence",
      output: [
        ["prompt","$ "],["cmd","readex inspect disk.img"],
        ["nl"],
        ["out","Format: "],["key","raw"],["nl"],
        ["out","SectorSize: "],["key","512"],["nl"],
        ["out","SectorCount: "],["key","4096"],["nl"],
        ["out","Size: "],["key","2.0 MB"],["nl"],
        ["out","Layout: "],["key","Mbr"],["nl"],
        ["out","Region: partition-0 start=1 count=4095"],["nl"],
        ["dim","  Partition: type=0x0c bootable=true"],["nl"],
        ["out","  Filesystem: "],["ok","FatFamily"],["dim"," confidence="],["ok","High"],["nl"],
        ["dim","    Evidence: FAT_TYPE=FAT32"],["nl"],
        ["dim","    FAT: variant=FAT32 oem=\"MSWIN4.1\" clusters=69368 spc=1"],["nl"],
        ["dim","    Root: 1 files, 0 dirs"],["nl"],
      ]
    },
    {
      id: "list",
      cmd: "readex list disk.img /WINDOWS/SYSTEM",
      desc: "Walk a guest directory",
      output: [
        ["prompt","$ "],["cmd","readex list disk.img /WINDOWS/SYSTEM"],["nl"],
        ["dim","TYPE   SIZE        NAME"],["nl"],
        ["out","DIR             ."],["nl"],
        ["out","DIR             .."],["nl"],
        ["out","FILE   "],["key","   32420"],["out","  CONFIG.SYS"],["nl"],
        ["out","FILE   "],["key","   12108"],["out","  HIMEM.SYS"],["nl"],
        ["out","FILE   "],["key","    5904"],["out","  KEYBOARD.SYS"],["nl"],
        ["out","DIR             IOSUBSYS"],["nl"],
        ["out","DIR             VMM32"],["nl"],
        ["dim","5 entries"],["nl"],
      ]
    },
    {
      id: "cat",
      cmd: "readex cat disk.img /AUTOEXEC.BAT",
      desc: "Stream a guest file to stdout",
      output: [
        ["prompt","$ "],["cmd","readex cat disk.img /AUTOEXEC.BAT"],["nl"],
        ["out","@ECHO OFF"],["nl"],
        ["out","PATH C:\\WINDOWS;C:\\DOS;C:\\UTILS"],["nl"],
        ["out","SET TEMP=C:\\TEMP"],["nl"],
        ["out","SET PROMPT=$P$G"],["nl"],
        ["out","LH SMARTDRV.EXE 2048"],["nl"],
        ["out","LH MSCDEX.EXE /D:MSCD001 /L:E"],["nl"],
        ["out","WIN"],["nl"],
      ]
    },
    {
      id: "put",
      cmd: "readex put disk.img patch.txt /SYSTEM/PATCH.TXT --txn fix17",
      desc: "Stage a write into an overlay session",
      output: [
        ["prompt","$ "],["cmd","readex put disk.img patch.txt /SYSTEM/PATCH.TXT --txn fix17"],["nl"],
        ["dim","Opening session fix17 (new)…"],["nl"],
        ["ok","[txn] "],["out","staged write   /SYSTEM/PATCH.TXT  (4,096 bytes)"],["nl"],
        ["dim","  sectors dirtied: 8"],["nl"],
        ["dim","  generation: 0 → 1"],["nl"],
        ["nl"],
        ["prompt","$ "],["cmd","readex commit fix17 --mode export --output patched.img"],["nl"],
        ["ok","[txn] "],["out","exporting overlay → patched.img"],["nl"],
        ["ok","[txn] "],["out","committed 1 session, 8 sectors, 1 file"],["nl"],
      ]
    },
    {
      id: "mount",
      cmd: "readex mount disk.img /mnt/disk",
      desc: "Project the guest FS into your host",
      output: [
        ["prompt","$ "],["cmd","readex mount disk.img /mnt/disk"],["nl"],
        ["out","Mounted 1 region from disk.img"],["nl"],
        ["dim","/mnt/disk  whole-disk   FAT   RW   64 KiB   LBA 0-127"],["nl"],
        ["ok","Mounted 1 volume in 0.0s."],["nl"],
        ["nl"],
        ["prompt","$ "],["cmd","cp -r /mnt/disk/. ~/recovery/"],["nl"],
        ["prompt","$ "],["cmd","readex unmount /mnt/disk"],["nl"],
        ["ok","Unmounted /mnt/disk"],["nl"],
      ]
    },
    {
      id: "check",
      cmd: "readex check disk.img --rescue-log dd.map",
      desc: "Consistency check, optionally with ddrescue mapfile",
      output: [
        ["prompt","$ "],["cmd","readex check disk.img --rescue-log dd.map"],["nl"],
        ["out","Checking fat on disk.img"],["nl"],
        ["dim","Rescue log: 14 ranges, 2,148 bad sectors"],["nl"],
        ["warn","[FAT_LOST_CHAIN]   /SYSTEM/CORRUPT.DAT — cluster 2104 → 0"],["nl"],
        ["warn","[FAT_RESCUE_HIT]   /DATA/MAIL.PST — 4 bad sectors in extent 0"],["nl"],
        ["dim","2 anomalies, exit=1"],["nl"],
      ]
    },
    {
      id: "fix",
      cmd: "readex fix disk.img",
      desc: "Auto-repair (full FAT; replica-only EFS)",
      output: [
        ["prompt","$ "],["cmd","readex fix disk.img"],["nl"],
        ["out","Checking fat on disk.img"],["nl"],
        ["warn","[FAT_LOST_CHAIN]   /DATA/HOLE.DAT → orphan chain at 4108"],["nl"],
        ["ok","[FAT_FIX]"],["out","          truncating /DATA/HOLE.DAT to 4 KiB"],["nl"],
        ["ok","[FAT_FIX]"],["out","          rewriting FAT mirror"],["nl"],
        ["ok","Repaired 1 anomaly, image left in-place."],["nl"],
      ]
    },
    {
      id: "undelete",
      cmd: "readex undelete disk.img --output ./recovered",
      desc: "List, then recover, deleted files",
      output: [
        ["prompt","$ "],["cmd","readex undelete disk.img --output ./recovered"],["nl"],
        ["out","Scanning fat on disk.img for deleted entries…"],["nl"],
        ["dim","  /OLDDOCS/REPORT~1.DOC   18,432 bytes  recoverable"],["nl"],
        ["dim","  /OLDDOCS/INVOICE.XLS    12,288 bytes  partial (2 lost clusters)"],["nl"],
        ["dim","  /TEMP/~$DRAFT.TMP        2,048 bytes  recoverable"],["nl"],
        ["ok","Recovered 3 files → ./recovered/  (2 full, 1 partial)"],["nl"],
      ]
    },
  ],

  txnStages: [
    {
      key: "clean",
      name: "Clean",
      blurb: "Session opened. No mutations yet. Overlay block device tracks zero dirty sectors. The .txn session file holds the lock; readers and writers from other processes are gated against this entry.",
      log: [
        ["stamp","[00.000]"], ["text"," session opened: "], ["ev-good","fix17"],
        ["nl"],
        ["stamp","[00.001]"], ["text"," device lock acquired ("], ["ev-good","exclusive"], ["text",")"],
        ["nl"],
        ["stamp","[00.002]"], ["text"," dirty sectors: 0   checkpoints: 0"],
      ]
    },
    {
      key: "dirty",
      name: "Dirty",
      blurb: "First mutation staged. The overlay block device now owns a sparse map of dirty sectors keyed by LBA — the underlying image is untouched. Every read on a dirty LBA returns the staged bytes; clean LBAs fall through to disk.",
      log: [
        ["stamp","[00.000]"], ["text"," session opened: "], ["ev-good","fix17"], ["nl"],
        ["stamp","[00.012]"], ["text"," put /SYSTEM/PATCH.TXT (4096 bytes)"], ["nl"],
        ["stamp","[00.013]"], ["ev-warn"," ↳ "], ["text","staged: dir entry (1 sector) + data (8 sectors)"], ["nl"],
        ["stamp","[00.014]"], ["text"," dirty sectors: "], ["ev-warn","9"], ["text","   generation: 0 → 1"],
      ]
    },
    {
      key: "checkpoint",
      name: "Checkpointed",
      blurb: "Named savepoint persisted. The dirty-sector map is serialized into the .txn file with a checkpoint label. Further mutations can be reverted back to this point; the checkpoint chain is the unit of audit.",
      log: [
        ["stamp","[00.014]"], ["text"," dirty sectors: 9"], ["nl"],
        ["stamp","[00.020]"], ["text"," checkpoint label: "], ["ev-good","\"before risky change\""], ["nl"],
        ["stamp","[00.021]"], ["text"," .txn serialized ("], ["ev-good","4.6 KiB"], ["text",")"], ["nl"],
        ["stamp","[00.030]"], ["text"," delete /OLD.TXT"], ["nl"],
        ["stamp","[00.031]"], ["ev-warn"," ↳ "], ["text","staged: dir entry mark-deleted (1 sector)"], ["nl"],
        ["stamp","[00.032]"], ["text"," dirty sectors: 10   chain depth: 2"],
      ]
    },
    {
      key: "commit",
      name: "Committed",
      blurb: "Final transition. Three commit modes: export writes the merged overlay to a new file, in-place flushes dirty sectors to the original image, replace swaps the source with the merged result (via a sentinel-lock-protected rename). The session file is removed under lock; the writer-lease drops last.",
      log: [
        ["stamp","[00.040]"], ["text"," commit --mode "], ["ev-good","export"], ["nl"],
        ["stamp","[00.041]"], ["text"," sentinel lock acquired (replace-window safe)"], ["nl"],
        ["stamp","[00.060]"], ["text"," merging overlay → patched.img"], ["nl"],
        ["stamp","[00.180]"], ["text"," 4096/4096 sectors written"], ["nl"],
        ["stamp","[00.181]"], ["ev-good"," ✓ "], ["text","committed: 1 file, 8 data + 2 metadata sectors"], ["nl"],
        ["stamp","[00.182]"], ["text"," .txn removed; locks released"],
      ]
    }
  ],

  // 69 fuzz targets, grouped
  fuzzTargets: [
    // parsers (superblock, layout, structural)
    { n: "mbr_partition_parse", g: "parse" },
    { n: "gpt_layout_parse", g: "parse" },
    { n: "apm_layout_parse", g: "parse" },
    { n: "bsd_disklabel_parse", g: "parse" },
    { n: "sgi_header_parse", g: "parse" },
    { n: "sun_vtoc_parse", g: "parse" },
    { n: "aix_lvm_parse", g: "parse" },
    { n: "hpux_lvm_parse", g: "parse" },
    { n: "mxdisk_parse", g: "parse" },
    { n: "cue_parse", g: "parse" },
    { n: "rescue_log_parse", g: "parse" },
    { n: "fat_boot_parse", g: "parse" },
    { n: "aix_jfs1_superblock_parse", g: "parse" },
    { n: "cvf_superblock_parse", g: "parse" },
    { n: "stacker_superblock_parse", g: "parse" },
    { n: "ntfs_record_decode", g: "parse" },
    { n: "ntfs_runlist_decode", g: "parse" },
    { n: "ods2_header_decode", g: "parse" },

    // directory decoders
    { n: "fat_directory_decode", g: "dir" },
    { n: "ntfs_directory_decode", g: "dir" },
    { n: "ext2_directory_decode", g: "dir" },
    { n: "ext4_directory_decode", g: "dir" },
    { n: "xfs_directory_decode", g: "dir" },
    { n: "ufs_directory_decode", g: "dir" },
    { n: "ods2_directory_decode", g: "dir" },
    { n: "hfs_directory_decode", g: "dir" },
    { n: "hpfs_directory_decode", g: "dir" },
    { n: "hpux_hfs_directory_decode", g: "dir" },
    { n: "aix_jfs1_directory_decode", g: "dir" },
    { n: "iso9660_directory_decode", g: "dir" },
    { n: "cpm_directory_decode", g: "dir" },
    { n: "rt11_directory_decode", g: "dir" },
    { n: "adfs_directory_decode", g: "dir" },
    { n: "acorn_dfs_directory_decode", g: "dir" },
    { n: "efs_directory_decode", g: "dir" },
    { n: "fat_lookup", g: "dir" },
    { n: "ext2_indirect_read", g: "dir" },
    { n: "ufs_indirect_read", g: "dir" },

    // mutation sequences
    { n: "fat_mutation_sequence", g: "mut" },
    { n: "fat32_mutation_sequence", g: "mut" },
    { n: "fat_mutation_interleaved", g: "mut" },
    { n: "fat_mutation_common", g: "mut" },
    { n: "ntfs_mutation_sequence", g: "mut" },
    { n: "ext2_mutation_sequence", g: "mut" },
    { n: "ext4_mutation_sequence", g: "mut" },
    { n: "ext4_mutation_interleaved", g: "mut" },
    { n: "xfs_mutation_sequence", g: "mut" },
    { n: "ufs_mutation_sequence", g: "mut" },
    { n: "ods2_mutation_sequence", g: "mut" },
    { n: "hfs_mutation_sequence", g: "mut" },
    { n: "hpfs_mutation_sequence", g: "mut" },
    { n: "hpux_hfs_mutation_sequence", g: "mut" },
    { n: "aix_jfs1_mutation_sequence", g: "mut" },
    { n: "iso9660_mutation_sequence", g: "mut" },
    { n: "cpm_mutation_sequence", g: "mut" },
    { n: "rt11_mutation_sequence", g: "mut" },
    { n: "adfs_mutation_sequence", g: "mut" },
    { n: "acorn_dfs_mutation_sequence", g: "mut" },
    { n: "efs_mutation_sequence", g: "mut" },
    { n: "txn_overlay_operations", g: "mut" },
    { n: "txn_commit_equivalence", g: "mut" },
    { n: "session_file_deserialize", g: "mut" },

    // compression (CVF + Stacker)
    { n: "cvf_compress", g: "cmp" },
    { n: "cvf_decompress", g: "cmp" },
    { n: "cvf_mount_and_read", g: "cmp" },
    { n: "stacker_compress", g: "cmp" },
    { n: "stacker_decompress", g: "cmp" },
    { n: "stacker_mount_and_read", g: "cmp" },

    // other
    { n: "detect_and_inspect", g: "other" },
    { n: "mount_and_read", g: "other" },
    { n: "ext2_check_consistency", g: "other" },
    { n: "fat_check_consistency", g: "other" },
    { n: "ntfs_check_consistency", g: "other" },
    { n: "vxfs_detect", g: "other" },
    { n: "vxfs_mount", g: "other" },
    { n: "recover_from_journal_replay", g: "other" },
    { n: "image_builders", g: "other" },
  ],

  corpusFindings: [
    { id: "C1", issue: "CVF JM encoder emits sync marker at non-aligned position",
      fix: "MAX_OFFSET reduced from 4415 → 4414 to dodge bit-identical collision with the 0x113F sync marker. 100K-iter fuzz validation; HLD + workstream close-out.",
      status: "Fixed" },
    { id: "C2", issue: "Stacker SD-3 decoder warned instead of erroring on XOR-trailer mismatch",
      fix: "Decoder now returns Err(Corruption); encoder emits explicit 9-bit 0x180 EOS before the byte-align so the trailer can't mis-frame.",
      status: "Fixed" },
    { id: "D1", issue: "Acorn DFS catalogue validation too strict — 40/47 corpus images rejected",
      fix: "Relaxed predicate after two commits — 7/47 → 47/47 DFS images now passing.",
      status: "Fixed" },
    { id: "D3", issue: "HFS B-tree node size mismatch on a real 1989 floppy",
      fix: "Five layers of Apple-incompatible on-disk layouts corrected in one commit.",
      status: "Fixed" },
    { id: "D4", issue: "ODS-2 CD images: LBN vs 2048-byte sector confusion",
      fix: "FFBY=0 DEC-convention fix landed; real VMS CD image now detects at High confidence.",
      status: "Fixed" },
    { id: "Q2", issue: "CP/M Kaypro DPB profile missing — image refused to mount",
      fix: "kaypro_ii_dsdd profile added to the built-in DPB list.",
      status: "Fixed" },
    { id: "M1", issue: "Per-mount Linux signal routing collapsed the daemon",
      fix: "check_unmount_signal_files now returns Option<MountId>; per-mount stop queued without setting state.shutting_down.",
      status: "Fixed" },
    { id: "W1", issue: "ODS-2 VaxHaven image isn't sector-aligned (224 trailing bytes)",
      fix: "Treated as corrupt extraction artifact — won't fix.",
      status: "Won't fix" }
  ],
};

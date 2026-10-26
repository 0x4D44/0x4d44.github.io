// jail.c - minimal "no fork, read-only filesystem" launcher. A demonstration, not a profile.
// Fails CLOSED: if Landlock or seccomp cannot be installed, the program is not run.
// Build: gcc -O2 -Wall -o jail jail.c      Run: ./jail /bin/echo hello
#define _GNU_SOURCE
#include <errno.h>
#include <fcntl.h>
#include <sched.h>
#include <linux/audit.h>
#include <linux/filter.h>
#include <linux/landlock.h>
#include <linux/seccomp.h>
#include <stddef.h>
#include <stdio.h>
#include <stdlib.h>
#include <sys/prctl.h>
#include <sys/resource.h>
#include <sys/syscall.h>
#include <unistd.h>

#ifndef AUDIT_ARCH_X86_64
#define AUDIT_ARCH_X86_64 0xC000003E
#endif

static void die(const char *m) { perror(m); exit(1); }

/* ---- Landlock: read+exec under /usr /bin /lib /lib64 /etc, nothing else ---- */
static int landlock(void) {
    struct landlock_ruleset_attr ra = { 0 };
    int abi = syscall(SYS_landlock_create_ruleset, NULL, 0, LANDLOCK_CREATE_RULESET_VERSION);
    if (abi < 1) { fprintf(stderr, "landlock unavailable (%d)\n", abi); return -1; }
    __u64 ro = LANDLOCK_ACCESS_FS_EXECUTE | LANDLOCK_ACCESS_FS_READ_FILE | LANDLOCK_ACCESS_FS_READ_DIR;
    __u64 all = ro | LANDLOCK_ACCESS_FS_WRITE_FILE | LANDLOCK_ACCESS_FS_REMOVE_DIR |
        LANDLOCK_ACCESS_FS_REMOVE_FILE | LANDLOCK_ACCESS_FS_MAKE_CHAR | LANDLOCK_ACCESS_FS_MAKE_DIR |
        LANDLOCK_ACCESS_FS_MAKE_REG | LANDLOCK_ACCESS_FS_MAKE_SOCK | LANDLOCK_ACCESS_FS_MAKE_FIFO |
        LANDLOCK_ACCESS_FS_MAKE_BLOCK | LANDLOCK_ACCESS_FS_MAKE_SYM;
#ifdef LANDLOCK_ACCESS_FS_REFER
    if (abi >= 2) all |= LANDLOCK_ACCESS_FS_REFER;
#endif
#ifdef LANDLOCK_ACCESS_FS_TRUNCATE
    if (abi >= 3) all |= LANDLOCK_ACCESS_FS_TRUNCATE;
#endif
    ra.handled_access_fs = all;             /* handle everything => deny everything by default */
#ifdef LANDLOCK_ACCESS_NET_CONNECT_TCP
    /* ABI 4+: handle TCP bind/connect and add no rules => no TCP at all. */
    if (abi >= 4) ra.handled_access_net = LANDLOCK_ACCESS_NET_BIND_TCP | LANDLOCK_ACCESS_NET_CONNECT_TCP;
#endif
    size_t sz = sizeof ra;
    if (abi < 4) sz = offsetof(struct landlock_ruleset_attr, handled_access_fs) + sizeof ra.handled_access_fs;
    int rs = syscall(SYS_landlock_create_ruleset, &ra, sz, 0);
    if (rs < 0) die("landlock_create_ruleset");
    /* /etc is granted wholesale for the demo; a real profile lists single files. */
    const char *dirs[] = { "/usr", "/bin", "/lib", "/lib64", "/etc" };
    for (unsigned i = 0; i < sizeof dirs / sizeof *dirs; i++) {
        struct landlock_path_beneath_attr pb = { .allowed_access = ro };
        pb.parent_fd = open(dirs[i], O_PATH | O_CLOEXEC);
        if (pb.parent_fd < 0) continue;     /* path absent on this distro: skip */
        if (syscall(SYS_landlock_add_rule, rs, LANDLOCK_RULE_PATH_BENEATH, &pb, 0)) die("add_rule");
        close(pb.parent_fd);
    }
    if (syscall(SYS_landlock_restrict_self, rs, 0)) die("landlock_restrict_self");
    close(rs);
    return 0;
}

/* ---- seccomp: arch check, then DENY the process-creating calls ----------- */
#define OFF(f) offsetof(struct seccomp_data, f)
static void seccomp_nofork(void) {
    struct sock_filter f[] = {
        BPF_STMT(BPF_LD | BPF_W | BPF_ABS, OFF(arch)),
        BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, AUDIT_ARCH_X86_64, 1, 0),
        BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_KILL_PROCESS),          /* wrong ABI */
        BPF_STMT(BPF_LD | BPF_W | BPF_ABS, OFF(nr)),
        BPF_JUMP(BPF_JMP | BPF_JGE | BPF_K, 0x40000000, 0, 1),        /* x32 bit set */
        BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_KILL_PROCESS),
        BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, SYS_fork, 0, 1),
        BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_ERRNO | EPERM),
        BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, SYS_vfork, 0, 1),
        BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_ERRNO | EPERM),
        BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, SYS_clone3, 0, 1),        /* args are in memory: cannot inspect */
        BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_ERRNO | ENOSYS),        /* ENOSYS => libc falls back to clone */
        BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, SYS_clone, 0, 3),
        BPF_STMT(BPF_LD | BPF_W | BPF_ABS, OFF(args[0])),             /* low 32 bits of flags */
        BPF_JUMP(BPF_JMP | BPF_JSET | BPF_K, CLONE_THREAD, 1, 0),     /* thread: allow */
        BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_ERRNO | EPERM),
        BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_ALLOW),
    };
    struct sock_fprog p = { .len = sizeof f / sizeof *f, .filter = f };
    if (syscall(SYS_seccomp, SECCOMP_SET_MODE_FILTER, SECCOMP_FILTER_FLAG_TSYNC, &p)) die("seccomp");
}

int main(int argc, char **argv) {
    if (argc < 2) { fprintf(stderr, "usage: %s prog [args]\n", argv[0]); return 2; }
    struct rlimit nofile = { 64, 64 }, core = { 0, 0 };
    if (setrlimit(RLIMIT_NOFILE, &nofile) || setrlimit(RLIMIT_CORE, &core)) die("setrlimit");
    /* Close every inherited descriptor above stderr: Landlock does not revoke fds
       that are already open, so a leaked directory fd would be a hole in the fence. */
    if (syscall(SYS_close_range, 3, ~0U, 0)) die("close_range");
    if (prctl(PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0)) die("no_new_privs");
    if (landlock() < 0) return 1;           /* fail closed */
    seccomp_nofork();                       /* dies on failure */
    /* Note: /proc and /dev are not granted, so the child cannot read /proc/self either. */
    execv(argv[1], argv + 1);               /* exec is still allowed: it replaces, not creates */
    die("execv");
}

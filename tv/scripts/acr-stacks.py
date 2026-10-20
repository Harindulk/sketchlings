#!/usr/bin/env python3
"""Native stacks of every thread in a Vega ACR (crash/ANR report), from the core dump embedded in it.

The ACR's own <minidump_stackwalk> only unwinds the crashed thread; this walks every thread's frame-pointer
chain in <coredump_lz4_base64> and names frames with the exported symbols of the device's libraries.

  vega device copy-logs -a SYSTEM_TOMBSTONE/acr --dir acr/
  adb -s emulator-5554 pull /usr/lib/libkeplerscript-4.so.4 libs/   # + libasync.so.0, libframework-thread-monitor.so.0,
                                                                     #   libreact-native-0.83.so.0.83, /lib/libc.so.6 ...
  python3 -I tv/scripts/acr-stacks.py acr/<file>.acr libs/
Needs the `lz4` CLI (brew install lz4) and Xcode's llvm-objdump. Names are the nearest exported symbol, so a frame
inside a static function shows its exported neighbour.
"""
import base64, bisect, os, re, struct, subprocess, sys

acr_path, libdir = sys.argv[1], sys.argv[2]
txt = open(acr_path, errors='replace').read()
blob = re.search(r'<coredump_lz4_base64>\s*begin-base64[^\n]*\n(.*?)\n====\s*</coredump_lz4_base64>', txt, re.S)
if not blob:
    sys.exit('no core dump in this ACR')
core = subprocess.run(['lz4', '-dc'], input=base64.b64decode(blob.group(1)), capture_output=True, check=True).stdout

# where each library was loaded (minidump module list)
ranges = []
for m in re.finditer(r'base_of_image\s+=\s+(0x[0-9a-f]+)\s+size_of_image\s+=\s+(0x[0-9a-f]+).*?\(code_file\)\s+=\s+"([^"]+)"', txt, re.S):
    ranges.append((int(m.group(1), 16), int(m.group(1), 16) + int(m.group(2), 16), os.path.basename(m.group(3))))
base = {}
for lo, _, name in ranges:
    base[name] = min(lo, base.get(name, lo))

symcache = {}
def symbols(name):
    if name not in symcache:
        path, syms = os.path.join(libdir, name), []
        if os.path.exists(path):
            out = subprocess.run(['xcrun', 'llvm-objdump', '-T', '-C', path], capture_output=True, text=True).stdout
            for line in out.splitlines():
                if '.text' in line:
                    rest = line[line.find('.text') + 5:].split(None, 1)
                    syms.append((int(line.split()[0], 16), rest[1].strip() if len(rest) > 1 else ''))
        symcache[name] = sorted(syms)
    return symcache[name]

def name_of(addr):
    for lo, hi, name in ranges:
        if lo <= addr < hi:
            off, syms = addr - base[name], symbols(name)
            i = bisect.bisect_right([a for a, _ in syms], off) - 1
            return f'{name}+{off:#x}' + (f'  {syms[i][1][:110]}+{off - syms[i][0]:#x}' if i >= 0 else '')
    return hex(addr)

# ELF core: PT_LOAD = memory, PT_NOTE/NT_PRSTATUS = one register set per thread
phoff, = struct.unpack_from('<Q', core, 0x20)
phnum, = struct.unpack_from('<H', core, 0x38)
loads, notes = [], []
for i in range(phnum):
    ptype, _, off, vaddr, _, filesz, _, _ = struct.unpack_from('<IIQQQQQQ', core, phoff + i * 56)
    if ptype == 1 and filesz:
        loads.append((vaddr, vaddr + filesz, off))
    elif ptype == 4:
        notes.append((off, filesz))

def read64(addr):
    for lo, hi, off in loads:
        if lo <= addr and addr + 8 <= hi:
            return struct.unpack_from('<Q', core, off + addr - lo)[0]
    return None

js = re.search(r'JSThread thread ID: (\d+)', txt)
print(f"{os.path.basename(acr_path)}: {re.search(r'CrashReason:(.*)', txt).group(1)}, "
      f"{(re.search(r'LCM_ANR_REASON: (.*)', txt) or re.search(r'()', '')).group(1)}, JS thread tid {js.group(1) if js else '?'}")
for off, size in notes:
    pos = off
    while pos < off + size:
        namesz, descsz, ntype = struct.unpack_from('<III', core, pos)
        pos += 12 + ((namesz + 3) & ~3)
        desc = core[pos:pos + descsz]
        pos += (descsz + 3) & ~3
        if ntype != 1:  # NT_PRSTATUS
            continue
        tid, = struct.unpack_from('<I', desc, 32)
        regs = struct.unpack_from('<34Q', desc, 112)  # x0..x30, sp, pc, pstate
        print(f'\n--- tid {tid}\n    {name_of(regs[32])}\n    {name_of(regs[30])}')
        fp = regs[29]
        for _ in range(30):
            nxt, ret = read64(fp), read64(fp + 8)
            if not fp or ret is None:
                break
            print('    ' + name_of(ret))
            if nxt is None or nxt <= fp:
                break
            fp = nxt

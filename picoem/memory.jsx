// memory.jsx — RP2350 address space
const MemorySection = () => {
  const regions = [
    { addr: "0x0000_0000", end:"0x0000_7FFF", name: "BOOTROM",       sz: "32 KB",
      tags: ["secure", "untimed"],
      desc: "The real Raspberry Pi RP2350 bootrom, checked in as roms/rp2350/bootrom-combined.bin. The emulator boots this for real — through clock setup, QMI init, RCP canary ops, SAU verification, and the secure→non-secure transition (BXNS at PC=0x7EA4)." },
    { addr: "0x1000_0000", end:"0x13FF_FFFF", name: "XIP FLASH",     sz: "≤ 64 MB",
      tags: ["execute-in-place"],
      desc: "External NOR flash, read through the QMI. Firmware images written with load_flash() land here. Reads past the loaded image return 0 today; real silicon mirrors every 2 MB inside each 16 MB alias (tracked in tech_debt.md)." },
    { addr: "0x2000_0000", end:"0x2007_FFFF", name: "SRAM (striped)", sz: "456 KB · 8 banks",
      tags: ["AHB5", "10 banks total"],
      desc: "Eight 32 KB banks striped at 4-byte granularity for parallel access. The bus reports same-bank contention but the production RP2350 path treats it as virtual; the silicon characterisation lives in bank_conflict_test_rp2350 for reference." },
    { addr: "0x2008_0000", end:"0x2008_0FFF", name: "SRAM scratch X", sz: "4 KB",
      tags: ["non-striped", "core-0"],
      desc: "Non-striped scratchpad, typically reserved for core 0's stack. Lives outside the striped banks so per-core stacks don't fight over the same physical bank." },
    { addr: "0x2008_1000", end:"0x2008_1FFF", name: "SRAM scratch Y", sz: "4 KB",
      tags: ["non-striped", "core-1"],
      desc: "Second non-striped scratchpad. Conventionally used for core 1's stack." },
    { addr: "0x4000_0000", end:"0x4006_FFFF", name: "APB peripherals", sz: "—",
      tags: ["3R / 4W cycle"],
      desc: "TIMER0/1, TICKS, POWMAN, UART0/1, SPI0/1, I²C0/1, PWM, ADC, WATCHDOG, OTP, TRNG, SHA256, PSM, IO_BANK0, PADS_BANK0, CoreSight. The APB bridge contributes 3 read / 4 write cycles on top of the address-decode latency. Inert APB holes are stubbed in inert.rs and bus-fault unmodelled MMIO." },
    { addr: "0x5000_0000", end:"0x5000_3FFF", name: "DMA",           sz: "16 KB",
      tags: ["16 channels", "bus master"],
      desc: "16-channel DMA controller with CTRL_TRIG / AL1 / AL2 / AL3 register aliases, RING_SIZE+RING_SEL circular buffers, CHAIN_TO chained triggering, CH_ABORT, fixed-priority arbitration. Full DREQ matrix. DMA-aperture self-accesses route through the live Dma to fix a borrow-trap bug that was silently dropping DMA-to-DMA writes (CHANGELOG 2026-05-07)." },
    { addr: "0x5020_0000", end:"0x5020_2FFF", name: "PIO0 / PIO1 / PIO2", sz: "12 SMs",
      tags: ["state machines", "GPIOBASE"],
      desc: "Three PIO blocks of four state machines each. Side-set and pin direction are independent (the PIO pad_oe leak fix landed via the silicon oracle). GPIOBASE selects between low (0..31) and high (16..47) pin banks per state machine." },
    { addr: "0xD000_0000", end:"0xD000_0FFF", name: "SIO",           sz: "4 KB",
      tags: ["single-cycle"],
      desc: "Single-cycle IO block: GPIO read/write, 32 spinlocks, inter-core FIFOs, interpolators, the coprocessor interface for DCP/RCP, and (on RP2040) the hardware divider." },
    { addr: "0xE000_0000", end:"0xE00F_FFFF", name: "PPB",           sz: "1 MB",
      tags: ["per-core", "secure"],
      desc: "Private Peripheral Bus: NVIC, SCB, SysTick, FPU control (CPACR, FPCCR), DWT, ITM, debug control. Per-core view; the Secure / Non-Secure aliases both write through where applicable. Halfword reads of CoreSight trace are routed through CortexM33::bus_read16, not Bus::read16 directly." },
  ];

  const [sel, setSel] = React.useState(0);
  const r = regions[sel];

  return (
    <section id="memory">
      <div className="container">
        <div className="eyebrow">§04 · address space</div>
        <h2>The RP2350 memory map — annotated.</h2>
        <p className="lead">
          Every address in the SoC is modelled here. ROM, SRAM banks, XIP flash, the APB
          peripheral block, DMA, PIO, the single-cycle SIO, and the per-core PPB. Click a region
          for the implementation notes.
        </p>

        <div className="memmap">
          <div className="memcol">
            <div className="head">address range — RP2350 / RP2354</div>
            {regions.map((rg, i) => (
              <div
                key={i}
                className={"memrow " + (i === sel ? "active" : "")}
                onClick={() => setSel(i)}
              >
                <div className="addr">{rg.addr}</div>
                <div className="name">{rg.name}</div>
                <div className="sz">{rg.sz}</div>
              </div>
            ))}
          </div>

          <div className="memdetail">
            <div className="addrline mono">{r.addr} – {r.end}</div>
            <h4>{r.name} <span className="dim mono text-xs" style={{marginLeft:"10px"}}>{r.sz}</span></h4>
            <p>{r.desc}</p>
            <div>
              {r.tags.map((t) => <span key={t} className="badge">{t}</span>)}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

window.MemorySection = MemorySection;

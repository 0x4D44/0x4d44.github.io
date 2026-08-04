from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
STYLES = ROOT / "darwin-machine/styles.css"

old = ".text-button, .link-button { border: 0; background: transparent; padding: 0; color: var(--acid); cursor: pointer; font-weight: 750; }"
new = """.text-button, .link-button {
  display: inline-flex;
  min-height: 2.25rem;
  align-items: center;
  border: 0;
  background: transparent;
  padding: .25rem 0;
  color: var(--acid);
  cursor: pointer;
  font-weight: 750;
}"""

source = STYLES.read_text(encoding="utf-8")
old_count = source.count(old)
new_count = source.count(new)
if old_count == 1:
    STYLES.write_text(source.replace(old, new), encoding="utf-8")
    print("Applied accessible text-control hit areas.")
elif old_count == 0 and new_count == 1:
    print("Accessible text-control hit areas already materialised.")
else:
    raise SystemExit(
        f"Expected one text-button rule or its corrected form; old={old_count} new={new_count}"
    )

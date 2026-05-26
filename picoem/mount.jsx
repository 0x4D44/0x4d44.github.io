// mount.jsx — render everything
const roots = [
  ["hero-root",      window.Hero],
  ["chips-root",     window.ChipsSection],
  ["workspace-root", window.WorkspaceSection],
  ["how-root",       window.HowSection],
  ["memory-root",    window.MemorySection],
  ["testing-root",   window.TestingSection],
  ["numbers-root",   window.NumbersSection],
  ["using-root",     window.UsingSection],
  ["community-root", window.CommunitySection],
];

for (const [id, Comp] of roots) {
  const el = document.getElementById(id);
  if (el && Comp) {
    ReactDOM.createRoot(el).render(<Comp />);
  } else {
    console.warn("missing mount", id, Comp);
  }
}

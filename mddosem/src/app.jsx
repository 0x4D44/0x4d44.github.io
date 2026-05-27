// App root
function App() {
  return (
    <React.Fragment>
      <Nav />
      <Hero />
      <PurposeSection />
      <ArchitectureSection />
      <HardwareSection />
      <UsageSection />
      <TestingSection />
      <FuzzingSection />
      <CommunitySection />
      <Footer />
    </React.Fragment>
  );
}

const root = ReactDOM.createRoot(document.getElementById("app"));
root.render(<App />);

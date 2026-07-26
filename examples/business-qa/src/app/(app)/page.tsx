const code = `curl http://localhost:3000/api/agents/qa-analyst \\
  -H "Authorization: Bearer $FROGBOT_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"prompt":"Assess the readiness of release 1.4.0."}'`;

export default function HomePage() {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', margin: '0 auto', maxWidth: 760, padding: '64px 24px' }}>
      <p style={{ fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>Business QA showcase</p>
      <h1 style={{ fontSize: 48, lineHeight: 1.05 }}>Release readiness, grounded in your operating systems.</h1>
      <p style={{ fontSize: 20, lineHeight: 1.6 }}>
        Review evidence with the QA analyst, then coordinate approved changes with the release manager.
      </p>
      <p><a href="/admin">Open the admin panel</a></p>
      <pre style={{ background: '#111827', color: '#f9fafb', overflowX: 'auto', padding: 20 }}>{code}</pre>
    </main>
  );
}

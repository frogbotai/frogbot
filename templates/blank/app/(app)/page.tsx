export default function HomePage() {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '4rem 2rem', maxWidth: '40rem', margin: '0 auto' }}>
      <h1>FrogBot is running</h1>
      <p>
        Head to the <a href="/admin">admin panel</a> to create your first user, or talk to the default agent:
      </p>
      <pre style={{ background: '#f4f4f4', padding: '1rem', overflowX: 'auto' }}>
        {`curl -s http://localhost:3000/api/agents/assistant \\
  -H 'content-type: application/json' \\
  -d '{"prompt":"Hello!"}'`}
      </pre>
    </main>
  );
}

import { Button, Card, CardContent, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Sidebar, SidebarInset, SidebarProvider } from '@frogbotai/ui';
import { ThemeProvider } from '@frogbotai/ui/theme';

export default function HomePage() {
  return (
    <ThemeProvider mode="dark" theme={{ '--primary': 'oklch(0.7 0.2 40)' }}>
    <SidebarProvider>
      <Sidebar>Navigation</Sidebar>
      <SidebarInset style={{ fontFamily: 'system-ui, sans-serif', padding: '4rem 2rem', maxWidth: '40rem', margin: '0 auto' }}>
      <h1>FrogBot is running</h1>
      <Card><CardContent><Input aria-label="Message" /><Button>Send</Button></CardContent></Card>
      <Select defaultValue="one"><SelectTrigger aria-label="Choice"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="one">One</SelectItem></SelectContent></Select>
      <p>
        Head to the <a href="/admin">admin panel</a> to create your first user, or talk to the default agent:
      </p>
      <pre style={{ background: '#f4f4f4', padding: '1rem', overflowX: 'auto' }}>
        {`curl -s http://localhost:3000/api/agents/assistant \\
  -H 'content-type: application/json' \\
  -d '{"prompt":"Hello!"}'`}
      </pre>
      </SidebarInset>
    </SidebarProvider>
    </ThemeProvider>
  );
}

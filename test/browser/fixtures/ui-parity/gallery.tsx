import type { DynamicToolUIPart } from 'ai';
import { createRoot } from 'react-dom/client';

import { Composer } from '../../../../packages/ui/src/chat/composer/composer';
import { ComposerSelect } from '../../../../packages/ui/src/chat/composer-select';
import { LinkList } from '../../../../packages/ui/src/chat/link-list';
import { Markdown } from '../../../../packages/ui/src/chat/markdown';
import { ChatProvider } from '../../../../packages/ui/src/chat/provider';
import { ToolCard } from '../../../../packages/ui/src/chat/tool-card';
import { ToolPart } from '../../../../packages/ui/src/chat/tool-part';
import { ListIcon, PlusSignIcon } from '../../../../packages/ui/src/exports/icons';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Alert,
  AlertDescription,
  AlertTitle,
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Checkbox,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Dot,
  HorizontalSeparatorWithText,
  Input,
  Label,
  OptionPill,
  RadioGroup,
  RadioGroupItem,
  SearchInput,
  Separator,
  Shortcut,
  Skeleton,
  Slider,
  StatusIconWithText,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  TextWithIcon,
  Toggle,
} from '../../../../packages/ui/src/index';
import { AppSidebar } from '../../../../packages/ui/src/nav/AppSidebar';
import { NavItem } from '../../../../packages/ui/src/nav/NavItem';
import { NavSection } from '../../../../packages/ui/src/nav/NavSection';

const markdown = [
  '# Heading one',
  '## Heading two',
  'A paragraph with **bold**, a [link](https://example.com) and `code`.',
  '- one\n- two',
  '1. first\n2. second',
  '> quote',
  '| a | b |\n|---|---|\n| 1 | 2 |',
  '```ts\nconst x = 1;\n```',
  '---',
].join('\n\n');

const tool = (state: DynamicToolUIPart['state'], extra: object = {}) =>
  ({
    type: 'dynamic-tool',
    toolName: 'fetch_page',
    toolCallId: `call-${state}`,
    state,
    input: { url: 'https://example.com', limit: 3 },
    ...extra,
  }) as DynamicToolUIPart;

const noop = () => {};

function Sidebar({ open }: { open: boolean }) {
  return (
    <div className="fb-nav" style={{ height: 420, width: open ? 272 : 60 }}>
      <AppSidebar
        accountName="Ada Lovelace"
        accountPath="/account"
        currentPath="/providers"
        homePath="/"
        navItems={[
          { label: 'Chat', path: '/', icon: 'bubble-chat' },
          { label: 'Providers', path: '/providers', icon: 'key-round' },
        ]}
        onNavigate={noop}
        onToggle={noop}
        open={open}
        sections={
          <NavSection id="parity" title="Recents">
            <NavItem active label="Tree frogs" path="/chat/1" />
            <NavItem label="Pond survey" path="/chat/2" />
          </NavSection>
        }
        settingsPath="/settings"
      />
    </div>
  );
}

const adapter = { loadManifest: () => new Promise(() => undefined) } as never;

const favicon = (url: string) =>
  url.includes('frogs')
    ? `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="8" fill="green"/></svg>')}`
    : undefined;

const links = [
  { url: 'https://www.frogs.example/north-america', title: 'Frogs of North America' },
  {
    url: 'https://amphibians.example/tree-frogs',
    title: 'Tree frog care guide',
    snippet: 'Humidity, light and food for tree frogs kept at home.',
  },
];

const longTitle = 'A page title long enough to wrap onto several lines inside a narrow tool card';

const image = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="20"><rect width="400" height="20" fill="teal"/></svg>')}`;

function BareElements() {
  return (
    <section>
      <h1>Heading one</h1>
      <h3>Heading three</h3>
      <p>
        Text with <small>small</small>, H<sub>2</sub>O, x<sup>2</sup>,{' '}
        <abbr title="abbreviation">abbr</abbr>, <b>bold</b>, <strong>strong</strong>,{' '}
        <a href="#bare">a link</a>, <code>code</code>, <kbd>kbd</kbd> and <samp>samp</samp>.
      </p>
      <hr />
      <pre>preformatted</pre>
      <ul>
        <li>unordered</li>
      </ul>
      <ol>
        <li>ordered</li>
      </ol>
      <menu>
        <li>menu</li>
      </menu>
      <table>
        <tbody>
          <tr>
            <td>cell</td>
          </tr>
        </tbody>
      </table>
      <details open>
        <summary>Summary</summary>
        Details
      </details>
      <progress max={10} value={4} />
      <div style={{ width: 100 }}>
        <img alt="" src={image} />
      </div>
      <svg width="20" height="20" />
      <button className="parity-bare-button" type="button">
        Button
      </button>
      <input placeholder="Input" />
      <input type="checkbox" />
      <input type="file" />
      <input type="number" defaultValue={1} />
      <input type="search" defaultValue="search" />
      <textarea placeholder="Textarea" />
      <dialog open>Dialog</dialog>
    </section>
  );
}

function Gallery({ theme }: { theme: string }) {
  return (
    <div
      className="fb-theme"
      data-fb-ui=""
      data-theme={theme}
      id="g"
      style={{ padding: 16, background: 'var(--color-bg)' }}
    >
      <p className="fb-parity-hidden" hidden>
        Hidden
      </p>
      <section>
        <Button>Default</Button>
        <Button variant="destructive">Destructive</Button>
        <Button variant="outline">Outline</Button>
        <Button variant="secondary" size="sm">
          Secondary
        </Button>
        <Button variant="ghost">
          <ListIcon />
          Ghost
        </Button>
        <Button variant="ghost" size="icon" aria-label="Add">
          <PlusSignIcon />
        </Button>
        <Button variant="link">Link</Button>
        <Button size="lg" disabled>
          Large
        </Button>
      </section>
      <section>
        <Input placeholder="Input" />
        <Textarea placeholder="Textarea" />
        <SearchInput placeholder="Search" value="" onChange={noop} />
        <Label htmlFor="parity-check">Label</Label>
        <Checkbox id="parity-check" defaultChecked />
        <Switch defaultChecked />
        <Switch variant="square" size="sm" />
        <Toggle>Toggle</Toggle>
        <Toggle variant="outline" defaultPressed>
          Pressed
        </Toggle>
        <RadioGroup defaultValue="a">
          <RadioGroupItem value="a" aria-label="A" />
          <RadioGroupItem value="b" aria-label="B" />
        </RadioGroup>
        <Slider stops={['Low', 'Mid', 'High']} value={1} onValueChange={noop} />
      </section>
      <section>
        <Badge>Badge</Badge>
        <Badge variant="outline">Outline</Badge>
        <Badge variant="success">Success</Badge>
        <OptionPill color="blue">Blue</OptionPill>
        <Dot variant="primary" />
        <Shortcut shortcutKey="K" withCtrl />
        <Avatar>
          <AvatarFallback>FB</AvatarFallback>
        </Avatar>
        <Skeleton style={{ width: 80, height: 12 }} />
        <StatusIconWithText icon={ListIcon} text="Status" variant="success" />
        <TextWithIcon icon={<PlusSignIcon />} text="Text with icon" />
      </section>
      <section>
        <Separator />
        <HorizontalSeparatorWithText>or</HorizontalSeparatorWithText>
        <Alert>
          <AlertTitle>Title</AlertTitle>
          <AlertDescription>Description</AlertDescription>
        </Alert>
        <Alert variant="destructive">
          <AlertTitle>Failed</AlertTitle>
        </Alert>
        <Card>
          <CardHeader>
            <CardTitle>Card title</CardTitle>
            <CardDescription>Card description</CardDescription>
          </CardHeader>
          <CardContent>
            <p>Content</p>
          </CardContent>
          <CardFooter>
            <Button size="sm">Action</Button>
          </CardFooter>
        </Card>
        <Tabs defaultValue="one">
          <TabsList>
            <TabsTrigger value="one">One</TabsTrigger>
            <TabsTrigger value="two">Two</TabsTrigger>
          </TabsList>
          <TabsContent value="one">First tab</TabsContent>
        </Tabs>
        <Accordion type="single" defaultValue="open" collapsible>
          <AccordionItem value="open">
            <AccordionTrigger>Open item</AccordionTrigger>
            <AccordionContent>Accordion body</AccordionContent>
          </AccordionItem>
          <AccordionItem value="closed">
            <AccordionTrigger>Closed item</AccordionTrigger>
            <AccordionContent>Hidden body</AccordionContent>
          </AccordionItem>
        </Accordion>
        <Collapsible>
          <CollapsibleTrigger>Collapsible</CollapsibleTrigger>
          <CollapsibleContent>Collapsed body</CollapsibleContent>
        </Collapsible>
      </section>
      <section style={{ display: 'flex', gap: 16 }}>
        <Sidebar open />
        <Sidebar open={false} />
      </section>
      <section>
        <Markdown>{markdown}</Markdown>
      </section>
      <BareElements />
      <section>
        <ToolCard icon="cursor" status="done" title="Clicked “Submit”" />
        <ToolCard icon="cursor" status="error" title="Clicked “Submit”" subtitle="Element gone" />
        <ToolCard icon="keyboard" status="denied" title="Pressed Enter" />
        <ToolCard icon="browser" status="running" title="Navigating to" subtitle="frogs.example" />
        <ToolCard
          className="fb-parity-closed"
          icon="web"
          status="done"
          title="“tree frogs”"
          subtitle="2 results"
        >
          <LinkList items={links} />
        </ToolCard>
        <ToolCard defaultOpen icon="web" status="done" title="“tree frogs”" subtitle="2 results">
          <LinkList items={links} />
        </ToolCard>
        <div style={{ width: 280 }}>
          <ToolCard icon="web" status="done" title={longTitle} subtitle="frogs.example" />
        </div>
        <div dir="rtl">
          <ToolCard defaultOpen icon="web" status="done" title="ضفدع الشجرة" subtitle="نتيجتان">
            <LinkList items={[...links, { url: 'https://ar.example/x', title: 'ضفدع أخضر' }]} />
          </ToolCard>
        </div>
      </section>
      <section>
        <Composer
          onSubmit={noop}
          placeholder="Ask anything"
          submitContent="Send"
          stopContent="Stop"
          startSlot={
            <ComposerSelect
              value="build"
              options={[
                { value: 'build', label: 'Build', icon: 'wrench' },
                { value: 'plan', label: 'Plan', icon: 'check-list' },
              ]}
              onChange={noop}
            />
          }
        />
      </section>
      <section>
        <ToolPart part={tool('output-available', { output: 'ok' })} renderers={[]} />
        <ToolPart part={tool('input-available')} renderers={[]} />
        <ToolPart
          part={tool('output-error', { errorText: 'Network unreachable' })}
          renderers={[]}
        />
        <ToolPart
          part={tool('output-denied', { approval: { id: 'a', approved: false, reason: 'No' } })}
          renderers={[]}
        />
      </section>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <ChatProvider adapter={adapter} faviconUrl={favicon}>
    <Gallery theme={document.documentElement.dataset.galleryTheme ?? 'light'} />
  </ChatProvider>,
);

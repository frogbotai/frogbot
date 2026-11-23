import {
  ActivityFeed,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Chart,
  Fact,
  FactList,
  Media,
  Meter,
  PageHeader,
  PersonChip,
  ReportView,
  Stat,
  StatGrid,
  StatusBadge,
  Tabs,
  TabsList,
  TabsTrigger,
  Value,
} from '../../src/index.js';
import { hoursAgo, NOW, Section, thumbnails } from './parts.js';

const report = `## What goes with getting traction

8,261 Show HN posts since 2024. Median 2 points; **5.9%** reach 20 points, **2.1%** reach 100.

| Feature | Posts | Reach 20+ | Reach 100+ | Read |
| --- | ---: | ---: | ---: | --- |
| First person ("I built") | 745 | 2.7% | 2.0% | no clear difference |
| Has a number | 1,297 | 3.0% | 1.9% | no clear difference |
| Mentions AI or agents | 2,100 | 1.3% | 2.4% | fewer reach 20 |

### Posting hour (US Pacific)

- Posts at **6 to 9 AM** do best: 5.7% reach 20 points.
- Late evening posts do worst.

> Correlations, not causes. Rows under 30 posts are marked.`;

const activity = [
  {
    id: '1',
    actor: { name: 'Invoice agent', agent: true },
    action: 'read INV-2095 and matched it to Oak Ave',
    time: hoursAgo(0.4),
  },
  {
    id: '2',
    actor: { name: 'Invoice agent', agent: true },
    action: 'asked for approval',
    detail: 'Post INV-2095, $8,500.00, to Oak Ave? Over your $5,000 limit.',
    time: hoursAgo(0.3),
  },
  { id: '3', actor: { name: 'Jordan Reyes' }, action: 'approved the entry', time: hoursAgo(0.1) },
  {
    id: '4',
    actor: { name: 'Priya Natarajan' },
    action: 'changed the due date to Nov 25',
    time: hoursAgo(26),
  },
];

const deals = [
  {
    name: 'Maple St kitchen',
    owner: 'Jordan Reyes',
    stage: ['Won', 'success'],
    amount: 4120,
    score: 86,
    updated: hoursAgo(3),
  },
  {
    name: 'Oak Ave rewiring',
    owner: 'Priya Natarajan',
    stage: ['Needs approval', 'warning'],
    amount: 8500,
    score: 64,
    updated: hoursAgo(20),
  },
  {
    name: 'Birch Ct roof',
    owner: 'Jordan Reyes',
    stage: ['In review', 'info'],
    amount: 310,
    score: 41,
    updated: hoursAgo(52),
  },
  {
    name: 'Pine Rd deck',
    owner: 'Sam Ortiz',
    stage: ['Lost', 'danger'],
    amount: 6240,
    score: 18,
    updated: hoursAgo(200),
  },
  {
    name: 'Elm St bathroom',
    owner: 'Sam Ortiz',
    stage: ['Draft', 'neutral'],
    amount: 2875.5,
    score: 55,
    updated: hoursAgo(400),
  },
] as const;

export function ReportSection() {
  return (
    <Section
      description="Markdown the app wrote, rendered as a document instead of shown in a text box."
      id="report-view"
      title="ReportView"
    >
      <ReportView>{report}</ReportView>
    </Section>
  );
}

export function ActivitySection() {
  return (
    <Section
      description="A record's history: who did what and when. Agents get a green mark."
      id="activity-feed"
      title="ActivityFeed"
    >
      <div style={{ maxWidth: '32rem' }}>
        <ActivityFeed items={activity} now={NOW} />
      </div>
    </Section>
  );
}

export function ListCellsSection() {
  return (
    <Section
      description="The same primitives as list cells: title first, status as a badge, people as chips, numbers right-aligned, short dates."
      id="list-cells"
      title="In a list"
    >
      <table className="gallery__table">
        <thead>
          <tr>
            <th>Deal</th>
            <th>Stage</th>
            <th>Owner</th>
            <th className="gallery__num">Amount</th>
            <th>Fit</th>
            <th className="gallery__num">Updated</th>
          </tr>
        </thead>
        <tbody>
          {deals.map((deal) => (
            <tr key={deal.name}>
              <td style={{ fontWeight: 500 }}>{deal.name}</td>
              <td>
                <StatusBadge tone={deal.stage[1]}>{deal.stage[0]}</StatusBadge>
              </td>
              <td>
                <PersonChip name={deal.owner} />
              </td>
              <td className="gallery__num">
                <Value format="currency" value={deal.amount} />
              </td>
              <td>
                <Meter style={{ width: '5rem' }} value={deal.score} />
              </td>
              <td className="gallery__num" style={{ color: 'var(--color-text-secondary)' }}>
                <Value format="relative" now={NOW} value={deal.updated} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}

export function RecordSection() {
  return (
    <Section
      description="A record page put together from the primitives: header, key numbers, a chart, history, and a details panel."
      id="record-page"
      title="In a record page"
    >
      <PageHeader
        actions={
          <>
            <Button variant="outline">Deny</Button>
            <Button>Approve</Button>
          </>
        }
        after={
          <Tabs defaultValue="overview">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="files">Files</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>
          </Tabs>
        }
        description="Waiting for your approval since 9:42 AM"
        title="Oak Ave rewiring"
      />
      <div className="gallery__split">
        <div className="gallery__stack">
          <StatGrid bordered columns={3}>
            <Stat label="Amount" value={<Value format="currency" value={8500} />} />
            <Stat
              change={0.18}
              changeLabel="vs estimate"
              invert
              label="Cost so far"
              value={<Value format="currency" value={5310} />}
            />
            <Stat label="Margin" value={<Value format="percent" value={0.375} />} />
          </StatGrid>
          <Card>
            <CardHeader>
              <CardTitle>Hours logged</CardTitle>
            </CardHeader>
            <CardContent>
              <Chart
                height={160}
                labels={['W1', 'W2', 'W3', 'W4', 'W5', 'W6']}
                series={[{ name: 'Hours', values: [12, 18, 26, 22, 30, 16] }]}
                type="bar"
              />
            </CardContent>
          </Card>
          <ActivityFeed items={activity} now={NOW} />
        </div>
        <div className="gallery__stack">
          <Media alt="Site photo" ratio="4/3" src={thumbnails[1]} />
          <FactList>
            <Fact label="Stage">
              <StatusBadge tone="warning">Needs approval</StatusBadge>
            </Fact>
            <Fact label="Owner">
              <PersonChip name="Priya Natarajan" />
            </Fact>
            <Fact label="Start">
              <Value format="date" now={NOW} value={hoursAgo(600)} />
            </Fact>
            <Fact label="Due">
              <Value format="date" now={NOW} value={hoursAgo(-72)} />
            </Fact>
            <Fact label="Fit">
              <Meter style={{ width: '100%' }} value={64} />
            </Fact>
          </FactList>
        </div>
      </div>
    </Section>
  );
}

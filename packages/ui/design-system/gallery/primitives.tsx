import BuildingIcon from '../../src/icons/icons/BuildingIcon.js';
import FileIcon from '../../src/icons/icons/FileIcon.js';
import PeopleIcon from '../../src/icons/icons/PeopleIcon.js';
import {
  Badge,
  Button,
  Chart,
  CopyValue,
  EmptyState,
  Fact,
  FactList,
  Media,
  Meter,
  PageHeader,
  PersonChip,
  ReadMore,
  RecordChip,
  Sparkline,
  Stat,
  StatGrid,
  StatusBadge,
  Value,
} from '../../src/index.js';
import { hoursAgo, Labelled, NOW, Section, thumbnails } from './parts.js';

const months = ['Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov'];

export function ValueSection() {
  const rows: [string, Parameters<typeof Value>[0]][] = [
    ['number', { value: 36_577 }],
    ['compact', { value: 1_140_000, format: 'compact' }],
    ['currency', { value: 4120, format: 'currency' }],
    ['currency, cents', { value: 8500.5, format: 'currency' }],
    ['percent', { value: 0.427, format: 'percent' }],
    ['date', { value: hoursAgo(96), format: 'date', now: NOW }],
    ['date, last year', { value: '2025-03-14', format: 'date', now: NOW }],
    ['datetime', { value: hoursAgo(5), format: 'datetime', now: NOW }],
    ['relative', { value: hoursAgo(26), format: 'relative', now: NOW }],
    ['duration', { value: 62, format: 'duration' }],
    ['empty', { value: null }],
    ['empty, with dash', { value: null, empty: '—' }],
  ];

  return (
    <Section
      description="One number, amount, percent, date or duration, formatted the same way on every screen."
      id="value"
      title="Value"
    >
      <table className="gallery__table" style={{ maxWidth: '32rem' }}>
        <thead>
          <tr>
            <th>Format</th>
            <th className="gallery__num">Shows</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, props]) => (
            <tr key={label}>
              <td className="gallery__label">{label}</td>
              <td className="gallery__num">
                <Value {...props} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}

export function StatSection() {
  return (
    <Section
      description="A headline number with its label, change and recent trend. StatGrid lays several out evenly."
      id="stat"
      title="Stat and StatGrid"
    >
      <StatGrid bordered>
        <Stat
          change={0.12}
          changeLabel="vs last month"
          label="Revenue"
          trend={[8, 9, 9, 11, 10, 12, 14]}
          value={<Value format="currency" value={48_200} />}
        />
        <Stat change={0.04} changeLabel="vs last month" label="Open deals" value="32" />
        <Stat
          change={-0.08}
          changeLabel="vs last month"
          label="Win rate"
          trend={[30, 28, 27, 29, 25, 24, 23]}
          value={<Value format="percent" value={0.23} />}
        />
        <Stat
          change={-0.15}
          changeLabel="vs last month"
          invert
          label="Avg. days to close"
          value="18"
        />
      </StatGrid>
      <div className="gallery__grid">
        <Labelled label="size lg">
          <Stat
            change={0.31}
            changeLabel="this week"
            label="Outlier score"
            size="lg"
            value="2.9×"
          />
        </Labelled>
        <Labelled label="size sm, no change">
          <StatGrid columns={2}>
            <Stat label="Views" size="sm" value={<Value format="compact" value={40_754} />} />
            <Stat label="Channel avg" size="sm" value={<Value format="compact" value={13_989} />} />
            <Stat label="Likes" size="sm" value={<Value format="compact" value={1451} />} />
            <Stat label="Comments" size="sm" value="518" />
          </StatGrid>
        </Labelled>
      </div>
    </Section>
  );
}

export function ChartSection() {
  return (
    <Section
      description="Line for change over time, bars for comparing items. Colours come from the theme's chart roles."
      id="chart"
      title="Chart and Sparkline"
    >
      <div
        className="gallery__grid"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(24rem, 1fr))' }}
      >
        <div className="gallery__panel">
          <Labelled label="line, two series">
            <Chart
              format={{ format: 'currency' }}
              labels={months}
              series={[
                {
                  name: 'Won',
                  values: [12, 14, 13, 17, 19, 18, 22, 24, 23, 27, 30, 34].map((v) => v * 1000),
                },
                {
                  name: 'Pipeline',
                  values: [20, 22, 25, 24, 28, 31, 30, 33, 36, 35, 39, 42].map((v) => v * 1000),
                },
              ]}
            />
          </Labelled>
        </div>
        <div className="gallery__panel">
          <Labelled label="bar, stacked">
            <Chart
              labels={['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']}
              series={[
                { name: 'Done by people', values: [14, 18, 16, 21, 19, 6, 4] },
                { name: 'Done by agents', values: [22, 25, 27, 24, 30, 18, 15] },
                { name: 'Waiting for approval', values: [3, 5, 2, 6, 4, 1, 1] },
              ]}
              stacked
              type="bar"
            />
          </Labelled>
        </div>
        <div className="gallery__panel">
          <Labelled label="bar, one series">
            <Chart
              labels={['Gaming', 'Sports', 'Tech', 'Comedy', 'Music', 'News']}
              series={[{ name: 'Outliers', values: [48, 31, 27, 19, 12, 7] }]}
              type="bar"
            />
          </Labelled>
        </div>
        <div className="gallery__panel">
          <Labelled label="sparkline, up and down">
            <div className="gallery__row">
              <Sparkline data={[3, 4, 3, 5, 6, 5, 8]} />
              <Sparkline data={[9, 8, 8, 6, 7, 5, 4]} />
              <Sparkline data={[5, 5, 6, 5, 5, 6, 6]} height={32} width={120} />
            </div>
          </Labelled>
        </div>
      </div>
    </Section>
  );
}

export function FactSection() {
  return (
    <Section
      description="Label and value pairs for data people read but don't edit, like a record's details panel."
      id="fact-list"
      title="FactList"
    >
      <div className="gallery__grid">
        <Labelled label="rows">
          <FactList>
            <Fact label="Status">
              <StatusBadge tone="warning">Needs approval</StatusBadge>
            </Fact>
            <Fact label="Owner">
              <PersonChip name="Jordan Reyes" />
            </Fact>
            <Fact label="Amount">
              <Value format="currency" value={8500} />
            </Fact>
            <Fact label="Account">
              <RecordChip href="#" icon={<BuildingIcon />} label="Oak Ave Builders" />
            </Fact>
            <Fact label="Due">
              <Value format="date" now={NOW} value={hoursAgo(-72)} />
            </Fact>
            <Fact label="Tags">
              <Badge variant="outline">Electrical</Badge>
              <Badge variant="outline">Phase 2</Badge>
            </Fact>
            <Fact label="Notes" />
          </FactList>
        </Labelled>
        <Labelled label="stacked">
          <FactList layout="stacked">
            <Fact label="Channel">Nate Herk | AI Automation</Fact>
            <Fact label="Subscribers">
              <Value format="compact" value={1_140_000} />
            </Fact>
            <Fact label="Published">
              <Value format="relative" now={NOW} value={hoursAgo(50)} />
            </Fact>
            <Fact label="Video id">
              <CopyValue value="0IPuk63FwU0" />
            </Fact>
          </FactList>
        </Labelled>
      </div>
    </Section>
  );
}

export function StatusSection() {
  return (
    <Section
      description="One status from a fixed set. Done is success, waiting on someone is warning, failed is danger."
      id="status-badge"
      title="StatusBadge"
    >
      <div className="gallery__row">
        <StatusBadge>Draft</StatusBadge>
        <StatusBadge tone="info">In review</StatusBadge>
        <StatusBadge tone="success">Paid</StatusBadge>
        <StatusBadge tone="warning">Needs approval</StatusBadge>
        <StatusBadge tone="danger">Failed</StatusBadge>
      </div>
      <Labelled label="without dot">
        <div className="gallery__row">
          <StatusBadge dot={false}>Draft</StatusBadge>
          <StatusBadge dot={false} tone="info">
            In review
          </StatusBadge>
          <StatusBadge dot={false} tone="success">
            Paid
          </StatusBadge>
          <StatusBadge dot={false} tone="warning">
            Needs approval
          </StatusBadge>
          <StatusBadge dot={false} tone="danger">
            Failed
          </StatusBadge>
        </div>
      </Labelled>
    </Section>
  );
}

export function ChipSection() {
  return (
    <Section
      description="A person, agent or linked record as a compact chip. With an href it opens the record."
      id="entity-chip"
      title="PersonChip and RecordChip"
    >
      <div className="gallery__row">
        <PersonChip name="Jordan Reyes" />
        <PersonChip href="#" name="Priya Natarajan" />
        <PersonChip agent name="Invoice agent" />
        <RecordChip href="#" icon={<BuildingIcon />} label="Kestrel Packaging" />
        <RecordChip href="#" icon={<FileIcon />} label="INV-2094" />
        <RecordChip icon={<PeopleIcon />} label="Field crew" />
        <RecordChip label="No icon" />
      </div>
    </Section>
  );
}

export function MeterSection() {
  return (
    <Section
      description="A score or progress from 0 to a maximum. Auto colour reads high as good; set a tone for plain progress."
      id="meter"
      title="Meter"
    >
      <div className="gallery__grid">
        <Meter label="Fit score" value={82} />
        <Meter label="Fit score" value={48} />
        <Meter label="Fit score" value={12} />
        <Meter label="Onboarding" max={8} tone="neutral" value={5} />
        <Meter label="Storage used" tone="info" value={64} />
        <Labelled label="no label, in a table cell">
          <Meter style={{ maxWidth: '6rem' }} value={71} />
        </Labelled>
      </div>
    </Section>
  );
}

export function PageHeaderSection() {
  return (
    <Section
      description="The header of a custom view, laid out like the admin's own list header: one line that answers what needs me, one primary action."
      id="page-header"
      title="PageHeader"
    >
      <PageHeader
        actions={
          <>
            <Button variant="outline">Export</Button>
            <Button>Create invoice</Button>
          </>
        }
        description="Waiting for a person: 2"
        title="Invoices"
      />
      <PageHeader description="Scored daily at 6:15" title="Funding opportunities" />
    </Section>
  );
}

export function EmptySection() {
  return (
    <Section
      description="What an empty list or dashboard shows: what goes here, and the one action that adds it."
      id="empty-state"
      title="EmptyState"
    >
      <div className="gallery__grid">
        <div className="gallery__panel">
          <EmptyState
            action={<Button>Add a contact</Button>}
            description="People you work with, and the companies they belong to."
            icon={<PeopleIcon />}
            title="No contacts yet"
          />
        </div>
        <div className="gallery__panel">
          <EmptyState
            action={<Button variant="outline">Clear filters</Button>}
            description="Try a wider date range."
            size="compact"
            title="Nothing matches these filters"
          />
        </div>
      </div>
    </Section>
  );
}

export function ReadMoreSection() {
  return (
    <Section
      description="Long text cut to a few lines, with Show more only when it's cut."
      id="read-more"
      title="ReadMore"
    >
      <div className="gallery__grid">
        <Labelled label="two lines">
          <ReadMore>
            We give Claude an unhinged, ultra-aggressive system prompt (sacrifice pieces and go for
            checkmate at all costs) and let it loose on the Chess.com ladder, starting at 100 ELO
            and climbing as far as it can before it loses three games in a row.
          </ReadMore>
        </Labelled>
        <Labelled label="short text, no toggle">
          <ReadMore>User's own comedy and founder channel.</ReadMore>
        </Labelled>
      </div>
    </Section>
  );
}

export function MediaSection() {
  return (
    <Section
      description="An image in a fixed-shape frame, so galleries stay even. A broken or missing image shows a placeholder."
      id="media"
      title="Media"
    >
      <div
        className="gallery__grid"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(12rem, 1fr))' }}
      >
        <Media alt="Video one" badge="12:04" src={thumbnails[0]} />
        <Media alt="Video two" badge="134×" src={thumbnails[1]} />
        <Media alt="Video three" src={thumbnails[2]} />
        <Media alt="Missing thumbnail" />
      </div>
      <div className="gallery__row" style={{ alignItems: 'flex-start' }}>
        <Labelled label="1/1">
          <Media alt="Square" ratio="1/1" src={thumbnails[3]} style={{ width: '6rem' }} />
        </Labelled>
        <Labelled label="9/16">
          <Media
            alt="Short"
            badge="0:58"
            ratio="9/16"
            src={thumbnails[2]}
            style={{ width: '6rem' }}
          />
        </Labelled>
        <Labelled label="4/3">
          <Media alt="Photo" ratio="4/3" src={thumbnails[1]} style={{ width: '8rem' }} />
        </Labelled>
      </div>
    </Section>
  );
}

export function CopySection() {
  return (
    <Section
      description="An id, key or URL with a copy button. Mask hides all but the last four characters."
      id="copy-value"
      title="CopyValue"
    >
      <div className="gallery__row">
        <CopyValue value="https://acme.frogbot.app/api/v1/deals" />
        <CopyValue mask value="fb_live_8f2c91d04ab37e5a" />
        <CopyValue value="0IPuk63FwU0" />
      </div>
    </Section>
  );
}

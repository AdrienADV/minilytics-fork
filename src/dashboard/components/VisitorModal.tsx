import { useMemo, useState, type ReactNode } from 'react';
import { displayName } from '../../shared/names';
import { useDash } from '../lib/context';
import { countryName } from '../lib/format';
import { useApi } from '../lib/useApi';
import { Avatar, BrowserIcon, DeviceIcon, Favicon, Flag, LinkIcon, OSIcon, SourceIcon } from './Icons';
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from './ui/drawer';

interface Session {
  id: string;
  started_at: number;
  last_seen_at: number;
  hostname: string | null;
  referrer: string | null;
  referrer_domain: string | null;
  source: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  ref: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  browser: string | null;
  os: string | null;
  device: string | null;
}

interface Profile {
  visitor: { id: string; first_seen: number; name: string | null; email: string | null; user_id: string | null } | null;
  sessions: Session[];
  events: { session_id: string; ts: number; type: string; name: string | null; path: string; props: string | null }[];
  payments: { id: string; ts: number; amount: number; kind: string; renewal?: number | null }[];
}

/** One line of the journey. `rank` orders items sharing a timestamp: the session start comes first. */
type Item =
  | { kind: 'found'; ts: number; rank: 0; session: Session }
  | { kind: 'pageview'; ts: number; rank: 1; path: string }
  | { kind: 'goal'; ts: number; rank: 1; name: string; path: string; props: [string, string][] }
  | { kind: 'outbound'; ts: number; rank: 1; url: string }
  | { kind: 'payment'; ts: number; rank: 2; amount: number; refund: boolean; renewal: boolean };

const TRACKERS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'ref'] as const;

export function VisitorModal({ visitorId, onClose }: { visitorId: string; onClose: () => void }) {
  const { site, money } = useDash();
  // The parent mounts this per visitor (key), so `data` always belongs to `visitorId`.
  const { data: p } = useApi<Profile>(`/api/sites/${site.id}/visitors/${visitorId}`);
  // Closing is local so the drawer can animate out before the parent unmounts it.
  const [open, setOpen] = useState(true);
  const [newestFirst, setNewestFirst] = useState(false);
  const [copied, setCopied] = useState(false);

  const name = displayName(visitorId, p?.visitor?.name, p?.visitor?.email);
  const last = p?.sessions[0];
  const firstSession = p?.sessions[p.sessions.length - 1];
  const paid = p?.payments.reduce((a, x) => a + (x.kind === 'refund' ? -Math.abs(x.amount) : x.amount), 0) ?? 0;

  const items = useMemo(() => (p ? journey(p) : []), [p]);
  const days = useMemo(() => groupByDay(newestFirst ? [...items].reverse() : items, site.timezone), [items, newestFirst, site.timezone]);

  function copy() {
    if (!p) return;
    const md = toMarkdown({
      name,
      email: p.visitor?.email && p.visitor.email !== name ? p.visitor.email : null,
      source: firstSession?.source ?? null,
      location: last ? [last.city, countryName(last.country)].filter(Boolean).join(', ') : null,
      system: last ? [last.device, last.os, last.browser].filter(Boolean).join(' · ') : null,
      spent: paid ? money(paid) : null,
      days: groupByDay(items, site.timezone),
      tz: site.timezone,
      money,
    });
    navigator.clipboard.writeText(md).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <Drawer open={open} onOpenChange={setOpen} onAnimationEnd={(o) => !o && onClose()}>
      <DrawerContent className="max-h-[92vh] rounded-t-[28px] border-0 shadow-[0_-8px_40px_rgba(28,25,23,0.12)] outline-none">
        <DrawerTitle className="sr-only">{name}</DrawerTitle>
        <DrawerDescription className="sr-only">Visitor journey</DrawerDescription>
        <div className="overflow-y-auto">
          <div className="mx-auto grid max-w-6xl gap-10 px-6 pb-12 pt-8 md:grid-cols-[minmax(240px,300px)_1fr] md:px-10">
            {/* Left: who they are */}
            <aside className="min-w-0">
              {!p ? (
                <div className="space-y-4">
                  <div className="h-28 w-28 animate-pulse rounded-full bg-stone-100" />
                  <div className="h-6 w-40 animate-pulse rounded bg-stone-100" />
                  <div className="h-24 animate-pulse rounded-xl bg-stone-50" />
                </div>
              ) : (
                <>
                  <Avatar id={visitorId} size={112} />
                  <div className="mt-5 break-words text-2xl font-semibold">{name}</div>
                  {p.visitor?.email && p.visitor.email !== name && <div className="mt-0.5 truncate text-sm text-stone-500">{p.visitor.email}</div>}
                  {last && (
                    <ul className="mt-5 space-y-3 text-[17px] text-stone-700">
                      <Fact icon={<Flag cc={last.country} size={22} />}>
                        {countryName(last.country)}
                        {last.city ? `, ${last.city}` : ''}
                      </Fact>
                      {last.device && <Fact icon={<DeviceIcon name={last.device} size={22} />}>{cap(last.device)}</Fact>}
                      {last.os && <Fact icon={<OSIcon name={last.os} size={22} />}>{last.os}</Fact>}
                      {last.browser && <Fact icon={<BrowserIcon name={last.browser} size={22} />}>{last.browser}</Fact>}
                    </ul>
                  )}
                </>
              )}
            </aside>

            {/* Middle: what they did */}
            <section className="min-w-0">
              <div className="mb-3 flex items-center justify-end gap-4 text-xs font-medium uppercase tracking-wide text-stone-400">
                <button className="flex items-center gap-1.5 transition hover:text-stone-700" onClick={() => setNewestFirst((v) => !v)}>
                  <SortIcon /> {newestFirst ? 'Newest first' : 'Oldest first'}
                </button>
                <button
                  className="flex items-center gap-1.5 rounded-md px-1.5 py-0.5 transition hover:bg-stone-100 hover:text-stone-700 disabled:opacity-50"
                  onClick={copy}
                  disabled={!p}
                  title="Copy the journey as Markdown"
                >
                  <CopyIcon /> {copied ? 'Copied' : 'Copy'}
                </button>
              </div>

              {!p && <div className="h-72 animate-pulse rounded-2xl bg-stone-50" />}
              {p && !items.length && <div className="py-16 text-center text-sm text-stone-400">No activity recorded yet.</div>}
              <div className="space-y-4">
                {days.map((d) => (
                  <div key={d.key}>
                    <div className="sticky top-0 z-10 rounded-2xl border border-stone-100 bg-white/95 px-4 py-3 text-center font-medium shadow-[0_4px_14px_rgba(28,25,23,0.06)] backdrop-blur">
                      {d.label}
                    </div>
                    <ol className="mt-2">
                      {d.items.map((it, i) => (
                        <Row key={i} item={it} tz={site.timezone} money={money} fallbackHost={site.domain} />
                      ))}
                    </ol>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function Row({ item, tz, money, fallbackHost }: { item: Item; tz: string; money: (n: number) => string; fallbackHost: string }) {
  const [expanded, setExpanded] = useState(false);
  let icon: ReactNode;
  let body: ReactNode;

  switch (item.kind) {
    case 'found': {
      const s = item.session;
      const host = s.hostname || fallbackHost;
      const trackers = TRACKERS.filter((k) => s[k]);
      icon = <SearchIcon />;
      body = (
        <>
          Found{' '}
          <Chip>
            <Favicon domain={host} size={14} /> {host}
          </Chip>{' '}
          via referrer{' '}
          <Chip>
            {s.referrer_domain ? <SourceIcon source={s.source} domain={s.referrer_domain} size={14} /> : <LinkIcon size={14} />}{' '}
            {s.referrer_domain ?? 'Direct/None'}
          </Chip>
          {trackers.length > 0 && (
            <>
              {' '}
              with tracker{trackers.length > 1 ? 's' : ''}{' '}
              {trackers.map((k) => (
                <Chip key={k}>
                  <LinkIcon size={13} /> <span className="text-stone-400">{k}=</span>
                  {s[k]}
                </Chip>
              ))}
            </>
          )}
        </>
      );
      break;
    }
    case 'pageview':
      icon = <EyeIcon />;
      body = (
        <>
          Viewed page <Chip>{item.path}</Chip>
        </>
      );
      break;
    case 'goal':
      icon = <TargetIcon />;
      body = (
        <>
          Triggered event: <Chip>{item.name}</Chip>
          {item.props.length > 0 && (
            <button
              className="ml-2 inline-flex items-center gap-1 align-middle text-[15px] font-medium text-stone-600 hover:text-ink"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
            >
              ({item.props.length}) parameter{item.props.length > 1 ? 's' : ''}
              <ChevronIcon open={expanded} />
            </button>
          )}
          {expanded && (
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-xl bg-stone-50 px-3 py-2 font-mono text-[13px]">
              {item.props.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-stone-400">{k}</dt>
                  <dd className="break-all text-stone-700">{v}</dd>
                </div>
              ))}
            </dl>
          )}
        </>
      );
      break;
    case 'outbound':
      icon = <ExitIcon />;
      body = (
        <>
          Left to <Chip>{item.url.replace(/^https?:\/\//, '')}</Chip>
        </>
      );
      break;
    case 'payment':
      icon = <CoinIcon />;
      body = (
        <span className="font-medium text-revenue">
          {item.refund ? 'Refunded' : item.renewal ? 'Renewed for' : 'Paid'} {money(item.amount)}
        </span>
      );
      break;
  }

  return (
    <li className="flex items-start gap-4 rounded-xl px-3 py-3 transition hover:bg-stone-50/70">
      <span className="mt-0.5 shrink-0 text-stone-700">{icon}</span>
      <div className="min-w-0 flex-1 text-[17px] leading-8 text-stone-600">{body}</div>
      <time className="shrink-0 pt-0.5 text-[17px] tabular-nums text-stone-800">{fmtTime(item.ts, tz)}</time>
    </li>
  );
}

function Chip({ children }: { children: ReactNode }) {
  return (
    <code className="inline-flex max-w-full items-center gap-1.5 break-all rounded-md bg-stone-100/70 px-1.5 align-middle font-mono text-[15px] leading-7 text-ink">
      {children}
    </code>
  );
}

function Fact({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-center gap-3">
      <span className="flex w-7 shrink-0 justify-center">{icon}</span>
      <span className="min-w-0 truncate">{children}</span>
    </li>
  );
}

// ——— Data ———

function journey(p: Profile): Item[] {
  const items: Item[] = [];
  for (const s of p.sessions) items.push({ kind: 'found', ts: s.started_at, rank: 0, session: s });
  for (const e of p.events) {
    if (e.type === 'pageview') items.push({ kind: 'pageview', ts: e.ts, rank: 1, path: e.path });
    else if (e.type === 'goal') items.push({ kind: 'goal', ts: e.ts, rank: 1, name: e.name ?? '(unnamed)', path: e.path, props: parseProps(e.props) });
    else if (e.type === 'outbound') items.push({ kind: 'outbound', ts: e.ts, rank: 1, url: e.name ?? '' });
  }
  for (const x of p.payments) {
    items.push({ kind: 'payment', ts: x.ts, rank: 2, amount: Math.abs(x.amount), refund: x.kind === 'refund', renewal: !!x.renewal });
  }
  // Events come newest first from the API; a stable sort keeps same-ms events in the order they arrived once reversed.
  return items.reverse().sort((a, b) => a.ts - b.ts || a.rank - b.rank);
}

function parseProps(raw: string | null): [string, string][] {
  if (!raw) return [];
  try {
    const o = JSON.parse(raw);
    if (!o || typeof o !== 'object') return [];
    return Object.entries(o).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)]);
  } catch {
    return [];
  }
}

interface Day {
  key: string;
  label: string;
  items: Item[];
}

function groupByDay(items: Item[], tz: string): Day[] {
  const days: Day[] = [];
  for (const it of items) {
    const key = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(it.ts);
    let d = days.at(-1);
    if (!d || d.key !== key) days.push((d = { key, label: fmtDay(it.ts, tz), items: [] }));
    d.items.push(it);
  }
  return days;
}

/** "Friday, Oct 23rd 2026" */
function fmtDay(ts: number, tz: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en', { timeZone: tz, weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })
      .formatToParts(ts)
      .map((x) => [x.type, x.value]),
  );
  return `${parts.weekday}, ${parts.month} ${ordinal(Number(parts.day))} ${parts.year}`;
}

function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
  return `${n}${s}`;
}

function fmtTime(ts: number, tz: string): string {
  return new Intl.DateTimeFormat('en', { timeZone: tz, hour: 'numeric', minute: '2-digit' }).format(ts);
}

function fmtClock(ts: number, tz: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(ts);
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** The journey as Markdown, ready to paste into a doc or an LLM. Always oldest first. */
export function toMarkdown(o: {
  name: string;
  email: string | null;
  source: string | null;
  location: string | null;
  system: string | null;
  spent: string | null;
  days: Day[];
  tz: string;
  money: (n: number) => string;
}): string {
  const out = ['# User Journey', `**Name:** ${o.name}`];
  if (o.email) out.push(`**Email:** ${o.email}`);
  if (o.source) out.push(`**Source:** ${o.source}`);
  if (o.location) out.push(`**Location:** ${o.location}`);
  if (o.system) out.push(`**System:** ${o.system}`);
  if (o.spent) out.push(`**Total spent:** ${o.spent}`);
  for (const d of o.days) {
    out.push('', `## ${d.label}`, '');
    for (const it of d.items) {
      const t = '`' + fmtClock(it.ts, o.tz) + '`';
      switch (it.kind) {
        case 'found': {
          const s = it.session;
          const trackers = TRACKERS.filter((k) => s[k]).map((k) => '`' + `${k}=${s[k]}` + '`');
          out.push(
            `- ${t} Found \`${s.hostname ?? ''}\` via referrer \`${s.referrer_domain ?? 'Direct/None'}\`` +
              (trackers.length ? ` with tracker${trackers.length > 1 ? 's' : ''} ${trackers.join(', ')}` : ''),
          );
          break;
        }
        case 'pageview':
          out.push(`- ${t} Viewed page \`${it.path}\``);
          break;
        case 'goal':
          out.push(`- ${t} Triggered event: \`${it.name}\``);
          for (const [k, v] of it.props) out.push(`  - \`${k}\`: ${v}`);
          break;
        case 'outbound':
          out.push(`- ${t} Left to \`${it.url}\``);
          break;
        case 'payment':
          out.push(`- ${t} ${it.refund ? 'Refunded' : it.renewal ? 'Renewed for' : 'Paid'} ${o.money(it.amount)}`);
          break;
      }
    }
  }
  return out.join('\n') + '\n';
}

// ——— Icons ———

const svg = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

function SearchIcon() {
  return (
    <svg {...svg}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}
function EyeIcon() {
  return (
    <svg {...svg}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
function TargetIcon() {
  return (
    <svg {...svg}>
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  );
}
function ExitIcon() {
  return (
    <svg {...svg}>
      <path d="M7 17 17 7M8 7h9v9" />
    </svg>
  );
}
function CoinIcon() {
  return (
    <svg {...svg}>
      <circle cx="12" cy="12" r="9" />
      <path d="M15 9.5c-.5-1-1.6-1.5-3-1.5-1.7 0-3 .8-3 2s1.3 1.7 3 2 3 .8 3 2-1.3 2-3 2c-1.4 0-2.5-.5-3-1.5M12 6v2M12 16v2" />
    </svg>
  );
}
function SortIcon() {
  return (
    <svg {...svg} width={14} height={14}>
      <path d="M7 4v16M3 8l4-4 4 4M17 20V4M13 16l4 4 4-4" />
    </svg>
  );
}
function CopyIcon() {
  return (
    <svg {...svg} width={14} height={14}>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}
function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg {...svg} width={14} height={14} className={`transition ${open ? 'rotate-180' : ''}`}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

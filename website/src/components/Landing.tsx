import {AppShell} from '@astryxdesign/core/AppShell';
import {Button} from '@astryxdesign/core/Button';
import {Code} from '@astryxdesign/core/Code';
import {Collapsible, CollapsibleGroup} from '@astryxdesign/core/Collapsible';
import {Grid} from '@astryxdesign/core/Grid';
import {Heading} from '@astryxdesign/core/Heading';
import {HStack} from '@astryxdesign/core/HStack';
import {Icon} from '@astryxdesign/core/Icon';
import {Link} from '@astryxdesign/core/Link';
import {Text} from '@astryxdesign/core/Text';
import {VStack} from '@astryxdesign/core/VStack';
import {
  ArrowPathIcon,
  ArrowRightIcon,
  ChatBubbleLeftRightIcon,
  CheckIcon,
  ClipboardDocumentIcon,
  ComputerDesktopIcon,
  LightBulbIcon,
  ShieldCheckIcon,
  ViewColumnsIcon,
} from '@heroicons/react/24/outline';
import {useState, type ComponentType, type ReactNode, type SVGProps} from 'react';
import {DOCS_URL, GITHUB_URL, INSTALL_CMD, VERSION} from '../site';
import {AstryxRoot, useColorMode} from './AstryxRoot';
import {DashboardDemo, demoSrc} from './DashboardDemo';
import {PulseTerminal} from './PulseTerminal';
import {SiteFooter} from './SiteFooter';
import {SiteHeader} from './SiteHeader';
import {WorkCycle} from './WorkCycle';

type HeroIcon = ComponentType<SVGProps<SVGSVGElement>>;

const HOSTS = [
  'Claude Code',
  'Cursor',
  'GitHub Copilot',
  'Codex',
  'OpenCode',
  'VS Code',
  'Kiro',
] as const;

/** Figures quoted in the README and `docs/research.md`. */
const STATS = [
  {
    figure: '+20%',
    claim: 'how much faster experienced developers believed they were with AI.',
    source: 'METR, 2025',
    href: 'https://arxiv.org/abs/2507.09089',
  },
  {
    figure: '−19%',
    claim: 'how much slower they actually measured on real issues.',
    source: 'METR, 2025',
    href: 'https://arxiv.org/abs/2507.09089',
  },
  {
    figure: '74%',
    claim: 'of AI users did not notice they switch windows more than before.',
    source: 'ICSE, 2026',
    href: 'https://doi.org/10.1145/3744916.3787811',
  },
] as const;

const PULSE_PARTS = [
  {label: 'Resume', text: 'The exact next action, written by the last agent.'},
  {label: 'Git', text: 'Branch, dirty state, and the last commit, read live.'},
  {label: 'Needs eyes', text: 'Work an agent finished that nobody has reviewed.'},
  {label: 'In the air', text: 'Directions and concerns that live nowhere else.'},
  {label: 'Settled', text: 'Decisions in force, so nobody argues them again.'},
] as const;

const CLAUDE_CARDS: {icon: HeroIcon; title: ReactNode; text: string}[] = [
  {
    icon: ChatBubbleLeftRightIcon,
    title: 'Above the prompt',
    text: 'Resume, pulse, and open counts in two rows. It steps aside for a survey.',
  },
  {
    icon: ComputerDesktopIcon,
    title: 'Desktop Code tab',
    text: 'A panel for this session. Local sessions only, not cloud or WSL.',
  },
  {
    icon: ViewColumnsIcon,
    title: <Code size="inherit">/mental</Code>,
    text: 'Now, residue, decisions, session, and time. Park and Hand off ask the agent.',
  },
];

const LEDGER: {icon: HeroIcon; item: ReactNode; detail: ReactNode; state: string}[] = [
  {
    icon: ShieldCheckIcon,
    item: 'Journals, decisions, residue',
    detail: (
      <>
        Markdown in <Code size="inherit">~/.mental/</Code>. No account. Uninstall keeps
        the files unless you type DELETE.
      </>
    ),
    state: 'Stays here',
  },
  {
    icon: ArrowPathIcon,
    item: 'Version check',
    detail: (
      <>
        The package name, sent to npm.{' '}
        <Code size="inherit">MENTAL_SKIP_UPDATE_CHECK=1</Code> turns it off.
      </>
    ),
    state: 'Optional',
  },
  {
    icon: LightBulbIcon,
    item: 'Decision model',
    detail: (
      <>
        Redacted text, only after you store a key in{' '}
        <Code size="inherit">~/.mental/config.json</Code>.
      </>
    ),
    state: 'Opt-in',
  },
];

const FAQS = [
  {
    q: 'Do I have to write the journal myself?',
    a: 'No. After install, agents write it on your behalf. You type mental when you want the pulse.',
  },
  {
    q: 'Is this chat memory or a vector store?',
    a: 'No. Mental CLI is project continuity, not conversation memory. Markdown files are the source of truth. There are no embeddings as source of truth, and there is no cloud store.',
  },
  {
    q: 'Does it replace git, issues, or PLAN.md?',
    a: 'No. Git still records what changed. --against PLAN.md points at the plan. Mental holds the small amount those systems cannot see: resume, decisions, and residue.',
  },
  {
    q: 'Will it auto-journal every chat turn?',
    a: 'No. Agents journal at task boundaries, real decisions, and residue in the air. Session hooks stay off until you run mental hooks on.',
  },
  {
    q: 'When do I use park, handoff, or pulse?',
    a: 'park encodes an interruption mid-hop. handoff is a planned close (journal plus heartbeat). pulse is a compact cross-project overview. The cheap mid-chat reload is still mental / heartbeat --json.',
  },
  {
    q: 'How do I upgrade?',
    a: 'Run npm i -g @balacode/mental, then mental install, then mental doctor. Journals stay. From a git checkout: npm run mental -- install.',
  },
  {
    q: 'What if mental is not installed?',
    a: 'Agents continue the coding task and mention the install block. They never execute a .mjs file directly. Fail open.',
  },
  {
    q: 'Where does data live?',
    a: 'Default store is ~/.mental (never commit). Project ./.mental only after mental local. Uninstall does not delete OKF files unless you type DELETE.',
  },
  {
    q: 'Does Mental CLI track my hours?',
    a: 'Only if you turn it on with mental option track on. Default off. Hours never go in git.',
  },
];

const NEXT_COMMANDS = ['mental install', 'mental doctor'] as const;

function copyText(command: string) {
  void navigator.clipboard?.writeText(command);
}

function ViewWindow({src, title}: {src: string; title: string}) {
  const {mode} = useColorMode();
  return (
    <iframe
      key={mode}
      className="view-window"
      src={demoSrc(src, mode)}
      title={title}
      loading="lazy"
    />
  );
}

/** Chapter rule: a numbered label over a hairline, then the heading. */
function Chapter({
  id,
  index,
  label,
  title,
  lead,
  children,
}: {
  id: string;
  index: string;
  label: string;
  title: ReactNode;
  lead?: ReactNode;
  children: ReactNode;
}) {
  return (
    <VStack id={id} className="chapter reveal" gap={8} width="100%">
      <HStack className="chapter-rule" gap={4} vAlign="center" width="100%">
        <Text className="chapter-index">{index}</Text>
        <Text className="chapter-label">{label}</Text>
      </HStack>
      <VStack className="chapter-head" gap={3} hAlign="start">
        <Heading level={2} className="chapter-title">
          {title}
        </Heading>
        {lead ? <Text className="chapter-lead">{lead}</Text> : null}
      </VStack>
      {children}
    </VStack>
  );
}

export function Landing() {
  const [copied, setCopied] = useState<string | null>(null);

  function copyCommand(command: string) {
    copyText(command);
    setCopied(command);
    window.setTimeout(() => {
      setCopied((current) => (current === command ? null : current));
    }, 1600);
  }

  const copyIcon = (command: string) => (
    <Icon
      icon={copied === command ? CheckIcon : ClipboardDocumentIcon}
      size="sm"
      color="inherit"
    />
  );

  return (
    <AstryxRoot>
      <AppShell
        variant="surface"
        contentPadding={6}
        height="auto"
        topNav={<SiteHeader />}
      >
        <VStack width="100%" hAlign="center">
          <VStack className="page" gap={0} width="100%">
            <VStack id="top" className="hero" gap={10} width="100%">
              <VStack className="hero-copy" gap={7} hAlign="center" width="100%">
                <HStack className="hero-pill" gap={2} vAlign="center">
                  <Text className="hero-pill-dot" aria-hidden="true">
                    {' '}
                  </Text>
                  <Text className="hero-pill-text">
                    v{VERSION} · local-first · no account
                  </Text>
                </HStack>
                <Heading level={1} className="hero-title">
                  Picking up where your AI agents left off
                </Heading>
                <Text className="hero-lead">
                  Agents write the resume. You type{' '}
                  <Code size="inherit">mental</Code>.
                </Text>

                <VStack id="install" className="install" gap={0} width="100%">
                  <HStack className="install-row install-main" gap={3} vAlign="center" width="100%">
                    <Text className="install-step">01</Text>
                    <Text className="install-cmd">
                      <Text className="install-prompt">$</Text> {INSTALL_CMD}
                    </Text>
                    <Button
                      label={copied === INSTALL_CMD ? 'Copied' : 'Copy'}
                      variant="primary"
                      size="sm"
                      onClick={() => copyCommand(INSTALL_CMD)}
                      endContent={copyIcon(INSTALL_CMD)}
                    />
                  </HStack>
                  {NEXT_COMMANDS.map((command, index) => (
                    <HStack
                      key={command}
                      className="install-row"
                      gap={3}
                      vAlign="center"
                      width="100%"
                    >
                      <Text className="install-step">0{index + 2}</Text>
                      <Text className="install-cmd">
                        <Text className="install-prompt">$</Text> {command}
                      </Text>
                      <Button
                        label={copied === command ? 'Copied' : 'Copy'}
                        variant="ghost"
                        size="sm"
                        onClick={() => copyCommand(command)}
                        endContent={copyIcon(command)}
                      />
                    </HStack>
                  ))}
                </VStack>

                <HStack gap={5} vAlign="center" hAlign="center" wrap="wrap">
                  <Button
                    label="Read the docs"
                    variant="secondary"
                    href={DOCS_URL}
                    endContent={<Icon icon={ArrowRightIcon} size="sm" color="inherit" />}
                  />
                  <Link href={GITHUB_URL} isExternalLink isStandalone>
                    GitHub
                  </Link>
                </HStack>
                <Text className="hero-fine">
                  Node.js 22.13 or newer. The unscoped package named{' '}
                  <Code size="inherit">mental</Code> is a different project.
                </Text>
              </VStack>
              <VStack className="hero-stage" width="100%">
                <DashboardDemo />
              </VStack>
            </VStack>

            <VStack className="hosts" gap={4} width="100%">
              <Text className="hosts-label">Works in the agents you already use</Text>
              <VStack className="marquee" width="100%">
                <HStack className="marquee-track" gap={0}>
                  {[...HOSTS, ...HOSTS].map((host, index) => (
                    <Text
                      key={`${host}-${index}`}
                      className="marquee-item"
                      aria-hidden={index >= HOSTS.length ? 'true' : undefined}
                    >
                      {host}
                    </Text>
                  ))}
                </HStack>
              </VStack>
            </VStack>

            <Chapter
              id="tax"
              index="01"
              label="The tax"
              title="Feeling faster is not the same as picking up"
              lead="Every new chat, every Monday, every second clone pays to rebuild where you were. The research measured it."
            >
              <Grid columns={{minWidth: 240, max: 3}} gap={4} width="100%">
                {STATS.map((stat) => (
                  <VStack key={stat.figure} className="stat" gap={4} hAlign="start">
                    <Text className="stat-figure">{stat.figure}</Text>
                    <Text className="stat-claim">{stat.claim}</Text>
                    <Link href={stat.href} isExternalLink isStandalone>
                      {stat.source}
                    </Link>
                  </VStack>
                ))}
              </Grid>
            </Chapter>

            <WorkCycle />

            <Chapter
              id="pulse"
              index="03"
              label="The pulse"
              title={
                <>
                  You type <Code size="inherit">mental</Code>
                </>
              }
              lead="One screen, then it exits. Not a dashboard you keep open, not a dump of the chat."
            >
              <Grid columns={{minWidth: 300, max: 2}} gap={10} align="center" width="100%">
                <VStack className="pulse-parts" gap={0} width="100%">
                  {PULSE_PARTS.map((part) => (
                    <HStack key={part.label} className="pulse-part" gap={4} vAlign="baseline" width="100%">
                      <Text className="pulse-part-label">{part.label}</Text>
                      <Text className="pulse-part-text">{part.text}</Text>
                    </HStack>
                  ))}
                </VStack>
                <VStack className="glow-frame" width="100%">
                  <PulseTerminal />
                </VStack>
              </Grid>
            </Chapter>

            <Chapter
              id="attention"
              index="04"
              label="The residue"
              title="When the chat is gone"
              lead="Same sample session. Two things git does not keep."
            >
              <Grid columns={{minWidth: 320, max: 2}} gap={6} width="100%">
                <VStack className="view-card" gap={4} hAlign="start">
                  <ViewWindow
                    src="/demo/index.html?embed=1#/attention"
                    title="Attention view from the sample session"
                  />
                  <VStack gap={1} hAlign="start">
                    <Text className="view-card-title">Attention</Text>
                    <Text className="view-card-text">What is still in the air.</Text>
                  </VStack>
                </VStack>
                <VStack className="view-card" gap={4} hAlign="start">
                  <ViewWindow
                    src="/demo/index.html?embed=1#/decisions"
                    title="Decisions view from the sample session"
                  />
                  <VStack gap={1} hAlign="start">
                    <Text className="view-card-title">Decisions</Text>
                    <Text className="view-card-text">Why it stayed that way.</Text>
                  </VStack>
                </VStack>
              </Grid>
            </Chapter>

            <Chapter
              id="claude"
              index="05"
              label="In the host"
              title="Inside Claude Code"
              lead="It reads the session. It does not write."
            >
              <Grid columns={{minWidth: 220, max: 3}} gap={4} width="100%">
                {CLAUDE_CARDS.map((card, index) => (
                  <VStack key={index} className="bento" gap={5} hAlign="start">
                    <HStack className="bento-icon" vAlign="center" hAlign="center">
                      <Icon icon={card.icon} size="md" color="accent" />
                    </HStack>
                    <VStack gap={2} hAlign="start">
                      <Heading level={3} className="bento-title">
                        {card.title}
                      </Heading>
                      <Text className="bento-text">{card.text}</Text>
                    </VStack>
                  </VStack>
                ))}
              </Grid>
              <Link href="/docs/hosts" isStandalone>
                Claude panel and Cursor sidebar in the docs
              </Link>
            </Chapter>

            <Chapter
              id="privacy"
              index="06"
              label="The ledger"
              title="What leaves this machine"
              lead="Journals stay here. Everything else is off until you turn it on."
            >
              <VStack className="ledger" gap={0} width="100%">
                {LEDGER.map((row) => (
                  <HStack key={row.state} className="ledger-row" gap={5} vAlign="center" width="100%">
                    <HStack className="ledger-icon" vAlign="center" hAlign="center">
                      <Icon icon={row.icon} size="sm" color="accent" />
                    </HStack>
                    <VStack className="ledger-body" gap={1} hAlign="start">
                      <Text className="ledger-item">{row.item}</Text>
                      <Text className="ledger-detail">{row.detail}</Text>
                    </VStack>
                    <Text className="ledger-state">{row.state}</Text>
                  </HStack>
                ))}
              </VStack>
              <Link href="/docs/identity" isStandalone>
                Privacy in the docs
              </Link>
            </Chapter>

            <Chapter id="faq" index="07" label="FAQ" title="Short answers">
              <VStack className="faq" width="100%">
                <CollapsibleGroup type="multiple" hasDividers>
                  {FAQS.map((item) => (
                    <Collapsible key={item.q} value={item.q} trigger={item.q}>
                      <Text color="secondary">{item.a}</Text>
                    </Collapsible>
                  ))}
                </CollapsibleGroup>
              </VStack>
            </Chapter>

            <VStack className="finale reveal" gap={8} hAlign="center" width="100%">
              <Text className="finale-word" aria-hidden="true">
                mental
              </Text>
              <Text className="finale-lead">Three commands. Then your agents remember.</Text>
              <HStack gap={4} hAlign="center" wrap="wrap">
                <Button
                  label={copied === INSTALL_CMD ? 'Copied' : INSTALL_CMD}
                  variant="primary"
                  size="lg"
                  onClick={() => copyCommand(INSTALL_CMD)}
                  endContent={copyIcon(INSTALL_CMD)}
                />
                <Button label="Read the docs" variant="ghost" size="lg" href={DOCS_URL} />
              </HStack>
            </VStack>

            <SiteFooter />
          </VStack>
        </VStack>
      </AppShell>
    </AstryxRoot>
  );
}

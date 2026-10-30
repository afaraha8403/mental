import {AppShell} from '@astryxdesign/core/AppShell';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {Code} from '@astryxdesign/core/Code';
import {CodeBlock} from '@astryxdesign/core/CodeBlock';
import {Collapsible, CollapsibleGroup} from '@astryxdesign/core/Collapsible';
import {Grid} from '@astryxdesign/core/Grid';
import {Heading} from '@astryxdesign/core/Heading';
import {HStack} from '@astryxdesign/core/HStack';
import {Icon} from '@astryxdesign/core/Icon';
import {Link} from '@astryxdesign/core/Link';
import {Section} from '@astryxdesign/core/Section';
import {Text} from '@astryxdesign/core/Text';
import {SyntaxTheme} from '@astryxdesign/core/theme';
import {githubDark} from '@astryxdesign/core/theme/syntax';
import {VStack} from '@astryxdesign/core/VStack';
import {ArrowTopRightOnSquareIcon} from '@heroicons/react/24/outline';
import {DOCS_URL, GITHUB_URL, INSTALL_CMD, README_URL, VERSION} from '../site';
import {AstryxRoot} from './AstryxRoot';
import {ProductShot} from './ProductShot';
import {SiteFooter} from './SiteFooter';
import {SiteHeader} from './SiteHeader';

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

const STEPS = [
  {
    n: '1',
    title: 'Install the CLI',
    body: 'npm i -g @balacode/mental, then mental install. That copies the skill and a tiny always-on rule into your agent hosts. npm owns the executable.',
  },
  {
    n: '2',
    title: 'Agents write at a task boundary',
    body: 'They journal a short summary, record a decision that constrains the future, and capture residue still in the air. Not every chat turn. Not a hidden hook.',
  },
  {
    n: '3',
    title: 'You type mental',
    body: 'One pulse, then exit: resume, last outcome, git, hops, needs eyes, in the air. Optional mental dashboard opens a localhost page over the same files.',
  },
];

const FEATURES = [
  {
    k: 'Journal',
    title: 'Short summaries at the end of a task',
    body: 'One journal section per real task boundary, not per chat turn. Title, body, and a required resume line. Agents write it. You read it later.',
  },
  {
    k: 'Heartbeat',
    title: 'A pulse, not a dump',
    body: 'mental / heartbeat --json is resume, last outcome, git, hops today, needs eyes, in the air, later, unsettled and settled. Then it exits.',
  },
  {
    k: 'Attention',
    title: 'Residue still in the air',
    body: 'direction, concern, thread, or verify. Capped at 7 on the heartbeat. --status later is come back to this, not a second journal.',
  },
  {
    k: 'Decisions',
    title: 'Why a choice constrains the future',
    body: 'Git records what changed. A decision file records why. Same title updates the existing file. Closing it keeps the path as identity.',
  },
  {
    k: 'Search',
    title: 'Local search over your files',
    body: 'Query the derived SQLite index (rebuildable). Markdown stays the source of truth. Deleting the db loses nothing.',
  },
  {
    k: 'Dashboard',
    title: 'A localhost page over the same files',
    body: 'mental dashboard is optional, read-only, loopback only. Today, attention, decisions, library, and a map. Agents still use --json.',
  },
  {
    k: 'Skill',
    title: 'Loads in your agent hosts',
    body: 'mental install copies the procedure into Cursor, Claude Code, Copilot, Codex, and OpenCode paths. The plugin is discovery. npm is the executable.',
  },
];

function copyInstall() {
  void navigator.clipboard?.writeText(INSTALL_CMD);
}

export function Landing() {
  return (
    <AstryxRoot>
      <AppShell
        variant="surface"
        contentPadding={6}
        height="auto"
        topNav={<SiteHeader />}
      >
        <VStack width="100%" hAlign="center">
          <VStack gap={10} width="100%" maxWidth={1100}>
            <Section id="top" variant="transparent" padding={0}>
              <VStack gap={6} hAlign="center">
                <VStack gap={3} hAlign="center">
                  <Text type="label" color="secondary" justify="center">
                    v{VERSION} · @balacode/mental
                  </Text>
                  <Heading
                    level={1}
                    type="display-2"
                    justify="center"
                    textWrap="balance"
                  >
                    Picking up where your AI agents left off
                  </Heading>
                  <Text
                    type="body"
                    color="secondary"
                    justify="center"
                    textWrap="balance"
                  >
                    Local-first continuity for you and your coding agents.
                  </Text>
                  <Text color="secondary" justify="center" textWrap="balance">
                    Git records what changed. Mental records the resume, the
                    decision git cannot explain, and what is still in the air.
                    Your agents write it. You type{' '}
                    <Code size="inherit">mental</Code> for the pulse.
                  </Text>
                </VStack>
                <HStack gap={3} wrap hAlign="center">
                  <Button
                    label={INSTALL_CMD}
                    variant="primary"
                    onClick={copyInstall}
                  />
                  <Button
                    label="GitHub"
                    variant="secondary"
                    href={GITHUB_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    endContent={
                      <Icon
                        icon={ArrowTopRightOnSquareIcon}
                        size="sm"
                        color="inherit"
                      />
                    }
                  />
                </HStack>
                <Text type="supporting" color="secondary" justify="center">
                  Then <Code size="inherit">mental install</Code> and{' '}
                  <Code size="inherit">mental doctor</Code>.
                </Text>
              </VStack>
            </Section>

            <Section variant="transparent" padding={0}>
              <ProductShot
                src="/screenshots/dashboard-today.png"
                alt="Mental dashboard Today view with resume line, git, attention lanes, and journal activity from a real local session"
                caption="The Mental dashboard (localhost, read-only) over the same files the CLI writes."
                loading="eager"
              />
            </Section>

            <Section id="how" variant="transparent" padding={0}>
              <VStack gap={5}>
                <VStack gap={2}>
                  <Text type="label" color="secondary">
                    HOW IT WORKS
                  </Text>
                  <Heading level={2}>Three steps. Then you type mental.</Heading>
                </VStack>
                <Grid columns={{minWidth: 240, max: 3}} gap={4} width="100%">
                  {STEPS.map((step) => (
                    <Card key={step.n} width="100%">
                      <VStack gap={2}>
                        <Text type="label" color="accent">
                          Step {step.n}
                        </Text>
                        <Heading level={3}>{step.title}</Heading>
                        <Text color="secondary">{step.body}</Text>
                      </VStack>
                    </Card>
                  ))}
                </Grid>
              </VStack>
            </Section>

            <Section id="features" variant="transparent" padding={0}>
              <VStack gap={5}>
                <VStack gap={2}>
                  <Text type="label" color="secondary">
                    FEATURES
                  </Text>
                  <Heading level={2}>What it actually stores</Heading>
                  <Text color="secondary">
                    Honest to the current CLI. Nothing here is a hosted product.
                  </Text>
                </VStack>
                <Grid columns={{minWidth: 240, max: 2}} gap={4} width="100%">
                  {FEATURES.map((feature) => (
                    <Card key={feature.k} width="100%">
                      <VStack gap={2}>
                        <Text type="label" color="accent">
                          {feature.k}
                        </Text>
                        <Heading level={3}>{feature.title}</Heading>
                        <Text color="secondary">{feature.body}</Text>
                      </VStack>
                    </Card>
                  ))}
                </Grid>
              </VStack>
            </Section>

            <Section id="product" variant="transparent" padding={0}>
              <VStack gap={6}>
                <VStack gap={2}>
                  <Text type="label" color="secondary">
                    THE REAL UI
                  </Text>
                  <Heading level={2}>Dashboard and CLI, from this repo</Heading>
                  <Text color="secondary">
                    Screenshots below were captured from Mental CLI v{VERSION}{' '}
                    running locally. Not mockups.
                  </Text>
                </VStack>
                <ProductShot
                  src="/screenshots/dashboard-attention.png"
                  alt="Mental dashboard Attention view listing verify and later residue from a real local session"
                  caption="Attention: residue that outlives a chat (verify, direction, thread, later)."
                />
                <ProductShot
                  src="/screenshots/dashboard-decisions.png"
                  alt="Mental dashboard Decisions view with one open decision and one decided item from a real local session"
                  caption="Decisions: why things are the way they are."
                />
                <ProductShot
                  src="/screenshots/dashboard-journal.png"
                  alt="Mental dashboard Library view showing journal, decisions, attention, and notes from a real local session"
                  caption="Library: journals, decisions, attention, and notes in one catalog."
                />
                <Grid columns={{minWidth: 280, max: 2}} gap={4} width="100%">
                  <ProductShot
                    src="/screenshots/cli-heartbeat.png"
                    alt="Terminal screenshot of mental heartbeat showing resume, git, needs eyes, and residue"
                    caption="mental heartbeat"
                    width={920}
                    height={420}
                  />
                  <ProductShot
                    src="/screenshots/cli-help.png"
                    alt="Terminal screenshot of mental --help listing daily, lookup, write, identity, and setup commands"
                    caption="mental --help"
                    width={920}
                    height={720}
                  />
                </Grid>
                <ProductShot
                  src="/screenshots/cli-park.png"
                  alt="Terminal screenshot of mental park encoding an interruption and printing a heartbeat"
                  caption="mental park encodes an interruption, then prints the pulse."
                  width={920}
                  height={420}
                />
              </VStack>
            </Section>

            <Section id="privacy" variant="transparent" padding={0}>
              <VStack gap={5}>
                <VStack gap={2}>
                  <Text type="label" color="secondary">
                    PRIVACY
                  </Text>
                  <Heading level={2}>What leaves your machine</Heading>
                </VStack>
                <Card width="100%">
                  <VStack gap={3}>
                    <Text>
                      No account. No upload of your journals. Local-first.
                      Default store is <Code size="inherit">~/.mental/</Code>{' '}
                      (never commit). Project{' '}
                      <Code size="inherit">./.mental</Code> only after{' '}
                      <Code size="inherit">mental local</Code>, and it must be
                      gitignored. Never store secrets, tokens, or private keys.
                      Uninstall does not delete OKF files unless you type DELETE.
                    </Text>
                    <Heading level={3}>Optional npm update check</Heading>
                    <Text color="secondary">
                      Ordinary commands may spawn{' '}
                      <Code size="inherit">npm view @balacode/mental version</Code>{' '}
                      when a local cache is stale, so they can tell you npm is
                      ahead. Cache file:{' '}
                      <Code size="inherit">npm-latest.json</Code> under{' '}
                      <Code size="inherit">~/.cache/mental</Code> (or{' '}
                      <Code size="inherit">$XDG_CACHE_HOME/mental</Code>
                      ). 24h while this CLI matches cache, 7d while already behind.
                      A failed view backs off 15 minutes. TTY prints the hint at
                      most once per day. Heartbeat never checks.{' '}
                      <Code size="inherit">mental doctor</Code> still checks live.{' '}
                      <Code size="inherit">MENTAL_SKIP_UPDATE_CHECK=1</Code> skips
                      the network. Only the package version string is fetched, not
                      your notes.
                    </Text>
                    <Heading level={3}>Optional decision-model providers</Heading>
                    <Text color="secondary">
                      Off until you store a key. Mental can use TypeSafe Jev,
                      OpenAI Decisions, Cloudflare Clef, or a custom
                      TypeSafe-shaped endpoint as a typed judge (search recovery,
                      similar-to-existing hints, proposed links, tags, brief
                      ranking). Keys are read only from{' '}
                      <Code size="inherit">~/.mental/config.json</Code> (mode
                      0600), never from environment variables, and are never
                      printed or sent over MCP. Notes are not uploaded unless you
                      opt into a provider. Personal-slice notes are included
                      unless you set{' '}
                      <Code size="inherit">option decide personal off</Code>. It
                      fails open. Writes happen only with explicit{' '}
                      <Code size="inherit">--apply</Code> on high-confidence
                      results.
                    </Text>
                    <Text color="secondary">
                      Optional MCP, session hooks, and time tracking are default
                      off.
                    </Text>
                  </VStack>
                </Card>
              </VStack>
            </Section>

            <Section id="install" variant="transparent" padding={0}>
              <VStack gap={4}>
                <VStack gap={2}>
                  <Text type="label" color="secondary">
                    INSTALL
                  </Text>
                  <Heading level={2}>Three commands</Heading>
                  <Text color="secondary">
                    PowerShell, cmd.exe, Windows Terminal, Git Bash, macOS, and
                    Linux. Node.js 22.13 or newer. Zero runtime npm dependencies.
                  </Text>
                </VStack>
                <SyntaxTheme theme={githubDark}>
                  <CodeBlock
                    code={`${INSTALL_CMD}\nmental install\nmental doctor`}
                    language="bash"
                    hasCopyButton
                    hasLanguageLabel={false}
                    width="100%"
                  />
                </SyntaxTheme>
                <Text color="secondary">
                  Then run <Code size="inherit">mental install</Code> and{' '}
                  <Code size="inherit">mental doctor</Code>. The unscoped npm
                  package named <Code size="inherit">mental</Code> is a different
                  project. Install <Code size="inherit">@balacode/mental</Code>.
                  The binary is <Code size="inherit">mental</Code>.
                </Text>
                <Text color="secondary">
                  After that, paste the install block from the{' '}
                  <Link href={README_URL} isExternalLink>
                    README
                  </Link>{' '}
                  into your agent, or follow host plugin steps in{' '}
                  <Link href={DOCS_URL} isExternalLink>
                    the docs
                  </Link>
                  . Existing Windows installs from Mental 0.8.1 or older run{' '}
                  <Code size="inherit">mental-repair.cmd</Code> once after npm
                  updates.
                </Text>
              </VStack>
            </Section>

            <Section id="faq" variant="transparent" padding={0}>
              <VStack gap={4}>
                <VStack gap={2}>
                  <Text type="label" color="secondary">
                    FAQ
                  </Text>
                  <Heading level={2}>Short answers</Heading>
                </VStack>
                <CollapsibleGroup type="multiple" hasDividers>
                  {FAQS.map((item) => (
                    <Collapsible
                      key={item.q}
                      value={item.q}
                      trigger={item.q}
                    >
                      <Text color="secondary">{item.a}</Text>
                    </Collapsible>
                  ))}
                </CollapsibleGroup>
              </VStack>
            </Section>

            <SiteFooter />
          </VStack>
        </VStack>
      </AppShell>
    </AstryxRoot>
  );
}

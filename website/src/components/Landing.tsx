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
import {ClipboardDocumentIcon} from '@heroicons/react/24/outline';
import {useState} from 'react';
import {DOCS_URL, GITHUB_URL, INSTALL_CMD, VERSION} from '../site';
import {AstryxRoot} from './AstryxRoot';
import {DashboardDemo} from './DashboardDemo';
import {PulseTerminal} from './PulseTerminal';
import {SiteFooter} from './SiteFooter';
import {SiteHeader} from './SiteHeader';
import {WorkCycle} from './WorkCycle';

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
  return <iframe className="view-window" src={src} title={title} loading="lazy" />;
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
            <VStack id="top" gap={8} width="100%">
                <VStack id="install" className="hero-copy" gap={6} hAlign="center" maxWidth={640} width="100%">
                  <VStack gap={3} hAlign="center">
                    <Text type="label" color="secondary">
                      v{VERSION} · @balacode/mental
                    </Text>
                    <Heading level={1} type="display-2" textWrap="balance">
                      Picking up where your AI agents left off
                    </Heading>
                    <Text color="secondary" textWrap="balance">
                      Agents write the resume. You type{' '}
                      <Code size="inherit">mental</Code>.
                    </Text>
                  </VStack>
                  <Button
                    label={copied === INSTALL_CMD ? 'Copied' : INSTALL_CMD}
                    variant="primary"
                    size="lg"
                    onClick={() => copyCommand(INSTALL_CMD)}
                    endContent={
                      <Icon icon={ClipboardDocumentIcon} size="sm" color="inherit" />
                    }
                  />
                  <VStack gap={2} hAlign="center">
                    <Text type="supporting" color="secondary">
                      Then, in the project
                    </Text>
                    <HStack gap={2} wrap hAlign="center">
                      {NEXT_COMMANDS.map((command) => (
                        <Button
                          key={command}
                          label={copied === command ? 'Copied' : command}
                          variant="ghost"
                          size="sm"
                          onClick={() => copyCommand(command)}
                          endContent={
                            <Icon
                              icon={ClipboardDocumentIcon}
                              size="sm"
                              color="inherit"
                            />
                          }
                        />
                      ))}
                    </HStack>
                  </VStack>
                  <HStack gap={4} vAlign="center" hAlign="center">
                    <Link href={GITHUB_URL} isExternalLink isStandalone>
                      GitHub
                    </Link>
                    <Link href={DOCS_URL} isExternalLink isStandalone>
                      Docs
                    </Link>
                  </HStack>
                  <Text type="supporting" color="secondary">
                    Node.js 22.13 or newer. The unscoped package named{' '}
                    <Code size="inherit">mental</Code> is a different project.
                  </Text>
                </VStack>
                <DashboardDemo />
            </VStack>

            <WorkCycle />

            <VStack id="pulse" className="band" gap={4} width="100%">
                <VStack gap={2} hAlign="start">
                  <Heading level={2}>
                    You type <Code size="inherit">mental</Code>
                  </Heading>
                  <Text color="secondary">
                    The resume, the git line, and what is still open.
                  </Text>
                </VStack>
                <PulseTerminal />
            </VStack>

            <VStack id="attention" className="band" gap={5} width="100%">
                <VStack gap={2} hAlign="start">
                  <Heading level={2}>When the chat is gone</Heading>
                  <Text color="secondary">
                    Same sample session. Two things git does not keep.
                  </Text>
                </VStack>
                <Grid columns={{minWidth: 320, max: 2}} gap={4} width="100%">
                  <VStack gap={2} hAlign="start">
                    <ViewWindow
                      src="/demo/index.html?embed=1#/attention"
                      title="Attention view from the sample session"
                    />
                    <Text type="supporting" color="secondary">
                      What's still in the air.
                    </Text>
                  </VStack>
                  <VStack gap={2} hAlign="start">
                    <ViewWindow
                      src="/demo/index.html?embed=1#/decisions"
                      title="Decisions view from the sample session"
                    />
                    <Text type="supporting" color="secondary">
                      Why it stayed that way.
                    </Text>
                  </VStack>
                </Grid>
            </VStack>

            <VStack id="claude" className="band" gap={5} width="100%">
                <VStack gap={2} hAlign="start">
                  <Heading level={2}>Inside Claude Code</Heading>
                  <Text color="secondary">It reads the session. It does not write.</Text>
                </VStack>
                <Grid columns={{minWidth: 200, max: 3}} gap={6} width="100%">
                  <VStack gap={2} hAlign="start">
                    <Heading level={3}>Above the prompt</Heading>
                    <Text color="secondary">
                      Resume, pulse, and open counts, in two rows. It steps aside for a survey.
                    </Text>
                  </VStack>
                  <VStack gap={2} hAlign="start">
                    <Heading level={3}>Desktop Code tab</Heading>
                    <Text color="secondary">
                      A panel for this session. Not cloud sessions. Not WSL.
                    </Text>
                  </VStack>
                  <VStack gap={2} hAlign="start">
                    <Heading level={3}>
                      <Code size="inherit">/mental</Code>
                    </Heading>
                    <Text color="secondary">
                      Now, residue, decisions, session, and time.
                    </Text>
                  </VStack>
                </Grid>
            </VStack>

            <VStack id="privacy" className="band" gap={5} width="100%">
                <VStack gap={2} hAlign="start">
                  <Heading level={2}>What leaves this machine</Heading>
                  <Text color="secondary">
                    Journals stay here. The rest is off until you turn it on.
                  </Text>
                </VStack>
                <Grid columns={{minWidth: 200, max: 3}} gap={6} width="100%">
                  <VStack gap={2} hAlign="start">
                    <Heading level={3}>No account</Heading>
                    <Text color="secondary">
                      Default store is <Code size="inherit">~/.mental/</Code>.
                      Never commit it. Uninstall leaves the files unless you type DELETE.
                    </Text>
                  </VStack>
                  <VStack gap={2} hAlign="start">
                    <Heading level={3}>A version check</Heading>
                    <Text color="secondary">
                      Optional. Only the package version string.{' '}
                      <Code size="inherit">MENTAL_SKIP_UPDATE_CHECK=1</Code> skips it.
                      Heartbeat never checks.
                    </Text>
                  </VStack>
                  <VStack gap={2} hAlign="start">
                    <Heading level={3}>A model, if you opt in</Heading>
                    <Text color="secondary">
                      Keys stay in <Code size="inherit">~/.mental/config.json</Code>.
                      Notes are not uploaded until you store a provider key.
                    </Text>
                  </VStack>
                </Grid>
                <Link href={DOCS_URL} isExternalLink isStandalone>
                  Privacy in the docs
                </Link>
            </VStack>

            <VStack id="faq" className="band" gap={4} maxWidth={720} width="100%">
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

            <SiteFooter />
          </VStack>
        </VStack>
      </AppShell>
    </AstryxRoot>
  );
}

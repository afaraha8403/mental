import {Button} from '@astryxdesign/core/Button';
import {Grid} from '@astryxdesign/core/Grid';
import {Heading} from '@astryxdesign/core/Heading';
import {Text} from '@astryxdesign/core/Text';
import {VStack} from '@astryxdesign/core/VStack';
import {useEffect, useState} from 'react';
import {TerminalWindow, type TermRow} from './TerminalWindow';

/** One beat of a fresh install. Claims stay on screen. The terminal illustrates the active one. */
type CycleBeat = {
  id: string;
  step: string;
  claim: string;
  title: string;
  rows: TermRow[];
};

const BEATS: CycleBeat[] = [
  {
    id: 'session',
    step: 'In the session',
    claim: 'Install copies the skill. Nothing else to configure. The next chat already knows.',
    title: 'mental install',
    rows: [
      {kind: 'text', text: '~/.agents/skills/mental'},
      {kind: 'text', text: 'Cursor · Claude Code · Codex · Copilot · OpenCode'},
      {kind: 'text', text: 'Hooks, MCP, and time tracking stay off.'},
    ],
  },
  {
    id: 'work',
    step: 'While you work',
    claim: 'You stay in the task. The agent writes the resume, the decision, and what is still in the air.',
    title: 'the agent',
    rows: [
      {kind: 'pair', label: 'Resume', value: 'Ship the pointer, not the dump.'},
      {kind: 'pair', label: 'Needs eyes', value: '[verify] Resolver tests not reviewed'},
      {kind: 'pair', label: 'In the air', value: '[direction] Tom said ship the pointer'},
    ],
  },
  {
    id: 'pulse',
    step: 'Type mental',
    claim: 'You do not learn a command list. Type mental when you want the pulse.',
    title: 'mental',
    rows: [
      {kind: 'cmd', text: 'mental'},
      {kind: 'text', text: 'Ship the pointer, not the dump. Open loops: none'},
      {kind: 'pair', label: 'Git', value: 'cursor/marketing-website-aac0 (dirty)'},
    ],
  },
];

const BEAT_MS = 4800;

/**
 * How a fresh install behaves: agents already know, the person types mental.
 * Reduced motion shows every beat at once and does not advance.
 */
export function WorkCycle() {
  const [index, setIndex] = useState(0);
  const [reduced, setReduced] = useState(false);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setReduced(media.matches);
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, []);

  useEffect(() => {
    if (reduced || paused) return;
    const id = window.setInterval(() => {
      setIndex((current) => (current + 1) % BEATS.length);
    }, BEAT_MS);
    return () => window.clearInterval(id);
  }, [reduced, paused]);

  function choose(next: number) {
    setPaused(true);
    setIndex(next);
  }

  const shown = reduced ? BEATS : [BEATS[index]];

  return (
    <VStack id="cycle" className="band" gap={5} width="100%">
      <VStack gap={2} hAlign="start" maxWidth={640}>
        <Heading level={2}>It already knows</Heading>
        <Text color="secondary">
          No pre-configuration. No commands to learn. After install, your agents use it on the next chat.
        </Text>
      </VStack>
      <Grid columns={{minWidth: 280, max: 2}} gap={6} align="start" width="100%">
        <VStack gap={4} width="100%">
          {BEATS.map((beat, beatIndex) => {
            const active = reduced || beatIndex === index;
            return (
              <VStack key={beat.id} gap={2} hAlign="start" width="100%">
                <Button
                  label={beat.step}
                  size="sm"
                  variant={active ? 'primary' : 'ghost'}
                  onClick={() => choose(beatIndex)}
                />
                <Text color={active ? 'primary' : 'secondary'}>{beat.claim}</Text>
              </VStack>
            );
          })}
        </VStack>
        <VStack gap={4} width="100%">
          {shown.map((beat) => (
            <TerminalWindow
              key={beat.id}
              title={beat.title}
              rows={beat.rows}
              caret={beat.rows.some((row) => row.kind === 'cmd')}
            />
          ))}
        </VStack>
      </Grid>
    </VStack>
  );
}

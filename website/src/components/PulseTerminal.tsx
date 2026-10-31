import {TerminalWindow, type TermRow} from './TerminalWindow';

/** The sample `mental` pulse. Same session as the hero dashboard. */
const PULSE: TermRow[] = [
  {kind: 'cmd', text: 'mental'},
  {kind: 'blank'},
  {kind: 'text', text: 'Ship the pointer, not the dump. Open loops: none'},
  {kind: 'text', text: 'Against PLAN.md'},
  {kind: 'blank'},
  {kind: 'pair', label: 'Now', value: 'Resolver landed (17:27)'},
  {kind: 'pair', label: 'Git', value: 'cursor/marketing-website-aac0 (dirty)'},
  {kind: 'sub', text: '212b5b1 Release 0.13.3'},
  {kind: 'pair', label: 'Hops', value: '0'},
  {kind: 'blank'},
  {kind: 'pair', label: 'Needs eyes', value: '[verify] Resolver tests not reviewed'},
  {kind: 'pair', label: 'In the air', value: '[direction] Tom said ship the pointer'},
  {kind: 'pair', label: 'Later', value: '[thread] Come back to MCP'},
  {kind: 'pair', label: 'Unsettled', value: '[open] OKF markdown is the source of truth'},
  {kind: 'pair', label: 'Settled', value: 'Heartbeat only, no standing TUI'},
  {kind: 'blank'},
  {kind: 'foot', text: 'more · mental doctor · mental search · mental --help'},
];

/**
 * The pulse as a terminal, not a screenshot of one.
 */
export function PulseTerminal() {
  return <TerminalWindow title="mental" rows={PULSE} caret />;
}

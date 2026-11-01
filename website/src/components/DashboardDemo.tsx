import {Code} from '@astryxdesign/core/Code';
import {Text} from '@astryxdesign/core/Text';
import {VStack} from '@astryxdesign/core/VStack';
import {useColorMode, type ColorMode} from './AstryxRoot';

/**
 * Pin a demo iframe to the marketing page's color mode.
 * `?theme=` wins over the dashboard's saved theme and the OS.
 */
export function demoSrc(src: string, mode: ColorMode): string {
  const hashAt = src.indexOf('#');
  const hash = hashAt === -1 ? '' : src.slice(hashAt);
  const before = hashAt === -1 ? src : src.slice(0, hashAt);
  const url = new URL(before, 'http://local.invalid');
  url.searchParams.set('theme', mode);
  return `${url.pathname}${url.search}${hash}`;
}

/**
 * The real dashboard UI, replaying a canned sample session.
 * The frame fills the page column. On a wide screen it stays 16:9 inside that column.
 */
export function DashboardDemo() {
  const {mode} = useColorMode();
  return (
    <VStack className="hero-demo" gap={2} width="100%">
      <iframe
        key={mode}
        className="hero-demo-frame"
        src={demoSrc('/demo/index.html#/today', mode)}
        title="Sample Mental dashboard session, not your files"
      />
      <Text type="supporting" color="secondary">
        Sample session. Not your files.{' '}
        <Code size="inherit">mental dashboard</Code> is the localhost page.
      </Text>
    </VStack>
  );
}

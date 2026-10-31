import {Code} from '@astryxdesign/core/Code';
import {Text} from '@astryxdesign/core/Text';
import {VStack} from '@astryxdesign/core/VStack';

/**
 * The real dashboard UI, replaying a canned sample session.
 * The frame fills the page column. On a wide screen it stays 16:9 inside that column.
 */
export function DashboardDemo() {
  return (
    <VStack className="hero-demo" gap={2} width="100%">
      <iframe
        className="hero-demo-frame"
        src="/demo/index.html#/today"
        title="Sample Mental dashboard session, not your files"
      />
      <Text type="supporting" color="secondary">
        Sample session. Not your files.{' '}
        <Code size="inherit">mental dashboard</Code> is the localhost page.
      </Text>
    </VStack>
  );
}

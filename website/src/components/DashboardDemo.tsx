import {AspectRatio} from '@astryxdesign/core/AspectRatio';
import {Card} from '@astryxdesign/core/Card';
import {Code} from '@astryxdesign/core/Code';
import {Text} from '@astryxdesign/core/Text';
import {VStack} from '@astryxdesign/core/VStack';

/**
 * The real dashboard UI, replaying a canned sample session.
 */
export function DashboardDemo() {
  return (
    <VStack gap={2} width="100%">
      <Card padding={0} elevation="med" width="100%">
        <AspectRatio ratio={1440 / 900} fit="cover">
          <iframe
            src="/demo/index.html#/today"
            title="Sample Mental dashboard session, not your files"
            style={{border: 'none'}}
          />
        </AspectRatio>
      </Card>
      <Text type="supporting" color="secondary">
        Sample session. Not your files.{' '}
        <Code size="inherit">mental dashboard</Code> is the localhost read-only
        page over the same files.
      </Text>
    </VStack>
  );
}

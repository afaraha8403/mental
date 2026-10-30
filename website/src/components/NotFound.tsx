import {AppShell} from '@astryxdesign/core/AppShell';
import {Button} from '@astryxdesign/core/Button';
import {Heading} from '@astryxdesign/core/Heading';
import {Text} from '@astryxdesign/core/Text';
import {VStack} from '@astryxdesign/core/VStack';
import {AstryxRoot} from './AstryxRoot';
import {SiteHeader} from './SiteHeader';

export function NotFound() {
  return (
    <AstryxRoot>
      <AppShell
        variant="surface"
        contentPadding={6}
        height="auto"
        topNav={<SiteHeader />}
      >
        <VStack gap={4} padding={8} hAlign="center">
          <Heading level={1}>Page not found</Heading>
          <Text color="secondary">That URL is not on getmental.dev.</Text>
          <Button label="Back to Mental CLI" variant="primary" href="/" />
        </VStack>
      </AppShell>
    </AstryxRoot>
  );
}

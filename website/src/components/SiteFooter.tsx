import {Divider} from '@astryxdesign/core/Divider';
import {HStack} from '@astryxdesign/core/HStack';
import {Link} from '@astryxdesign/core/Link';
import {Text} from '@astryxdesign/core/Text';
import {VStack} from '@astryxdesign/core/VStack';
import {
  DOCS_URL,
  GITHUB_URL,
  LICENSE_URL,
  NPM_URL,
  README_URL,
  VERSION,
} from '../site';

export function SiteFooter() {
  return (
      <VStack gap={4} paddingBlock={8}>
        <Divider />
        <HStack gap={4} wrap>
          <Link href={README_URL} isExternalLink>
            README
          </Link>
          <Link href={DOCS_URL} isExternalLink>
            Docs
          </Link>
          <Link href={GITHUB_URL} isExternalLink>
            GitHub
          </Link>
          <Link href={NPM_URL} isExternalLink>
            npm
          </Link>
          <Link href={LICENSE_URL} isExternalLink>
            MIT license
          </Link>
        </HStack>
        <Text type="supporting" color="secondary">
          Mental CLI v{VERSION}. Local-first. No account. MIT.
        </Text>
      </VStack>
  );
}

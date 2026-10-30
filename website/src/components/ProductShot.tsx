import {AspectRatio} from '@astryxdesign/core/AspectRatio';
import {Card} from '@astryxdesign/core/Card';
import {Text} from '@astryxdesign/core/Text';
import {VStack} from '@astryxdesign/core/VStack';

export function ProductShot({
  src,
  alt,
  caption,
  width = 1440,
  height = 900,
  loading = 'lazy',
}: {
  src: string;
  alt: string;
  caption?: string;
  width?: number;
  height?: number;
  loading?: 'eager' | 'lazy';
}) {
  const webp = src.replace(/\.png$/u, '.webp');
  return (
    <VStack gap={2} width="100%">
      <Card padding={0} elevation="med" width="100%">
        <AspectRatio ratio={width / height} fit="contain">
          <img
            src={webp}
            alt={alt}
            width={width}
            height={height}
            decoding="async"
            loading={loading}
          />
        </AspectRatio>
      </Card>
      {caption ? (
        <Text type="supporting" color="secondary">
          {caption}
        </Text>
      ) : null}
    </VStack>
  );
}

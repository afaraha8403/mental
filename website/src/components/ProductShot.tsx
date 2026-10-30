import {Card} from '@astryxdesign/core/Card';
import {Text} from '@astryxdesign/core/Text';
import {VStack} from '@astryxdesign/core/VStack';

export function ProductShot({
  src,
  alt,
  caption,
  width = 1440,
  height = 900,
}: {
  src: string;
  alt: string;
  caption?: string;
  width?: number;
  height?: number;
}) {
  const webp = src.replace(/\.png$/u, '.webp');
  return (
    <VStack gap={2}>
      <Card padding={0} elevation="med" width="100%">
        <img
          className="shot"
          src={webp}
          alt={alt}
          width={width}
          height={height}
          decoding="async"
          loading="eager"
        />
      </Card>
      {caption ? (
        <Text type="supporting" color="secondary">
          {caption}
        </Text>
      ) : null}
    </VStack>
  );
}

// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import * as stylex from '@stylexjs/stylex';
import {AppShell} from '@astryxdesign/core/AppShell';
import {
  TopNav,
  TopNavHeading,
  TopNavItem,
  TopNavMegaMenu,
  TopNavMegaMenuItem,
  TopNavMegaMenuFeaturedCard,
} from '@astryxdesign/core/TopNav';
import {NavIcon} from '@astryxdesign/core/NavIcon';
import {Icon} from '@astryxdesign/core/Icon';
import type {IconType} from '@astryxdesign/core/Icon';
import {IconButton} from '@astryxdesign/core/IconButton';
import {Button} from '@astryxdesign/core/Button';
import {Badge} from '@astryxdesign/core/Badge';
import {Card} from '@astryxdesign/core/Card';
import {Grid} from '@astryxdesign/core/Grid';
import {Stack, VStack} from '@astryxdesign/core/Stack';
import {
  ShoppingBagIcon,
  ShoppingCartIcon,
  MagnifyingGlassIcon,
  SparklesIcon,
  SwatchIcon,
  TagIcon,
  HomeModernIcon,
  FaceSmileIcon,
  ReceiptPercentIcon,
  GiftIcon,
  CloudIcon,
  BoltIcon,
  SunIcon,
  StarIcon,
  FireIcon,
  GlobeAltIcon,
  MoonIcon,
} from '@heroicons/react/24/outline';

const styles = stylex.create({
  // Cap + center the page body so wide screens show whitespace gutters.
  contentMax: {maxWidth: 1100, marginInline: 'auto'},
  // Lock both mega-menu panels to an identical size. Without this, Shop and
  // Brands size to their own content (different widths); since both anchor to
  // the centered nav, switching between them resizes the panel — which reads
  // as flashing/jumping. Fixed item + featured widths make the panels
  // pixel-identical so the transition is seamless.
  megaItems: {gridColumn: '1 / -1', width: 520},
  megaFeatured: {width: 240},
});

type MegaItem = {name: string; tagline: string; icon: IconType};

// Shop and Brands each render 8 items — the mega menu's built-in 2-column grid
// lays them out as 2 columns × 4 rows, alongside a featured card.
const SHOP_ITEMS: MegaItem[] = [
  {name: 'New Arrivals', tagline: 'The latest drops', icon: SparklesIcon},
  {name: 'Womenswear', tagline: 'Dresses, knitwear & more', icon: SwatchIcon},
  {name: 'Menswear', tagline: 'Shirts, tailoring & more', icon: TagIcon},
  {name: 'Home', tagline: 'Bedding, lighting & décor', icon: HomeModernIcon},
  {
    name: 'Beauty',
    tagline: 'Skincare, fragrance & makeup',
    icon: FaceSmileIcon,
  },
  {
    name: 'Accessories',
    tagline: 'Bags, hats & sunglasses',
    icon: ShoppingBagIcon,
  },
  {name: 'Sale', tagline: 'Up to 50% off', icon: ReceiptPercentIcon},
  {name: 'Gift Cards', tagline: 'The perfect present', icon: GiftIcon},
];

const BRAND_ITEMS: MegaItem[] = [
  {name: 'Aether', tagline: 'Performance essentials', icon: SparklesIcon},
  {name: 'Northwind', tagline: 'Outdoor & technical', icon: CloudIcon},
  {name: 'Loomwell', tagline: 'Everyday knitwear', icon: BoltIcon},
  {name: 'Verdant', tagline: 'Sustainable basics', icon: SunIcon},
  {name: 'Studio Mara', tagline: 'Modern tailoring', icon: StarIcon},
  {name: 'Atelier Kos', tagline: 'Limited ateliers', icon: FireIcon},
  {name: 'Rue & Co', tagline: 'City streetwear', icon: GlobeAltIcon},
  {name: 'Halden', tagline: 'Minimal staples', icon: MoonIcon},
];

const CATEGORY_TILES = [
  'New Arrivals',
  'Womenswear',
  'Menswear',
  'Home & Living',
  'Beauty',
  'Accessories',
];

// Wraps the 8 items in a fixed-width 2-column grid so every mega menu's item
// area is exactly the same width regardless of its content.
function MegaItems({items}: {items: MegaItem[]}) {
  return (
    <Stack xstyle={styles.megaItems}>
      <Grid columns={2} gap={2}>
        {items.map(item => (
          <TopNavMegaMenuItem
            key={item.name}
            title={item.name}
            description={item.tagline}
            icon={<Icon icon={item.icon} size="md" color="secondary" />}
            href="#"
          />
        ))}
      </Grid>
    </Stack>
  );
}

// Pins the featured card to a fixed width so both panels match exactly.
function MegaFeatured(props: {
  title: string;
  description: string;
  image: string;
  imageAlt: string;
  linkLabel: string;
  linkHref: string;
}) {
  return (
    <Stack xstyle={styles.megaFeatured}>
      <TopNavMegaMenuFeaturedCard {...props} />
    </Stack>
  );
}

export default function ShellTopNav() {
  return (
    <AppShell
      variant="surface"
      contentPadding={6}
      topNav={
        <TopNav
          label="Lumen storefront navigation"
          heading={
            <TopNavHeading
              heading="Lumen"
              logo={
                <NavIcon icon={<Icon icon={ShoppingBagIcon} size="sm" />} />
              }
              headingHref="#"
            />
          }
          centerContent={
            <>
              <TopNavMegaMenu
                label="Shop"
                items={<MegaItems items={SHOP_ITEMS} />}
                featured={
                  <MegaFeatured
                    title="The Autumn Edit"
                    description="Layering staples in warm, earthy tones."
                    image="data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20400%20300%22%20preserveAspectRatio%3D%22xMidYMid%20slice%22%3E%3Crect%20width%3D%22400%22%20height%3D%22300%22%20fill%3D%22%23f5f6f8%22%2F%3E%3Cg%20transform%3D%22translate%28200%20150%29%22%20fill%3D%22none%22%20stroke%3D%22%23c2cad6%22%20stroke-width%3D%225%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Crect%20x%3D%22-44%22%20y%3D%22-44%22%20width%3D%2288%22%20height%3D%2288%22%20rx%3D%2216%22%2F%3E%3Ccircle%20cx%3D%2218%22%20cy%3D%22-18%22%20r%3D%222.5%22%20fill%3D%22%23c2cad6%22%20stroke%3D%22none%22%2F%3E%3Cpath%20d%3D%22M-34%2030%20L-8%200%20L10%2018%20L20%208%20L34%2024%22%2F%3E%3C%2Fg%3E%3C%2Fsvg%3E"
                    imageAlt="Autumn collection lookbook"
                    linkLabel="Shop the edit"
                    linkHref="#autumn-edit"
                  />
                }
              />
              <TopNavMegaMenu
                label="Brands"
                items={<MegaItems items={BRAND_ITEMS} />}
                featured={
                  <MegaFeatured
                    title="Meet Studio Mara"
                    description="Modern tailoring, made to last."
                    image="data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20400%20300%22%20preserveAspectRatio%3D%22xMidYMid%20slice%22%3E%3Crect%20width%3D%22400%22%20height%3D%22300%22%20fill%3D%22%23f5f6f8%22%2F%3E%3Cg%20transform%3D%22translate%28200%20150%29%22%20fill%3D%22none%22%20stroke%3D%22%23c2cad6%22%20stroke-width%3D%225%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Crect%20x%3D%22-44%22%20y%3D%22-44%22%20width%3D%2288%22%20height%3D%2288%22%20rx%3D%2216%22%2F%3E%3Ccircle%20cx%3D%2218%22%20cy%3D%22-18%22%20r%3D%222.5%22%20fill%3D%22%23c2cad6%22%20stroke%3D%22none%22%2F%3E%3Cpath%20d%3D%22M-34%2030%20L-8%200%20L10%2018%20L20%208%20L34%2024%22%2F%3E%3C%2Fg%3E%3C%2Fsvg%3E"
                    imageAlt="Studio Mara lookbook"
                    linkLabel="Discover the label"
                    linkHref="#studio-mara"
                  />
                }
              />
              <TopNavItem label="Sale" href="#" />
              <TopNavItem label="Service" href="#" />
            </>
          }
          endContent={
            <>
              <IconButton
                label="Search products"
                tooltip="Search"
                variant="ghost"
                icon={<Icon icon={MagnifyingGlassIcon} size="sm" />}
              />
              <Button label="Sign in" variant="ghost" />
              <Button
                label="Checkout"
                variant="primary"
                icon={<Icon icon={ShoppingCartIcon} size="sm" />}
                endContent={<Badge label={3} />}
              />
            </>
          }
        />
      }>
      <VStack gap={10} xstyle={styles.contentMax}>
        <Card variant="muted" padding={0} width="100%" height={360} />

        {[0, 1, 2].map(section => (
          <VStack key={section} gap={4}>
            <Card variant="muted" padding={0} width={200} height={24} />
            <Grid columns={{minWidth: 160, repeat: 'fit'}} gap={4}>
              {CATEGORY_TILES.map(tile => (
                <VStack key={tile} gap={2}>
                  <Card variant="muted" padding={0} width="100%" height={120} />
                  <Card variant="muted" padding={0} width="60%" height={14} />
                </VStack>
              ))}
            </Grid>
          </VStack>
        ))}
      </VStack>
    </AppShell>
  );
}

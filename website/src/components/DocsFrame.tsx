import {AppShell} from '@astryxdesign/core/AppShell';
import {HStack} from '@astryxdesign/core/HStack';
import {Icon} from '@astryxdesign/core/Icon';
import {Link} from '@astryxdesign/core/Link';
import {Text} from '@astryxdesign/core/Text';
import {VStack} from '@astryxdesign/core/VStack';
import {
  AcademicCapIcon,
  ArrowDownTrayIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  BookOpenIcon,
  ChartBarIcon,
  ClockIcon,
  CommandLineIcon,
  ComputerDesktopIcon,
  CpuChipIcon,
  FingerPrintIcon,
  LightBulbIcon,
  PencilSquareIcon,
  QuestionMarkCircleIcon,
  RectangleGroupIcon,
} from '@heroicons/react/24/outline';
import {useEffect, useState, type ComponentType, type ReactNode, type SVGProps} from 'react';
import {DOC_GROUPS, DOC_NAV, GITHUB_URL} from '../site';
import {AstryxRoot} from './AstryxRoot';
import {SiteFooter} from './SiteFooter';
import {SiteHeader} from './SiteHeader';

type DocId = (typeof DOC_NAV)[number]['id'];

/** A heading Astro extracted from the rendered markdown. */
export type DocHeading = {depth: number; slug: string; text: string};

const DOC_ICONS: Record<DocId, ComponentType<SVGProps<SVGSVGElement>>> = {
  readme: BookOpenIcon,
  install: ArrowDownTrayIcon,
  dashboard: ComputerDesktopIcon,
  hosts: RectangleGroupIcon,
  decide: LightBulbIcon,
  cli: CommandLineIcon,
  agents: CpuChipIcon,
  identity: FingerPrintIcon,
  track: ClockIcon,
  why: QuestionMarkCircleIcon,
  research: AcademicCapIcon,
  benchmarks: ChartBarIcon,
};

function sourceUrl(id: string): string {
  const file = id === 'readme' ? 'README.md' : `${id}.md`;
  return `${GITHUB_URL}/blob/main/docs/${file}`;
}

/** Tracks which outline heading is nearest the top of the viewport. */
function useActiveHeading(slugs: string[]): string | null {
  const [active, setActive] = useState<string | null>(slugs[0] ?? null);

  useEffect(() => {
    const targets = slugs
      .map((slug) => document.getElementById(slug))
      .filter((node): node is HTMLElement => node !== null);
    if (targets.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      {rootMargin: '-15% 0px -70% 0px'},
    );
    targets.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [slugs.join('|')]);

  return active;
}

/** Shell for a docs page. `current` is the markdown id (`readme`, `cli`, …). */
export function DocsFrame({
  current,
  headings = [],
  children,
}: {
  current: string;
  headings?: DocHeading[];
  children?: ReactNode;
}) {
  const id = current.toLowerCase();
  const position = DOC_NAV.findIndex((item) => item.id === id);
  const meta = DOC_NAV[position];
  const prev = position > 0 ? DOC_NAV[position - 1] : undefined;
  const next = position >= 0 && position < DOC_NAV.length - 1 ? DOC_NAV[position + 1] : undefined;
  const outline = headings.filter((heading) => heading.depth === 2);
  const active = useActiveHeading(outline.map((heading) => heading.slug));

  return (
    <AstryxRoot>
      <AppShell
        variant="surface"
        contentPadding={6}
        height="auto"
        topNav={<SiteHeader atHome={false} />}
      >
        <VStack width="100%" hAlign="center">
          <VStack className="docs-page" gap={8} width="100%">
            <HStack className="docs-frame" gap={8} width="100%" vAlign="start">
              <VStack className="docs-nav" gap={6}>
                {DOC_GROUPS.map((group) => (
                  <VStack key={group} className="docs-nav-group" gap={2}>
                    <Text className="docs-nav-heading">{group}</Text>
                    <VStack className="docs-nav-list" gap={0}>
                      {DOC_NAV.filter((item) => item.group === group).map((item) => {
                        const isCurrent = item.id === id;
                        return (
                          <HStack
                            key={item.id}
                            className={
                              isCurrent ? 'docs-nav-item docs-nav-current' : 'docs-nav-item'
                            }
                            gap={3}
                            vAlign="center"
                          >
                            <Icon
                              icon={DOC_ICONS[item.id]}
                              size="sm"
                              color={isCurrent ? 'accent' : 'secondary'}
                            />
                            {isCurrent ? (
                              <Text aria-current="page">{item.label}</Text>
                            ) : (
                              <Link href={item.href} color="secondary">
                                {item.label}
                              </Link>
                            )}
                          </HStack>
                        );
                      })}
                    </VStack>
                  </VStack>
                ))}
              </VStack>

              <VStack className="docs-body" gap={10} width="100%">
                {meta ? <Text className="docs-eyebrow">{meta.group}</Text> : null}
                {children}
                <HStack className="docs-pager" gap={4} width="100%">
                  {prev ? (
                    <VStack className="docs-pager-card" gap={1} hAlign="start">
                      <HStack gap={2} vAlign="center">
                        <Icon icon={ArrowLeftIcon} size="sm" color="secondary" />
                        <Text className="docs-pager-hint">Previous</Text>
                      </HStack>
                      <Link href={prev.href}>{prev.title}</Link>
                    </VStack>
                  ) : null}
                  {next ? (
                    <VStack className="docs-pager-card docs-pager-next" gap={1} hAlign="end">
                      <HStack gap={2} vAlign="center">
                        <Text className="docs-pager-hint">Next</Text>
                        <Icon icon={ArrowRightIcon} size="sm" color="secondary" />
                      </HStack>
                      <Link href={next.href}>{next.title}</Link>
                    </VStack>
                  ) : null}
                </HStack>
                <SiteFooter />
              </VStack>

              <VStack className="docs-toc" gap={4}>
                {outline.length > 0 ? (
                  <VStack gap={2}>
                    <Text className="docs-nav-heading">On this page</Text>
                    <VStack className="docs-toc-list" gap={0}>
                      {outline.map((heading) => (
                        <Link
                          key={heading.slug}
                          href={`#${heading.slug}`}
                          color={heading.slug === active ? 'accent' : 'secondary'}
                          className={
                            heading.slug === active ? 'docs-toc-link docs-toc-active' : 'docs-toc-link'
                          }
                        >
                          {heading.text}
                        </Link>
                      ))}
                    </VStack>
                  </VStack>
                ) : null}
                <HStack gap={2} vAlign="center">
                  <Icon icon={PencilSquareIcon} size="sm" color="secondary" />
                  <Link href={sourceUrl(id)} isExternalLink>
                    Edit on GitHub
                  </Link>
                </HStack>
              </VStack>
            </HStack>
          </VStack>
        </VStack>
      </AppShell>
    </AstryxRoot>
  );
}

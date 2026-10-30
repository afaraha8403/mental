import {Button} from '@astryxdesign/core/Button';
import {Icon} from '@astryxdesign/core/Icon';
import {IconButton} from '@astryxdesign/core/IconButton';
import {HStack} from '@astryxdesign/core/HStack';
import {TopNav, TopNavHeading, TopNavItem} from '@astryxdesign/core/TopNav';
import {ArrowTopRightOnSquareIcon} from '@heroicons/react/24/outline';
import {GITHUB_URL, INSTALL_CMD} from '../site';

export function SiteHeader() {
  return (
      <TopNav
        label="Mental CLI"
        heading={
          <TopNavHeading
            heading="Mental"
            logo={
              <img src="/logo.png" alt="" width={22} height={22} />
            }
            headingHref="/"
          />
        }
        centerContent={
          <HStack gap={1} className="nav-center">
            <TopNavItem label="How" href="#how" />
            <TopNavItem label="Features" href="#features" />
            <TopNavItem label="Privacy" href="#privacy" />
            <TopNavItem label="Install" href="#install" />
            <TopNavItem label="FAQ" href="#faq" />
          </HStack>
        }
        endContent={
          <>
            <IconButton
              id="theme-toggle"
              label="Toggle color theme"
              tooltip="Toggle color theme"
              variant="ghost"
              icon={<span className="theme-glyph" aria-hidden="true" />}
            />
            <Button
              label="GitHub"
              variant="ghost"
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              endContent={
                <Icon icon={ArrowTopRightOnSquareIcon} size="sm" color="inherit" />
              }
            />
            <Button
              label="Copy install"
              variant="primary"
              data-copy={INSTALL_CMD}
            />
          </>
        }
      />
  );
}

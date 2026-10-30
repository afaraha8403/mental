import {Button} from '@astryxdesign/core/Button';
import {Icon} from '@astryxdesign/core/Icon';
import {IconButton} from '@astryxdesign/core/IconButton';
import {TopNav, TopNavHeading, TopNavItem} from '@astryxdesign/core/TopNav';
import {
  ArrowTopRightOnSquareIcon,
  MoonIcon,
  SunIcon,
} from '@heroicons/react/24/outline';
import {GITHUB_URL, INSTALL_CMD} from '../site';
import {useColorMode} from './AstryxRoot';

const NAV = [
  {label: 'How', href: '#how'},
  {label: 'Features', href: '#features'},
  {label: 'Privacy', href: '#privacy'},
  {label: 'Install', href: '#install'},
  {label: 'FAQ', href: '#faq'},
];

function copyInstall() {
  void navigator.clipboard?.writeText(INSTALL_CMD);
}

export function SiteHeader() {
  const {mode, toggleMode} = useColorMode();
  const themeIcon = mode === 'dark' ? SunIcon : MoonIcon;
  const themeLabel =
    mode === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';

  return (
    <TopNav
      label="Mental CLI"
      heading={
        <TopNavHeading
          heading="Mental"
          logo={<img src="/logo.png" alt="" width={22} height={22} />}
          headingHref="/"
        />
      }
      centerContent={
        <>
          {NAV.map((item) => (
            <TopNavItem key={item.href} label={item.label} href={item.href} />
          ))}
        </>
      }
      endContent={
        <>
          <IconButton
            label={themeLabel}
            tooltip={themeLabel}
            variant="ghost"
            icon={<Icon icon={themeIcon} size="sm" color="inherit" />}
            onClick={toggleMode}
          />
          <IconButton
            label="GitHub"
            tooltip="GitHub"
            variant="ghost"
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            icon={
              <Icon icon={ArrowTopRightOnSquareIcon} size="sm" color="inherit" />
            }
          />
          <Button label="Copy install" variant="primary" onClick={copyInstall} />
        </>
      }
    />
  );
}

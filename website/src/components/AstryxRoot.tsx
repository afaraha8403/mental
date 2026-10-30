import type {ReactNode} from 'react';
import {Theme} from '@astryxdesign/core/theme';
import {mentalTheme} from '../themes/mental/mental.js';

export function AstryxRoot({children}: {children: ReactNode}) {
  return (
    <Theme theme={mentalTheme} mode="system">
      {children}
    </Theme>
  );
}

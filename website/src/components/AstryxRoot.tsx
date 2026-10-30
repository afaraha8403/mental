import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useState,
  type ReactNode,
} from 'react';
import {Theme} from '@astryxdesign/core/theme';
import {defaultThemeSlug, themes} from '../astryx-themes';

export type ColorMode = 'light' | 'dark';

const STORAGE_KEY = 'mental-theme';

type ColorModeContextValue = {
  mode: ColorMode;
  toggleMode: () => void;
};

const ColorModeContext = createContext<ColorModeContextValue>({
  mode: 'dark',
  toggleMode: () => {},
});

export function useColorMode(): ColorModeContextValue {
  return useContext(ColorModeContext);
}

function storedMode(): ColorMode | null {
  if (typeof localStorage === 'undefined') return null;
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === 'light' || stored === 'dark' ? stored : null;
}

export function AstryxRoot({children}: {children: ReactNode}) {
  const [mode, setMode] = useState<ColorMode>('dark');

  useLayoutEffect(() => {
    const stored = storedMode();
    if (stored) setMode(stored);
  }, []);

  const toggleMode = useCallback(() => {
    setMode((current) => {
      const next: ColorMode = current === 'dark' ? 'light' : 'dark';
      localStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  }, []);

  return (
    <ColorModeContext.Provider value={{mode, toggleMode}}>
      <Theme theme={themes[defaultThemeSlug]} mode={mode}>
        {children}
      </Theme>
    </ColorModeContext.Provider>
  );
}

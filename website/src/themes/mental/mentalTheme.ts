import {defineTheme} from '@astryxdesign/core/theme';
import {neutralTheme} from '@astryxdesign/theme-neutral';

/**
 * Mental marketing theme. Token values are copied from
 * `assets/dashboard/style.css` so the site matches the dashboard, not Astryx
 * Neutral defaults.
 */
export const mentalTheme = defineTheme({
  name: 'mental',
  extends: neutralTheme,
  typography: {
    scale: {base: 14, ratio: 1.2},
    body: {
      family: 'Inter',
      fallbacks:
        'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    },
    heading: {weight: 'semibold', weights: {1: 'bold', 2: 'bold', 3: 'semibold'}},
    code: {
      family: 'JetBrains Mono',
      fallbacks: 'ui-monospace, Menlo, Consolas, monospace',
    },
  },
  radius: {base: 6, multiplier: 1.25},
  motion: {
    fast: 140,
    medium: 200,
    slow: 400,
    ratio: 0.75,
    easing: 'cubic-bezier(0.2, 0, 0, 1)',
  },
  tokens: {
    '--color-accent': ['#0d9488', '#2dd4bf'],
    '--color-on-accent': ['#ffffff', '#042f2e'],
    '--color-text-accent': ['#0f766e', '#5eead4'],
    '--color-icon-accent': ['#0f766e', '#5eead4'],
    '--color-background-body': ['#fafafa', '#09090b'],
    '--color-background-surface': ['#ffffff', '#111114'],
    '--color-background-card': ['#ffffff', '#111114'],
    '--color-background-muted': ['#f4f4f5', '#0c0c0f'],
    '--color-background-popover': ['#ffffff', '#18181c'],
    '--color-text-primary': ['#18181b', '#ededf0'],
    '--color-text-secondary': ['#52525b', '#a1a1aa'],
    '--color-text-tertiary': ['#8b8b94', '#6e6e78'],
    '--color-border': ['#e4e4e7', '#232329'],
    '--color-border-emphasized': ['#d4d4d8', '#2e2e36'],
    '--focus-outline-color': ['#5eead4', '#14b8a6'],
    '--color-success': ['#059669', '#34d399'],
    '--color-warning': ['#d97706', '#f59e0b'],
    '--color-error': ['#e11d48', '#fb7185'],
    '--color-categorical-teal-text': ['#0d9488', '#2dd4bf'],
    '--color-categorical-pink-text': ['#db2777', '#f472b6'],
    '--color-categorical-blue-text': ['#0284c7', '#38bdf8'],
    '--color-categorical-orange-text': ['#d97706', '#f59e0b'],
    '--color-categorical-green-text': ['#059669', '#10b981'],
    '--shadow-low':
      '0 1px 2px light-dark(rgba(24, 24, 27, 0.06), rgba(0, 0, 0, 0.4))',
    '--shadow-med':
      '0 4px 12px -2px light-dark(rgba(24, 24, 27, 0.1), rgba(0, 0, 0, 0.55)), 0 2px 4px -2px light-dark(rgba(24, 24, 27, 0.06), rgba(0, 0, 0, 0.4))',
    '--shadow-high':
      '0 24px 64px -12px light-dark(rgba(24, 24, 27, 0.28), rgba(0, 0, 0, 0.7)), 0 8px 20px -8px light-dark(rgba(24, 24, 27, 0.12), rgba(0, 0, 0, 0.5))',
    '--radius-inner': '6px',
    '--radius-element': '10px',
    '--radius-container': '14px',
    '--radius-page': '20px',
    '--font-family-body':
      'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    '--font-family-heading':
      'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    '--font-family-code':
      '"JetBrains Mono", ui-monospace, Menlo, Consolas, monospace',
  },
  localTokens: {
    '--bg': ['#fafafa', '#09090b'],
    '--bg-canvas': ['#f4f4f5', '#0c0c0f'],
    '--bg-surface': ['#ffffff', '#111114'],
    '--bg-elevated': ['#ffffff', '#18181c'],
    '--bg-sunken': ['#f4f4f5', '#0b0b0d'],
    '--border-default': ['#e4e4e7', '#232329'],
    '--border-subtle': ['#ececef', '#1b1b20'],
    '--border-strong': ['#d4d4d8', '#2e2e36'],
    '--ink-primary': ['#18181b', '#ededf0'],
    '--ink-secondary': ['#52525b', '#a1a1aa'],
    '--ink-muted': ['#8b8b94', '#6e6e78'],
    '--accent': ['#0d9488', '#2dd4bf'],
    '--accent-ink': ['#0f766e', '#5eead4'],
    '--accent-soft': ['rgba(13, 148, 136, 0.1)', 'rgba(45, 212, 191, 0.14)'],
    '--on-accent': ['#ffffff', '#042f2e'],
    '--k-decision': ['#0284c7', '#38bdf8'],
    '--k-attention': ['#d97706', '#f59e0b'],
    '--k-note': ['#059669', '#10b981'],
    '--k-journal': ['#db2777', '#f472b6'],
    '--radius-sm': '6px',
    '--radius-md': '10px',
    '--radius-lg': '14px',
    '--radius-xl': '20px',
  },
  components: {
    button: {
      base: {
        borderRadius: 'var(--radius-element)',
      },
    },
    card: {
      base: {
        borderRadius: 'var(--radius-element)',
        boxShadow: 'var(--shadow-low)',
      },
    },
  },
});

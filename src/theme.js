import { createTheme } from '@mui/material/styles';

const theme = createTheme({
  palette: {
    primary: {
      50: '#eef4ff',
      main: '#2F6BFF',
      light: '#6f95ff',
      dark: '#1f4fd6',
    },
    secondary: {
      main: '#f50057',
    },
    background: {
      default: '#FAFAFB',
      paper: '#ffffff',
    },
    text: {
      primary: '#101010',
      secondary: '#5f6470',
    },
  },
  typography: {
    fontFamily: '"DM Sans", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    h1: {
      fontSize: 'clamp(2.25rem, 5vw, 4.5rem)',
      fontWeight: 800,
      lineHeight: 1.1,
    },
    h2: {
      fontSize: 'clamp(1.9rem, 3.4vw, 3rem)',
      fontWeight: 800,
      lineHeight: 1.12,
    },
    h3: {
      fontSize: 'clamp(1.65rem, 2.6vw, 2.35rem)',
      fontWeight: 800,
      lineHeight: 1.14,
    },
    h4: {
      fontSize: 'clamp(1.35rem, 2vw, 1.75rem)',
      fontWeight: 800,
      lineHeight: 1.18,
    },
    h5: {
      fontSize: 'clamp(1.15rem, 1.45vw, 1.35rem)',
      fontWeight: 800,
      lineHeight: 1.22,
    },
    body1: {
      lineHeight: 1.65,
    },
    body2: {
      lineHeight: 1.55,
    },
    button: {
      textTransform: 'none',
      fontWeight: 500,
    },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: '#FAFAFB',
          fontFeatureSettings: '"kern"',
        },
        '::selection': {
          backgroundColor: 'rgba(47, 107, 255, 0.18)',
        },
        ':focus-visible': {
          outline: '3px solid rgba(47, 107, 255, 0.45)',
          outlineOffset: 2,
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          textTransform: 'none',
          fontWeight: 700,
          minHeight: 40,
          boxShadow: 'none',
        },
        contained: {
          boxShadow: '0 8px 18px rgba(47, 107, 255, 0.18)',
          '&:hover': {
            boxShadow: '0 10px 24px rgba(47, 107, 255, 0.22)',
          },
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: '#ffffff',
          color: '#101010',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 12,
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 12,
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          fontWeight: 700,
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 8,
          },
        },
      },
    },
  },
});

export default theme;

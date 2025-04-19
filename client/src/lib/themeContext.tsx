import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useLYFEOS } from './context';

interface ThemeContextType {
  isDarkMode: boolean;
  toggleDarkMode: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { stats } = useLYFEOS();
  const [isDarkMode, setIsDarkMode] = useState(true); // Default to dark mode

  // Sync with stats when component mounts
  useEffect(() => {
    if (stats && stats.darkThemeEnabled !== undefined) {
      setIsDarkMode(stats.darkThemeEnabled);
    }
  }, [stats]);

  // Apply theme class to document
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark-theme');
      document.documentElement.classList.remove('light-theme');
    } else {
      document.documentElement.classList.add('light-theme');
      document.documentElement.classList.remove('dark-theme');
    }
  }, [isDarkMode]);

  const toggleDarkMode = () => {
    setIsDarkMode(!isDarkMode);
  };

  return (
    <ThemeContext.Provider value={{ isDarkMode, toggleDarkMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
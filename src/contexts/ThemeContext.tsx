import React, { createContext, useContext, useEffect, useState } from 'react';
import { useTheme } from 'next-themes';

interface ThemeContextType {
  theme: string;
  setTheme: (theme: string) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { theme, setTheme: setNextTheme } = useTheme();

  useEffect(() => {
    // Set default theme to system if not set
    if (!theme) {
      setNextTheme('system');
    }
  }, [theme, setNextTheme]);

  const toggleTheme = () => {
    if (theme === 'light') {
      setNextTheme('dark');
    } else if (theme === 'dark') {
      setNextTheme('system');
    } else {
      setNextTheme('light');
    }
  };

  return (
    <ThemeContext.Provider value={{ theme: theme || 'system', setTheme: setNextTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useCustomTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useCustomTheme must be used within a ThemeProvider');
  }
  return context;
};
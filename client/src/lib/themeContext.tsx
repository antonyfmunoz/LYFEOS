import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useLYFEOS } from './context';

// Function to convert hex to HSL (Hue, Saturation, Lightness)
function hexToHSL(hex: string): string {
  // Remove the # if present
  hex = hex.replace(/^#/, '');
  
  // Parse the hex values
  let r = parseInt(hex.substring(0, 2), 16) / 255;
  let g = parseInt(hex.substring(2, 4), 16) / 255;
  let b = parseInt(hex.substring(4, 6), 16) / 255;
  
  // Find min and max values for RGB
  let max = Math.max(r, g, b);
  let min = Math.min(r, g, b);
  
  // Calculate lightness
  let l = (max + min) / 2;
  
  let h: number, s: number;
  
  if (max === min) {
    // Achromatic
    h = 0;
    s = 0;
  } else {
    // Calculate saturation
    s = l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min);
    
    // Calculate hue
    switch (max) {
      case r:
        h = (g - b) / (max - min) + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / (max - min) + 2;
        break;
      case b:
        h = (r - g) / (max - min) + 4;
        break;
      default:
        h = 0;
    }
    h /= 6;
  }
  
  // Convert to degrees and percentages
  h = Math.round(h * 360);
  s = Math.round(s * 100);
  l = Math.round(l * 100);
  
  return `${h} ${s}% ${l}%`;
}

// Function to convert hex to RGB
interface RGB {
  r: number;
  g: number;
  b: number;
}

function hexToRGB(hex: string): RGB | null {
  // Remove the # if present
  hex = hex.replace(/^#/, '');
  
  // Check if it's a valid hex color
  if (!/^[0-9A-Fa-f]{6}$/.test(hex)) {
    return null;
  }
  
  // Parse the hex values
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  
  return { r, g, b };
}

interface ThemeContextType {
  isDarkMode: boolean;
  toggleDarkMode: () => void;
  primaryColor: string;
  setPrimaryColor: (color: string) => void;
}

// Create the context
const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

// Hook to access the theme context
export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}

// Provider component
function getInitialTheme(): boolean {
  const saved = localStorage.getItem('lyfeos-theme');
  if (saved) return saved === 'dark';
  return true;
}

function getInitialColor(): string {
  return "#00e0ff";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { stats, updateUserStats } = useLYFEOS();
  const [isDarkMode, setIsDarkMode] = useState(getInitialTheme);
  const [primaryColor, setPrimaryColorState] = useState(getInitialColor);

  useEffect(() => {
    if (stats) {
      if (stats.primaryColor) {
        const isOnboarding = window.location.pathname.replace(/\/+$/, '') === '/onboarding';
        if (!isOnboarding) {
          setPrimaryColorState(stats.primaryColor);
        }
      }
    }
  }, [stats]);

  // Apply theme class and primary color to document whenever they change
  useEffect(() => {
    document.documentElement.classList.add('dark-theme');
    document.documentElement.classList.remove('light-theme');
    
    // Apply primary color
    if (primaryColor) {
      // Set the primary hsl value
      const hsl = hexToHSL(primaryColor);
      document.documentElement.style.setProperty('--primary', hsl);
      document.documentElement.style.setProperty('--primary-hsl', hsl);
      document.documentElement.style.setProperty('--primary-foreground', '210 40% 98%');
      
      // Store hex value
      document.documentElement.style.setProperty('--primary-hex', primaryColor);
      
      // Create rgba values with different opacities for various UI elements
      const rgbValues = hexToRGB(primaryColor);
      if (rgbValues) {
        const { r, g, b } = rgbValues;
        
        // Set CSS variables for different opacity levels
        document.documentElement.style.setProperty('--primary-color', primaryColor);
        document.documentElement.style.setProperty('--primary-rgb', `${r}, ${g}, ${b}`);
        document.documentElement.style.setProperty('--primary-glow-light', `rgba(${r}, ${g}, ${b}, 0.3)`);
        document.documentElement.style.setProperty('--primary-glow-medium', `rgba(${r}, ${g}, ${b}, 0.5)`);
        document.documentElement.style.setProperty('--primary-glow-strong', `rgba(${r}, ${g}, ${b}, 0.7)`);
        document.documentElement.style.setProperty('--primary-bg-subtle', `rgba(${r}, ${g}, ${b}, 0.1)`);
        document.documentElement.style.setProperty('--primary-bg-light', `rgba(${r}, ${g}, ${b}, 0.2)`);
        document.documentElement.style.setProperty('--primary-border', `rgba(${r}, ${g}, ${b}, 0.4)`);
        document.documentElement.style.setProperty('--primary-border-subtle', `rgba(${r}, ${g}, ${b}, 0.2)`);
        document.documentElement.style.setProperty('--primary-shadow', `rgba(${r}, ${g}, ${b}, 0.7)`);
        
        // Update shadcn components variables
        document.documentElement.style.setProperty('--ring', hsl);
        document.documentElement.style.setProperty('--accent', `${hsl.split('%')[0]}% 5%`);
        document.documentElement.style.setProperty('--accent-foreground', hsl);
      }
    }
    
    // Save preferences to localStorage
    localStorage.setItem('lyfeos-theme', 'dark');
  }, [isDarkMode, primaryColor]);

  // Toggle dark mode function
  const toggleDarkMode = () => {
    const newDarkModeValue = !isDarkMode;
    setIsDarkMode(newDarkModeValue);
    
    // If user is logged in, update the database
    if (stats && updateUserStats) {
      updateUserStats({
        ...stats,
        darkThemeEnabled: newDarkModeValue
      });
    }
  };
  
  // Set primary color function
  const setPrimaryColor = (color: string) => {
    setPrimaryColorState(color);
    
    if (stats && updateUserStats) {
      updateUserStats({
        ...stats,
        primaryColor: color
      });
    }
  };

  return (
    <ThemeContext.Provider value={{ 
      isDarkMode, 
      toggleDarkMode,
      primaryColor,
      setPrimaryColor
    }}>
      {children}
    </ThemeContext.Provider>
  );
}
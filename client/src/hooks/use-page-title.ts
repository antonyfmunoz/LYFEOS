import { useEffect } from 'react';

/**
 * A custom hook to set the page title with a consistent format
 * @param pageTitle The specific page title to display
 */
export function usePageTitle(pageTitle: string) {
  useEffect(() => {
    // Set the document title with the page specific title
    document.title = pageTitle ? `LYFEOS - ${pageTitle}` : 'LYFEOS - Dashboard';
    
    // Restore the original title when component unmounts
    return () => {
      document.title = 'LYFEOS - Dashboard';
    };
  }, [pageTitle]);
}
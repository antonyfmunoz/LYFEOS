// Script to initialize theme
(function() {
  // Check for saved theme preference in localStorage
  const savedTheme = localStorage.getItem('lyfeos-theme');
  
  // Apply theme based on saved preference or default to dark theme
  if (savedTheme === 'light') {
    document.documentElement.classList.add('light-theme');
    document.documentElement.classList.remove('dark-theme');
  } else {
    document.documentElement.classList.add('dark-theme');
    document.documentElement.classList.remove('light-theme');
  }
})();
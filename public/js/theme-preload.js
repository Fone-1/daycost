(function () {
    try {
        const savedTheme = localStorage.getItem('daycost_theme') || 'system';
        const isSystemLight = window.matchMedia('(prefers-color-scheme: light)').matches;
        const theme = savedTheme === 'light' || (savedTheme === 'system' && isSystemLight) ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', theme);
    } catch {
        document.documentElement.setAttribute('data-theme', 'dark');
    }
}());

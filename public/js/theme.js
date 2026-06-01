(function () {
    function applyThemeToDOM(theme) {
        const isSystemLight = window.matchMedia('(prefers-color-scheme: light)').matches;
        if (theme === 'light' || (theme === 'system' && isSystemLight)) {
            document.documentElement.setAttribute('data-theme', 'light');
        } else {
            document.documentElement.setAttribute('data-theme', 'dark');
        }

        window.dispatchEvent(new Event('themechanged'));
    }

    document.addEventListener('DOMContentLoaded', () => {
        const themeSelect = document.getElementById('themeSelect');
        if (!themeSelect) return;

        const savedTheme = localStorage.getItem('daycost_theme') || 'system';
        themeSelect.value = savedTheme;

        themeSelect.addEventListener('change', (e) => {
            const newTheme = e.target.value;
            localStorage.setItem('daycost_theme', newTheme);
            applyThemeToDOM(newTheme);
        });

        window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
            if (themeSelect.value === 'system') applyThemeToDOM('system');
        });
    });

    window.addEventListener('themechanged', () => {
        if (typeof Chart === 'undefined') return;

        const isLight = document.documentElement.getAttribute('data-theme') === 'light';
        const textColor = isLight ? '#64748b' : '#cbd5e1';
        const gridColor = isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)';

        Chart.defaults.color = textColor;
        if (Chart.defaults.scale && Chart.defaults.scale.grid) {
            Chart.defaults.scale.grid.color = gridColor;
        }

        for (const id in Chart.instances) {
            Chart.instances[id].update();
        }
    });

    window.addEventListener('resize', () => {
        const activeBtn = document.querySelector('.nav-btn.active');
        const indicator = document.querySelector('.nav-indicator');
        if (activeBtn && indicator) {
            const group = activeBtn.parentElement;
            const groupRect = group.getBoundingClientRect();
            const btnRect = activeBtn.getBoundingClientRect();
            indicator.style.left = (btnRect.left - groupRect.left) + 'px';
            indicator.style.width = btnRect.width + 'px';
        }
    });
}());

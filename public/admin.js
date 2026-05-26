// --- Admin Panel Logic ---

const ACTION_LABELS = {
    login: '登录',
    record_create: '新增记录',
    record_update: '修改记录',
    record_delete: '删除记录',
    admin_reset_pwd: '重置密码',
    admin_disable: '禁用账号',
    admin_enable: '启用账号',
    admin_role_change: '角色变更',
    admin_delete_user: '删除用户'
};

function getHeaders() {
    const token = localStorage.getItem('daycost_token');
    return { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
}

function escapeHtml(str) {
    if (!str) return '';
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
}

// --- Auth Gate ---
async function verifyAdmin() {
    const token = localStorage.getItem('daycost_token');
    if (!token) { location.href = '/'; return false; }
    try {
        const res = await fetch('/api/auth/profile', { headers: getHeaders() });
        if (!res.ok) { location.href = '/'; return false; }
        const user = await res.json();
        if (user.role !== 'admin') { location.href = '/'; return false; }
        return true;
    } catch { location.href = '/'; return false; }
}

// --- Navigation ---
function initNav() {
    const navItems = document.querySelectorAll('.admin-nav-item');
    const sections = document.querySelectorAll('.admin-section');

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const target = item.getAttribute('data-section');
            navItems.forEach(n => n.classList.remove('active'));
            item.classList.add('active');
            sections.forEach(s => {
                s.classList.toggle('active', s.id === `section-${target}`);
            });
            if (target === 'overview') loadOverview();
            if (target === 'users') loadUsers();
            if (target === 'logs') loadLogs();
        });
    });
}

// --- Overview Module ---
let trendChart = null;

function animateCounter(el, target) {
    const duration = 800;
    const start = performance.now();
    const from = 0;
    const step = (now) => {
        const elapsed = now - start;
        const progress = Math.min(elapsed / duration, 1);
        const ease = 1 - Math.pow(1 - progress, 3);
        el.textContent = Math.round(from + (target - from) * ease);
        if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
}

function animateBarFill(card, fraction) {
    const fill = card.querySelector('.instrument-bar-fill');
    if (fill) {
        requestAnimationFrame(() => {
            fill.style.width = Math.min(fraction * 100, 100) + '%';
        });
    }
}

async function loadOverview() {
    try {
        const res = await fetch('/api/admin/overview', { headers: getHeaders() });
        if (!res.ok) return;
        const data = await res.json();

        // Timestamp
        const ts = document.getElementById('overviewTimestamp');
        if (ts) ts.textContent = new Date().toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

        // Animated counters
        const totalUsers = data.stats.totalUsers || 0;
        const activeUsers = data.stats.activeUsers || 0;
        const totalRecords = data.stats.totalRecords || 0;

        const elTotal = document.getElementById('statTotalUsers');
        const elActive = document.getElementById('statActiveUsers');
        const elRecords = document.getElementById('statTotalRecords');
        const elUptime = document.getElementById('statUptime');

        animateCounter(elTotal, totalUsers);
        animateCounter(elActive, activeUsers);
        animateCounter(elRecords, totalRecords);
        if (elUptime) elUptime.textContent = data.system.uptime;

        // Bar fills (relative to max for visual effect)
        const maxVal = Math.max(totalUsers, activeUsers, totalRecords, 1);
        const cards = document.querySelectorAll('.instrument-card');
        if (cards[0]) animateBarFill(cards[0], totalUsers / maxVal);
        if (cards[1]) animateBarFill(cards[1], activeUsers / maxVal);
        if (cards[2]) animateBarFill(cards[2], totalRecords / maxVal);
        if (cards[3]) animateBarFill(cards[3], 0.7); // uptime gets a static fill

        // Terminal info
        document.getElementById('sysVersion').textContent = 'v' + data.system.version;
        document.getElementById('sysNode').textContent = data.system.nodeVersion;
        document.getElementById('sysDbSize').textContent = data.system.dbSize;
        document.getElementById('sysEnv').textContent = data.system.env;
        const sysUptime = document.getElementById('sysUptime');
        if (sysUptime) sysUptime.textContent = data.system.uptime;

        renderTrendChart(data.trend);
    } catch (e) { console.error('Overview load failed', e); }
}

function renderTrendChart(trend) {
    const ctx = document.getElementById('trendChart');
    if (!ctx) return;

    const labels = trend.map(t => t.date.slice(5));
    const values = trend.map(t => t.count);

    if (trendChart) trendChart.destroy();

    // Gradient fill
    const gradient = ctx.getContext('2d').createLinearGradient(0, 0, 0, 200);
    gradient.addColorStop(0, 'rgba(245, 158, 11, 0.15)');
    gradient.addColorStop(1, 'rgba(245, 158, 11, 0.01)');

    trendChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: '新注册用户',
                data: values,
                borderColor: '#f59e0b',
                backgroundColor: gradient,
                fill: true,
                tension: 0.35,
                pointRadius: 0,
                pointHoverRadius: 5,
                pointHoverBackgroundColor: '#fbbf24',
                pointHoverBorderColor: '#0a0e1a',
                pointHoverBorderWidth: 2,
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#1a2236',
                    titleColor: '#f1f5f9',
                    bodyColor: '#94a3b8',
                    borderColor: 'rgba(255,255,255,0.08)',
                    borderWidth: 1,
                    cornerRadius: 8,
                    padding: 10,
                    titleFont: { family: "'JetBrains Mono', monospace", size: 11 },
                    bodyFont: { family: "'DM Sans', sans-serif", size: 12 }
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255,255,255,0.03)', drawBorder: false },
                    ticks: { color: '#475569', font: { family: "'JetBrains Mono', monospace", size: 10 }, maxRotation: 0 },
                    border: { display: false }
                },
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(255,255,255,0.03)', drawBorder: false },
                    ticks: { color: '#475569', font: { family: "'JetBrains Mono', monospace", size: 10 }, stepSize: 1, padding: 8 },
                    border: { display: false }
                }
            }
        }
    });
}

// --- Users Module ---
let allUsers = [];

async function loadUsers() {
    const body = document.getElementById('adminUsersList');
    body.innerHTML = '<div class="manifest-empty">加载中...</div>';
    try {
        const res = await fetch('/api/admin/users', { headers: getHeaders() });
        if (!res.ok) { body.innerHTML = '<div class="manifest-empty error">加载失败</div>'; return; }
        const data = await res.json();
        allUsers = data.data || [];
        renderUsers(allUsers);
    } catch (e) {
        body.innerHTML = `<div class="manifest-empty error">${escapeHtml(e.message)}</div>`;
    }
}

function renderUsers(users) {
    const body = document.getElementById('adminUsersList');
    const countEl = document.getElementById('userCount');
    if (countEl) countEl.textContent = users.length ? `${users.length} 位用户` : '';

    if (!users.length) {
        body.innerHTML = '<div class="manifest-empty">暂无用户</div>';
        return;
    }
    const selfId = parseInt(localStorage.getItem('daycost_user_id') || '0');

    body.innerHTML = users.map((u, i) => {
        const roleLamp = u.role === 'admin'
            ? '<span class="status-lamp lamp-admin">管理员</span>'
            : '<span class="status-lamp lamp-user">用户</span>';
        const statusLamp = u.is_disabled
            ? '<span class="status-lamp lamp-disabled">已禁用</span>'
            : '<span class="status-lamp lamp-active">正常</span>';
        const date = u.created_at ? new Date(u.created_at).toLocaleDateString('zh-CN') : '-';
        const spent = u.total_spent ? '¥' + Number(u.total_spent).toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : '¥0';
        const isSelf = u.id === selfId;

        let actions = '';
        if (isSelf) {
            actions = '<span style="color:var(--text-muted);font-size:0.72rem;font-family:JetBrains Mono,monospace">self</span>';
        } else {
            actions = `
                <div class="action-menu-wrap">
                    <button class="action-menu-btn" data-action="toggle-menu" data-id="${u.id}" data-name="${escapeHtml(u.username)}" data-disabled="${u.is_disabled}" data-role="${u.role}">···</button>
                </div>`;
        }
        return `<div class="manifest-row" style="animation-delay:${i * 0.03}s">
            <span class="manifest-cell col-id">#${u.id}</span>
            <span class="manifest-cell col-user">${escapeHtml(u.username)}</span>
            <span class="manifest-cell col-role">${roleLamp}</span>
            <span class="manifest-cell col-status">${statusLamp}</span>
            <span class="manifest-cell col-date">${date}</span>
            <span class="manifest-cell col-items">${u.total_items || 0}</span>
            <span class="manifest-cell col-spent">${spent}</span>
            <span class="manifest-cell col-actions">${actions}</span>
        </div>`;
    }).join('');
}

// Single document-level event delegation for all user actions
document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) {
        document.querySelectorAll('.action-menu.open').forEach(m => m.classList.remove('open'));
        return;
    }

    const action = btn.dataset.action;

    if (action === 'toggle-menu') {
        e.stopPropagation();
        const menu = document.getElementById('globalActionMenu');
        if (!menu) return;

        const id = btn.dataset.id;
        const name = btn.dataset.name;
        const disabled = btn.dataset.disabled;
        const role = btn.dataset.role;

        const wasOpen = menu.classList.contains('open') && menu.dataset.activeId === id;
        document.querySelectorAll('.action-menu.open').forEach(m => m.classList.remove('open'));

        if (!wasOpen) {
            menu.dataset.activeId = id;

            // Copy user info to global menu items
            const menuItems = menu.querySelectorAll('.action-menu-item');
            menuItems.forEach(item => {
                item.dataset.id = id;
                if (item.dataset.action === 'reset-pwd' || item.dataset.action === 'delete-user') {
                    item.dataset.name = name;
                }
                if (item.dataset.action === 'toggle-disable') {
                    item.dataset.disabled = disabled;
                    item.textContent = (disabled === 'true' || disabled === '1') ? '启用账号' : '禁用账号';
                }
                if (item.dataset.action === 'toggle-role') {
                    item.dataset.role = role;
                    item.textContent = role === 'admin' ? '撤销管理员' : '提升为管理员';
                }
            });

            // Position and open menu
            const rect = btn.getBoundingClientRect();
            menu.style.top = (rect.bottom + 4) + 'px';
            menu.style.right = (window.innerWidth - rect.right) + 'px';
            menu.classList.add('open');
        } else {
            delete menu.dataset.activeId;
        }
        return;
    }

    // Close all menus for any other action
    document.querySelectorAll('.action-menu.open').forEach(m => m.classList.remove('open'));

    const id = btn.dataset.id;

    if (action === 'reset-pwd') {
        const name = btn.dataset.name;
        if (!confirm(`确定要重置用户「${name}」的密码吗？`)) return;
        try {
            const res = await fetch(`/api/admin/user/${id}/reset-password`, { method: 'POST', headers: getHeaders() });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            document.getElementById('tempPwdValue').textContent = data.tempPassword;
            document.getElementById('tempPwdUsername').textContent = data.username;
            document.getElementById('tempPwdModal').classList.remove('hidden');
        } catch (err) { alert(err.message); }
    } else if (action === 'toggle-disable') {
        const currentlyDisabled = btn.dataset.disabled === '1' || btn.dataset.disabled === 'true';
        const label = currentlyDisabled ? '启用' : '禁用';
        if (!confirm(`确定要${label}该账号吗？`)) return;
        try {
            const res = await fetch(`/api/admin/user/${id}/disable`, { method: 'PUT', headers: getHeaders() });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            loadUsers();
        } catch (err) { alert(err.message); }
    } else if (action === 'toggle-role') {
        const currentRole = btn.dataset.role;
        const newRole = currentRole === 'admin' ? '普通用户' : '管理员';
        if (!confirm(`确定要将该用户角色变更为「${newRole}」吗？`)) return;
        try {
            const res = await fetch(`/api/admin/user/${id}/role`, { method: 'PUT', headers: getHeaders() });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            loadUsers();
        } catch (err) { alert(err.message); }
    } else if (action === 'delete-user') {
        const name = btn.dataset.name;
        if (!confirm(`确定要删除用户「${name}」及其所有记录吗？此操作无法撤销。`)) return;
        try {
            const res = await fetch(`/api/admin/user/${id}`, { method: 'DELETE', headers: getHeaders() });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            alert(data.message);
            loadUsers();
        } catch (err) { alert(err.message); }
    }
});

// --- Logs Module ---
let logPage = 1;
let logPages = 1;

const ACTION_LAMP_CLASS = {
    login: 'lamp-auth',
    record_create: 'lamp-record',
    record_update: 'lamp-record',
    record_delete: 'lamp-record',
    admin_reset_pwd: 'lamp-admin-action',
    admin_disable: 'lamp-admin-action',
    admin_enable: 'lamp-admin-action',
    admin_role_change: 'lamp-admin-action',
    admin_delete_user: 'lamp-danger'
};

async function loadLogs() {
    const body = document.getElementById('adminLogsList');
    body.innerHTML = '<div class="manifest-empty">加载中...</div>';

    const action = document.getElementById('logActionFilter').value;
    const user = document.getElementById('logUserSearch').value;

    try {
        const params = new URLSearchParams({ page: logPage });
        if (action) params.set('action', action);
        if (user) params.set('user', user);

        const res = await fetch(`/api/admin/logs?${params}`, { headers: getHeaders() });
        if (!res.ok) { body.innerHTML = '<div class="manifest-empty error">加载失败</div>'; return; }
        const data = await res.json();
        logPages = data.pages;

        const countEl = document.getElementById('logCount');
        if (countEl) countEl.textContent = data.total ? `${data.total} 条记录` : '';

        if (!data.data.length) {
            body.innerHTML = '<div class="manifest-empty">暂无日志</div>';
        } else {
            body.innerHTML = data.data.map((log, i) => {
                const time = new Date(log.created_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
                const actionLabel = ACTION_LABELS[log.action] || log.action;
                const lampClass = ACTION_LAMP_CLASS[log.action] || 'lamp-user';
                return `<div class="manifest-row" style="animation-delay:${i * 0.03}s">
                    <span class="manifest-cell col-time">${time}</span>
                    <span class="manifest-cell col-log-user">${escapeHtml(log.username)}</span>
                    <span class="manifest-cell col-action"><span class="status-lamp ${lampClass}">${actionLabel}</span></span>
                    <span class="manifest-cell col-detail" title="${escapeHtml(log.detail)}">${escapeHtml(log.detail)}</span>
                    <span class="manifest-cell col-ip">${escapeHtml(log.ip)}</span>
                </div>`;
            }).join('');
        }

        document.getElementById('logPageInfo').textContent = `${data.page} / ${data.pages}`;
        document.getElementById('logPrevBtn').disabled = logPage <= 1;
        document.getElementById('logNextBtn').disabled = logPage >= logPages;
    } catch (e) {
        body.innerHTML = `<div class="manifest-empty error">${escapeHtml(e.message)}</div>`;
    }
}

// --- Init ---
document.addEventListener('DOMContentLoaded', async () => {
    const ok = await verifyAdmin();
    if (!ok) return;

    document.getElementById('adminApp').classList.remove('hidden');
    document.getElementById('authGate').classList.add('hidden');

    // Store user id for self-detection
    try {
        const res = await fetch('/api/auth/profile', { headers: getHeaders() });
        if (res.ok) {
            const user = await res.json();
            localStorage.setItem('daycost_user_id', user.id || '');
        }
    } catch {}

    initNav();
    loadOverview();

    // Logout
    document.getElementById('adminLogoutBtn').addEventListener('click', () => {
        localStorage.removeItem('daycost_token');
        localStorage.removeItem('daycost_username');
        localStorage.removeItem('daycost_role');
        localStorage.removeItem('daycost_user_id');
        location.href = '/';
    });

    // Temp password modal close
    document.getElementById('tempPwdCloseBtn').addEventListener('click', () => {
        document.getElementById('tempPwdModal').classList.add('hidden');
    });

    // Users refresh
    document.getElementById('adminRefreshUsersBtn').addEventListener('click', loadUsers);

    // User search filter
    document.getElementById('userSearchInput').addEventListener('input', (e) => {
        const q = e.target.value.toLowerCase();
        const filtered = q ? allUsers.filter(u => u.username.toLowerCase().includes(q)) : allUsers;
        renderUsers(filtered);
    });

    // Logs controls
    document.getElementById('adminRefreshLogsBtn').addEventListener('click', () => { logPage = 1; loadLogs(); });
    document.getElementById('logActionFilter').addEventListener('change', () => { logPage = 1; loadLogs(); });
    document.getElementById('logUserSearch').addEventListener('input', () => { logPage = 1; loadLogs(); });
    document.getElementById('logPrevBtn').addEventListener('click', () => { if (logPage > 1) { logPage--; loadLogs(); } });
    document.getElementById('logNextBtn').addEventListener('click', () => { if (logPage < logPages) { logPage++; loadLogs(); } });
});

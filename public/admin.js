// --- Admin Panel Logic ---
// Phase 1: Integrated with main app Toast system, custom confirm dialog

const ACTION_LABELS = {
    login: '登录',
    record_create: '新增记录',
    record_update: '修改记录',
    record_delete: '删除记录',
    admin_reset_pwd: '重置密码',
    admin_disable: '禁用账号',
    admin_enable: '启用账号',
    admin_role_change: '角色变更',
    admin_delete_user: '删除用户',
    admin_settings_update: '系统设置更新',
    admin_backup_create: '创建备份',
    admin_backup_delete: '删除备份',
    admin_cache_clear: '清理缓存',
    admin_export: '导出报表'
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

// --- Toast Helpers (uses main app's window.toast) ---
function toastSuccess(message) {
    if (window.toast && typeof window.toast.success === 'function') {
        window.toast.success(message);
    } else {
        alert(message);
    }
}

function toastError(message) {
    if (window.toast && typeof window.toast.error === 'function') {
        window.toast.error(message);
    } else {
        alert(message);
    }
}

function toastInfo(message) {
    if (window.toast && typeof window.toast.info === 'function') {
        window.toast.info(message);
    }
}

// --- Custom Confirm Dialog (replaces native confirm) ---
let confirmResolve = null;

function showConfirm(message, title) {
    title = title || '确认操作';
    return new Promise((resolve) => {
        confirmResolve = resolve;
        const dialog = document.getElementById('confirmDialog');
        document.getElementById('confirmTitle').textContent = title;
        document.getElementById('confirmMessage').textContent = message;
        dialog.classList.remove('hidden');
    });
}

function initConfirmDialog() {
    const dialog = document.getElementById('confirmDialog');
    const okBtn = document.getElementById('confirmOkBtn');
    const cancelBtn = document.getElementById('confirmCancelBtn');

    okBtn.addEventListener('click', () => {
        dialog.classList.add('hidden');
        if (confirmResolve) {
            confirmResolve(true);
            confirmResolve = null;
        }
    });

    cancelBtn.addEventListener('click', () => {
        dialog.classList.add('hidden');
        if (confirmResolve) {
            confirmResolve(false);
            confirmResolve = null;
        }
    });

    // Close on overlay click
    dialog.addEventListener('click', (e) => {
        if (e.target === dialog) {
            dialog.classList.add('hidden');
            if (confirmResolve) {
                confirmResolve(false);
                confirmResolve = null;
            }
        }
    });
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
    const tabItems = document.querySelectorAll('.admin-tab-item');
    const sections = document.querySelectorAll('.admin-section');

    function switchSection(target) {
        // Update sidebar nav active state
        navItems.forEach(n => n.classList.toggle('active', n.getAttribute('data-section') === target));
        // Update bottom tabs active state
        tabItems.forEach(t => t.classList.toggle('active', t.getAttribute('data-section') === target));
        // Show/hide sections
        sections.forEach(s => {
            s.classList.toggle('active', s.id === `section-${target}`);
        });
        // Load data for the section
        if (target === 'overview') loadOverview();
        if (target === 'users') loadUsers();
        if (target === 'logs') loadLogs();
        if (target === 'analytics') loadAnalytics();
        if (target === 'settings') loadSettings();
    }

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const target = item.getAttribute('data-section');
            switchSection(target);
        });
    });

    tabItems.forEach(item => {
        item.addEventListener('click', () => {
            const target = item.getAttribute('data-section');
            switchSection(target);
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
let selectedUserIds = new Set();
let sortField = null;
let sortDir = 'asc';

async function loadUsers() {
    const body = document.getElementById('adminUsersList');
    body.innerHTML = '<div class="manifest-empty">加载中...</div>';
    try {
        const res = await fetch('/api/admin/users', { headers: getHeaders() });
        if (!res.ok) { body.innerHTML = '<div class="manifest-empty error">加载失败</div>'; return; }
        const data = await res.json();
        allUsers = data.data || [];
        clearSelection();
        applyUserFilters();
    } catch (e) {
        body.innerHTML = `<div class="manifest-empty error">${escapeHtml(e.message)}</div>`;
    }
}

/** Apply all user filters (search, role, status) and re-render */
function applyUserFilters() {
    const searchQ = document.getElementById('userSearchInput').value.toLowerCase();
    const roleFilter = document.getElementById('userRoleFilter').value;
    const statusFilter = document.getElementById('userStatusFilter').value;

    let filtered = allUsers;

    if (searchQ) {
        filtered = filtered.filter(u => u.username.toLowerCase().includes(searchQ));
    }
    if (roleFilter) {
        filtered = filtered.filter(u => u.role === roleFilter);
    }
    if (statusFilter === 'active') {
        filtered = filtered.filter(u => !u.is_disabled);
    } else if (statusFilter === 'disabled') {
        filtered = filtered.filter(u => !!u.is_disabled);
    }

    // Apply sorting
    if (sortField) {
        filtered.sort((a, b) => {
            let valA = a[sortField];
            let valB = b[sortField];
            if (sortField === 'username') {
                valA = (valA || '').toLowerCase();
                valB = (valB || '').toLowerCase();
            }
            if (valA == null) valA = '';
            if (valB == null) valB = '';
            if (typeof valA === 'number' && typeof valB === 'number') {
                return sortDir === 'asc' ? valA - valB : valB - valA;
            }
            const cmp = String(valA).localeCompare(String(valB), 'zh-CN');
            return sortDir === 'asc' ? cmp : -cmp;
        });
    }

    renderUsers(filtered);
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
        const isSelected = selectedUserIds.has(u.id);

        let actions = '';
        if (isSelf) {
            actions = '<span style="color:var(--text-muted);font-size:0.72rem;font-family:var(--font-mono)">self</span>';
        } else {
            actions = `
                <div class="action-menu-wrap">
                    <button class="action-menu-btn" data-action="toggle-menu" data-id="${u.id}" data-name="${escapeHtml(u.username)}" data-disabled="${u.is_disabled}" data-role="${u.role}">···</button>
                </div>`;
        }
        const selfClass = isSelf ? ' self-row' : '';
        const selectedClass = isSelected ? ' selected' : '';
        return `<div class="manifest-row${selfClass}${selectedClass}" data-user-id="${u.id}" style="animation-delay:${i * 0.03}s">
            <span class="manifest-cell col-checkbox">
                ${isSelf ? '' : `<input type="checkbox" class="admin-checkbox user-checkbox" data-id="${u.id}" ${isSelected ? 'checked' : ''}>`}
            </span>
            <span class="manifest-cell col-id">#${u.id}</span>
            <span class="manifest-cell col-user clickable-cell" data-action="open-drawer" data-id="${u.id}">${escapeHtml(u.username)}</span>
            <span class="manifest-cell col-role">${roleLamp}</span>
            <span class="manifest-cell col-status">${statusLamp}</span>
            <span class="manifest-cell col-date">${date}</span>
            <span class="manifest-cell col-items">${u.total_items || 0}</span>
            <span class="manifest-cell col-spent">${spent}</span>
            <span class="manifest-cell col-actions">${actions}</span>
        </div>`;
    }).join('');

    updateSelectAllState();
}

// === Batch Selection ===
function clearSelection() {
    selectedUserIds.clear();
    updateBatchToolbar();
}

function toggleUserSelection(userId, checked) {
    if (checked) {
        selectedUserIds.add(userId);
    } else {
        selectedUserIds.delete(userId);
    }
    updateBatchToolbar();
    // Update row visual
    const row = document.querySelector(`.manifest-row[data-user-id="${userId}"]`);
    if (row) row.classList.toggle('selected', checked);
    updateSelectAllState();
}

function updateSelectAllState() {
    const selectAll = document.getElementById('selectAllUsers');
    if (!selectAll) return;
    // Temporarily disable event to prevent recursive triggering
    const handler = selectAll._changeHandler;
    if (handler) selectAll.removeEventListener('change', handler);
    
    const checkboxes = document.querySelectorAll('.user-checkbox');
    const checkedCount = document.querySelectorAll('.user-checkbox:checked').length;
    selectAll.checked = checkboxes.length > 0 && checkedCount === checkboxes.length;
    selectAll.indeterminate = checkedCount > 0 && checkedCount < checkboxes.length;
    
    // Re-enable event
    if (handler) selectAll.addEventListener('change', handler);
}

function updateBatchToolbar() {
    const toolbar = document.getElementById('batchToolbar');
    const countEl = document.getElementById('batchCount');
    if (!toolbar) return;
    const count = selectedUserIds.size;
    countEl.textContent = count;
    toolbar.classList.toggle('hidden', count === 0);
}

async function batchOperation(action) {
    const count = selectedUserIds.size;
    if (count === 0) return;

    const labels = { disable: '禁用', enable: '启用', delete: '删除' };
    const label = labels[action] || action;
    const title = action === 'delete' ? '危险操作' : '确认操作';
    const message = action === 'delete'
        ? `确定要删除选中的 ${count} 个用户及其所有数据吗？此操作无法撤销。`
        : `确定要${label}选中的 ${count} 个用户吗？`;

    const confirmed = await showConfirm(message, title);
    if (!confirmed) return;

    try {
        const res = await fetch('/api/admin/users/batch', {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ action, userIds: Array.from(selectedUserIds) })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        toastSuccess(data.message || `批量${label}成功`);
        selectedUserIds.clear();
        updateBatchToolbar();
        loadUsers();
    } catch (err) {
        toastError(err.message);
    }
}

// === User Detail Drawer ===
async function openUserDrawer(userId) {
    const drawer = document.getElementById('userDrawer');
    const body = document.getElementById('drawerBody');
    const title = document.getElementById('drawerTitle');
    drawer.classList.remove('hidden');
    body.innerHTML = '<div class="drawer-loading">加载中...</div>';

    try {
        const res = await fetch(`/api/admin/users/${userId}/detail`, { headers: getHeaders() });
        if (!res.ok) throw new Error('加载失败');
        const data = await res.json();
        const u = data.user;
        title.textContent = `用户详情 - ${u.username}`;

        const roleLabel = u.role === 'admin' ? '管理员' : '普通用户';
        const statusLabel = u.is_disabled ? '已禁用' : '正常';
        const statusClass = u.is_disabled ? 'lamp-disabled' : 'lamp-active';
        const createdDate = u.created_at ? new Date(u.created_at).toLocaleString('zh-CN') : '-';
        const spent = u.total_spent ? '¥' + Number(u.total_spent).toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : '¥0';

        // Build activity list
        let activityHtml = '';
        if (data.recentLogs && data.recentLogs.length) {
            activityHtml = data.recentLogs.map(log => {
                const time = new Date(log.created_at).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
                const actionLabel = ACTION_LABELS[log.action] || log.action;
                const lampClass = ACTION_LAMP_CLASS[log.action] || 'lamp-user';
                return `<div class="drawer-activity-item">
                    <span class="drawer-activity-time">${time}</span>
                    <span class="drawer-activity-action"><span class="status-lamp ${lampClass}">${actionLabel}</span></span>
                    <span class="drawer-activity-detail" title="${escapeHtml(log.detail)}">${escapeHtml(log.detail || '-')}</span>
                </div>`;
            }).join('');
        } else {
            activityHtml = '<div style="color:var(--text-muted);font-size:0.8rem;padding:var(--space-2)">暂无操作记录</div>';
        }

        // Build recent records
        let recordsHtml = '';
        if (data.recentRecords && data.recentRecords.length) {
            recordsHtml = data.recentRecords.map(r => {
                const time = new Date(r.created_at).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
                const price = r.price ? '¥' + Number(r.price).toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : '-';
                return `<div class="drawer-activity-item">
                    <span class="drawer-activity-time">${time}</span>
                    <span class="drawer-activity-detail">${escapeHtml(r.name)}</span>
                    <span style="color:var(--primary);font-family:var(--font-mono);font-size:0.78rem;flex-shrink:0">${price}</span>
                </div>`;
            }).join('');
        } else {
            recordsHtml = '<div style="color:var(--text-muted);font-size:0.8rem;padding:var(--space-2)">暂无记录</div>';
        }

        body.innerHTML = `
            <div class="drawer-user-card">
                <div class="drawer-user-avatar">${u.username.charAt(0).toUpperCase()}</div>
                <div class="drawer-user-info">
                    <h4>${escapeHtml(u.username)}</h4>
                    <div class="drawer-user-meta">
                        <span><span class="status-lamp ${u.role === 'admin' ? 'lamp-admin' : 'lamp-user'}">${roleLabel}</span></span>
                        <span><span class="status-lamp ${statusClass}">${statusLabel}</span></span>
                    </div>
                    <div style="font-size:0.72rem;color:var(--text-muted);margin-top:4px">注册于 ${createdDate}</div>
                </div>
            </div>

            <div class="drawer-stats">
                <div class="drawer-stat-item">
                    <div class="drawer-stat-value">${u.total_items || 0}</div>
                    <div class="drawer-stat-label">物品数</div>
                </div>
                <div class="drawer-stat-item">
                    <div class="drawer-stat-value">${spent}</div>
                    <div class="drawer-stat-label">总投入</div>
                </div>
                <div class="drawer-stat-item">
                    <div class="drawer-stat-value">#${u.id}</div>
                    <div class="drawer-stat-label">用户 ID</div>
                </div>
            </div>

            <div class="drawer-section">
                <div class="drawer-section-title">操作</div>
                <div class="drawer-actions">
                    <button class="drawer-action-btn" data-action="reset-pwd" data-id="${u.id}" data-name="${escapeHtml(u.username)}">
                        <span class="drawer-action-icon">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                        </span>
                        重置密码
                    </button>
                    <button class="drawer-action-btn" data-action="toggle-disable" data-id="${u.id}" data-disabled="${u.is_disabled}" data-role="${u.role}">
                        <span class="drawer-action-icon">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${u.is_disabled ? '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline>' : '<circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>'}</svg>
                        </span>
                        ${u.is_disabled ? '启用账号' : '禁用账号'}
                    </button>
                    <button class="drawer-action-btn" data-action="toggle-role" data-id="${u.id}" data-role="${u.role}">
                        <span class="drawer-action-icon">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                        </span>
                        ${u.role === 'admin' ? '撤销管理员' : '提升为管理员'}
                    </button>
                    <button class="drawer-action-btn danger-action" data-action="delete-user" data-id="${u.id}" data-name="${escapeHtml(u.username)}">
                        <span class="drawer-action-icon">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        </span>
                        删除用户
                    </button>
                </div>
            </div>

            <div class="drawer-section">
                <div class="drawer-section-title">最近记录 (${data.recentRecords ? data.recentRecords.length : 0})</div>
                <div class="drawer-activity-list">${recordsHtml}</div>
            </div>

            <div class="drawer-section">
                <div class="drawer-section-title">操作历史 (${data.recentLogs ? data.recentLogs.length : 0})</div>
                <div class="drawer-activity-list">${activityHtml}</div>
            </div>
        `;
    } catch (err) {
        body.innerHTML = `<div class="drawer-loading" style="color:var(--danger)">加载失败：${escapeHtml(err.message)}</div>`;
    }
}

function closeDrawer() {
    document.getElementById('userDrawer').classList.add('hidden');
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
        const confirmed = await showConfirm(`确定要重置用户「${name}」的密码吗？`);
        if (!confirmed) return;
        try {
            const res = await fetch(`/api/admin/user/${id}/reset-password`, { method: 'POST', headers: getHeaders() });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            document.getElementById('tempPwdValue').textContent = data.tempPassword;
            document.getElementById('tempPwdUsername').textContent = data.username;
            document.getElementById('tempPwdModal').classList.remove('hidden');
        } catch (err) { toastError(err.message); }
    } else if (action === 'toggle-disable') {
        const currentlyDisabled = btn.dataset.disabled === '1' || btn.dataset.disabled === 'true';
        const label = currentlyDisabled ? '启用' : '禁用';
        const confirmed = await showConfirm(`确定要${label}该账号吗？`);
        if (!confirmed) return;
        try {
            const res = await fetch(`/api/admin/user/${id}/disable`, { method: 'PUT', headers: getHeaders() });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            toastSuccess(`账号已${label}`);
            loadUsers();
        } catch (err) { toastError(err.message); }
    } else if (action === 'toggle-role') {
        const currentRole = btn.dataset.role;
        const newRole = currentRole === 'admin' ? '普通用户' : '管理员';
        const confirmed = await showConfirm(`确定要将该用户角色变更为「${newRole}」吗？`);
        if (!confirmed) return;
        try {
            const res = await fetch(`/api/admin/user/${id}/role`, { method: 'PUT', headers: getHeaders() });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            toastSuccess(`角色已变更为${newRole}`);
            loadUsers();
        } catch (err) { toastError(err.message); }
    } else if (action === 'delete-user') {
        const name = btn.dataset.name;
        const confirmed = await showConfirm(`确定要删除用户「${name}」及其所有记录吗？此操作无法撤销。`, '危险操作');
        if (!confirmed) return;
        try {
            const res = await fetch(`/api/admin/user/${id}`, { method: 'DELETE', headers: getHeaders() });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            toastSuccess(data.message || '用户已删除');
            loadUsers();
        } catch (err) { toastError(err.message); }
    }
});

// --- Analytics Module ---
let growthChart = null;
let activityChart = null;
let assetsChart = null;
let peakHoursChart = null;
let currentAnalyticsRange = '30d';

async function loadAnalytics() {
    const rangeEl = document.getElementById('analyticsTimeRange');
    const range = rangeEl ? rangeEl.value : '30d';
    currentAnalyticsRange = range;

    try {
        // Load all three datasets in parallel
        const [growthRes, activityRes, assetsRes] = await Promise.all([
            fetch(`/api/admin/analytics/growth?range=${range}`, { headers: getHeaders() }),
            fetch(`/api/admin/analytics/activity?range=${range}`, { headers: getHeaders() }),
            fetch(`/api/admin/analytics/assets`, { headers: getHeaders() })
        ]);

        if (!growthRes.ok || !activityRes.ok || !assetsRes.ok) {
            toastError('数据加载失败');
            return;
        }

        const growthData = await growthRes.json();
        const activityData = await activityRes.json();
        const assetsData = await assetsRes.json();

        // Update summary cards
        animateCounter(document.getElementById('analyticsTotalUsers'), growthData.totalUsers);
        document.getElementById('analyticsGrowthRate').textContent = growthData.growthRate;
        animateCounter(document.getElementById('analyticsActiveUsers'), activityData.activeUsers);
        const totalForRate = growthData.totalUsers || 1;
        document.getElementById('analyticsActiveRate').textContent = `${Math.round(activityData.activeUsers / totalForRate * 100)}% 活跃率`;
        document.getElementById('analyticsAvgSpent').textContent = '¥' + Math.round(assetsData.stats.avg || 0).toLocaleString();
        document.getElementById('analyticsSpentRange').textContent = `最高 ¥${Math.round(assetsData.stats.max || 0).toLocaleString()}`;
        const avgDaily = activityData.dailyActive && activityData.dailyActive.length
            ? Math.round(activityData.dailyActive.reduce((s, d) => s + d.active_count, 0) / activityData.dailyActive.length)
            : 0;
        animateCounter(document.getElementById('analyticsDailyActive'), avgDaily);
        const peakHour = activityData.peakHours && activityData.peakHours.length
            ? activityData.peakHours.reduce((max, h) => h.count > max.count ? h : max, activityData.peakHours[0])
            : null;
        document.getElementById('analyticsPeakHour').textContent = peakHour ? `${peakHour.hour}:00 高峰` : '--';

        // Bar fills on summary cards
        const cards = document.querySelectorAll('.analytics-summary-card');
        const maxVal = Math.max(growthData.totalUsers, activityData.activeUsers, avgDaily, 1);
        if (cards[0]) animateBarFill(cards[0], growthData.totalUsers / maxVal);
        if (cards[1]) animateBarFill(cards[1], activityData.activeUsers / maxVal);
        if (cards[2]) animateBarFill(cards[2], 0.7);
        if (cards[3]) animateBarFill(cards[3], avgDaily / maxVal);

        // Update growth subtitle
        const rangeLabels = { '7d': '近 7 天', '30d': '近 30 天', '90d': '近 90 天', '12m': '近 12 月' };
        const growthSubtitle = document.getElementById('growthSubtitle');
        if (growthSubtitle) growthSubtitle.textContent = rangeLabels[range] || '近 30 天';

        // Render charts
        renderGrowthChart(growthData);
        renderActivityChart(activityData);
        renderAssetsChart(assetsData);
        renderPeakHoursChart(activityData);
        renderTopSpenders(assetsData);
    } catch (e) {
        console.error('Analytics load failed', e);
        toastError('数据加载失败');
    }
}

function renderGrowthChart(data) {
    const ctx = document.getElementById('growthChart');
    if (!ctx) return;
    if (growthChart) growthChart.destroy();

    const isMonthly = currentAnalyticsRange === '12m';
    const labels = data.daily ? data.daily.map(d => isMonthly ? d.date.slice(0, 7) : d.date.slice(5)) : [];
    const values = data.daily ? data.daily.map(d => d.count) : [];

    // Compute cumulative line
    let cumulative = [];
    let running = (data.totalUsers || 0) - values.reduce((s, v) => s + v, 0);
    values.forEach(v => { running += v; cumulative.push(running); });

    const gradient = ctx.getContext('2d').createLinearGradient(0, 0, 0, 200);
    gradient.addColorStop(0, 'rgba(245, 158, 11, 0.15)');
    gradient.addColorStop(1, 'rgba(245, 158, 11, 0.01)');

    const blueGradient = ctx.getContext('2d').createLinearGradient(0, 0, 0, 200);
    blueGradient.addColorStop(0, 'rgba(59, 130, 246, 0.12)');
    blueGradient.addColorStop(1, 'rgba(59, 130, 246, 0.01)');

    growthChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: '新增用户',
                    data: values,
                    borderColor: '#f59e0b',
                    backgroundColor: gradient,
                    fill: true,
                    tension: 0.35,
                    pointRadius: 0,
                    pointHoverRadius: 5,
                    borderWidth: 2
                },
                {
                    label: '累计用户',
                    data: cumulative,
                    borderColor: '#3b82f6',
                    backgroundColor: blueGradient,
                    fill: true,
                    tension: 0.35,
                    pointRadius: 0,
                    pointHoverRadius: 5,
                    borderWidth: 2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: { color: '#94a3b8', font: { family: "'DM Sans'", size: 11 }, boxWidth: 12 }
                },
                tooltip: {
                    backgroundColor: '#1a2236',
                    titleColor: '#f1f5f9',
                    bodyColor: '#94a3b8',
                    borderColor: 'rgba(255,255,255,0.08)',
                    borderWidth: 1,
                    cornerRadius: 8,
                    padding: 10
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255,255,255,0.03)', drawBorder: false },
                    ticks: { color: '#475569', font: { family: "'JetBrains Mono'", size: 10 }, maxRotation: 0 },
                    border: { display: false }
                },
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(255,255,255,0.03)', drawBorder: false },
                    ticks: { color: '#475569', font: { family: "'JetBrains Mono'", size: 10 }, stepSize: 1, padding: 8 },
                    border: { display: false }
                }
            }
        }
    });
}

function renderActivityChart(data) {
    const ctx = document.getElementById('activityChart');
    if (!ctx) return;
    if (activityChart) activityChart.destroy();

    const dist = data.actionDistribution || [];
    if (!dist.length) {
        activityChart = null;
        return;
    }

    const labels = dist.map(d => ACTION_LABELS[d.action] || d.action);
    const values = dist.map(d => d.count);
    const colors = dist.map(d => {
        const lampClass = ACTION_LAMP_CLASS[d.action] || 'lamp-user';
        const colorMap = {
            'lamp-auth': '#3b82f6',
            'lamp-record': '#10b981',
            'lamp-admin-action': '#f59e0b',
            'lamp-danger': '#ef4444',
            'lamp-user': '#93c5fd'
        };
        return colorMap[lampClass] || '#94a3b8';
    });

    activityChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                data: values,
                backgroundColor: colors.map(c => c + '33'),
                borderColor: colors,
                borderWidth: 2,
                hoverOffset: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '60%',
            plugins: {
                legend: {
                    position: 'right',
                    labels: { color: '#94a3b8', font: { family: "'DM Sans'", size: 11 }, padding: 8, boxWidth: 12 }
                },
                tooltip: {
                    backgroundColor: '#1a2236',
                    titleColor: '#f1f5f9',
                    bodyColor: '#94a3b8',
                    borderColor: 'rgba(255,255,255,0.08)',
                    borderWidth: 1,
                    cornerRadius: 8
                }
            }
        }
    });
}

function renderAssetsChart(data) {
    const ctx = document.getElementById('assetsChart');
    if (!ctx) return;
    if (assetsChart) assetsChart.destroy();

    const dist = data.spendDistribution || [];
    const labels = dist.map(d => '¥' + d.range);
    const values = dist.map(d => d.count);
    const barColors = ['#94a3b8', '#60a5fa', '#3b82f6', '#f59e0b', '#ef4444'];

    assetsChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: '用户数',
                data: values,
                backgroundColor: values.map((_, i) => barColors[i % barColors.length] + '33'),
                borderColor: values.map((_, i) => barColors[i % barColors.length]),
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#1a2236',
                    titleColor: '#f1f5f9',
                    bodyColor: '#94a3b8',
                    borderColor: 'rgba(255,255,255,0.08)',
                    borderWidth: 1,
                    cornerRadius: 8
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: '#475569', font: { family: "'JetBrains Mono'", size: 10 } },
                    border: { display: false }
                },
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(255,255,255,0.03)', drawBorder: false },
                    ticks: { color: '#475569', font: { family: "'JetBrains Mono'", size: 10 }, stepSize: 1 },
                    border: { display: false }
                }
            }
        }
    });
}

function renderPeakHoursChart(data) {
    const ctx = document.getElementById('peakHoursChart');
    if (!ctx) return;
    if (peakHoursChart) peakHoursChart.destroy();

    // Fill all 24 hours, missing hours get 0
    const hours = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));
    const counts = hours.map(h => {
        const found = (data.peakHours || []).find(p =>
            p.hour === h || parseInt(p.hour) === parseInt(h)
        );
        return found ? found.count : 0;
    });

    const gradient = ctx.getContext('2d').createLinearGradient(0, 0, 0, 200);
    gradient.addColorStop(0, 'rgba(16, 185, 129, 0.2)');
    gradient.addColorStop(1, 'rgba(16, 185, 129, 0.01)');

    peakHoursChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: hours.map(h => h + ':00'),
            datasets: [{
                label: '操作数',
                data: counts,
                backgroundColor: gradient,
                borderColor: '#10b981',
                borderWidth: 1,
                borderRadius: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#1a2236',
                    titleColor: '#f1f5f9',
                    bodyColor: '#94a3b8',
                    borderColor: 'rgba(255,255,255,0.08)',
                    borderWidth: 1,
                    cornerRadius: 8
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: {
                        color: '#475569',
                        font: { family: "'JetBrains Mono'", size: 9 },
                        maxRotation: 0,
                        callback: function(val, idx) { return idx % 3 === 0 ? this.getLabelForValue(val) : ''; }
                    },
                    border: { display: false }
                },
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(255,255,255,0.03)', drawBorder: false },
                    ticks: { color: '#475569', font: { family: "'JetBrains Mono'", size: 10 } },
                    border: { display: false }
                }
            }
        }
    });
}

function renderTopSpenders(data) {
    const body = document.getElementById('topSpendersList');
    if (!body) return;
    const spenders = (data.topSpenders || []).slice(0, 10);
    if (!spenders.length) {
        body.innerHTML = '<div class="manifest-empty">暂无数据</div>';
        return;
    }
    body.innerHTML = spenders.map((s, i) => {
        const spent = s.total_spent
            ? '¥' + Number(s.total_spent).toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
            : '¥0';
        return `<div class="manifest-row" style="animation-delay:${i * 0.03}s">
            <span class="manifest-cell col-rank">${i + 1}</span>
            <span class="manifest-cell col-spender-user">${escapeHtml(s.username)}</span>
            <span class="manifest-cell col-spender-items">${s.total_items || 0}</span>
            <span class="manifest-cell col-spender-total" style="color:var(--primary);font-family:var(--font-mono)">${spent}</span>
        </div>`;
    }).join('');
}

async function exportAnalyticsReport() {
    try {
        const res = await fetch('/api/admin/analytics/export', {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ type: 'full' })
        });
        if (!res.ok) throw new Error('导出失败');
        const data = await res.json();

        // Create download blob
        const blob = new Blob([data.csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = data.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toastSuccess('报表已导出');
    } catch (err) {
        toastError(err.message);
    }
}

// --- Settings Module ---
async function loadSettings() {
    try {
        const res = await fetch('/api/admin/settings', { headers: getHeaders() });
        if (!res.ok) { toastError('加载设置失败'); return; }
        const data = await res.json();

        // System info
        document.getElementById('settingsVersion').textContent = 'v' + data.system.version;
        document.getElementById('settingsEnv').textContent = data.system.env;
        document.getElementById('settingsDbSize').textContent = data.system.dbSize;
        document.getElementById('settingsMemUsage').textContent = data.system.memoryUsage;
        const uptimeSec = parseInt(data.system.uptime);
        const days = Math.floor(uptimeSec / 86400);
        const hours = Math.floor((uptimeSec % 86400) / 3600);
        document.getElementById('settingsUptime').textContent = days > 0 ? `${days}天${hours}小时` : `${hours}小时`;
        document.getElementById('settingsBackupCount').textContent = `${data.system.backupCount} 个 (${data.system.backupSize})`;
        document.getElementById('cacheDbSize').textContent = data.system.dbSize;

        // Settings form
        document.getElementById('settingSiteName').value = data.settings.site_name || '';
        document.getElementById('settingRegistration').checked = data.settings.registration_enabled === 'true';
        document.getElementById('settingMaintenance').checked = data.settings.maintenance_mode === 'true';
        document.getElementById('settingMaxRecords').value = data.settings.max_records_per_user || '0';
        document.getElementById('settingSessionTimeout').value = data.settings.session_timeout || '7';

        // Load backup list
        loadBackupList();
    } catch (e) {
        console.error('Settings load failed', e);
        toastError('加载设置失败');
    }
}

async function saveSettings() {
    const settings = {
        site_name: document.getElementById('settingSiteName').value.trim(),
        registration_enabled: document.getElementById('settingRegistration').checked ? 'true' : 'false',
        maintenance_mode: document.getElementById('settingMaintenance').checked ? 'true' : 'false',
        max_records_per_user: document.getElementById('settingMaxRecords').value || '0',
        session_timeout: document.getElementById('settingSessionTimeout').value || '7'
    };

    try {
        const res = await fetch('/api/admin/settings', {
            method: 'PUT',
            headers: getHeaders(),
            body: JSON.stringify({ settings })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        toastSuccess('设置已保存');
    } catch (err) {
        toastError(err.message);
    }
}

async function loadBackupList() {
    const listEl = document.getElementById('backupList');
    try {
        const res = await fetch('/api/admin/backup/list', { headers: getHeaders() });
        if (!res.ok) { listEl.innerHTML = '<div class="manifest-empty error">加载失败</div>'; return; }
        const data = await res.json();

        if (!data.backups.length) {
            listEl.innerHTML = '<div class="manifest-empty">暂无备份</div>';
            return;
        }

        listEl.innerHTML = data.backups.map((b, i) => {
            const date = new Date(b.created_at).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
            return `<div class="backup-item" style="animation-delay:${i * 0.03}s">
                <div class="backup-item-info">
                    <span class="backup-item-name">${escapeHtml(b.filename)}</span>
                    <span class="backup-item-meta">${date} · ${b.size}</span>
                </div>
                <button class="backup-item-delete" data-filename="${escapeHtml(b.filename)}" title="删除">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
            </div>`;
        }).join('');
    } catch (e) {
        listEl.innerHTML = '<div class="manifest-empty error">加载失败</div>';
    }
}

async function createBackup() {
    try {
        toastInfo('正在创建备份...');
        const res = await fetch('/api/admin/backup', { method: 'POST', headers: getHeaders() });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        toastSuccess(`备份创建成功 (${data.size})`);
        loadBackupList();
        loadSettings(); // Refresh backup count
    } catch (err) {
        toastError(err.message);
    }
}

async function clearCache() {
    const confirmed = await showConfirm('确定要清理缓存吗？此操作会优化数据库并释放空间，期间可能短暂影响访问。');
    if (!confirmed) return;

    try {
        toastInfo('正在清理缓存...');
        const res = await fetch('/api/admin/cache/clear', { method: 'POST', headers: getHeaders() });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        toastSuccess(`缓存清理完成，释放 ${data.freed}`);
        document.getElementById('cacheDbSize').textContent = data.dbSizeAfter;
        document.getElementById('cacheLastClear').textContent = new Date().toLocaleString('zh-CN');
        document.getElementById('settingsDbSize').textContent = data.dbSizeAfter;
    } catch (err) {
        toastError(err.message);
    }
}

async function deleteBackup(filename) {
    const confirmed = await showConfirm(`确定要删除备份文件「${filename}」吗？`);
    if (!confirmed) return;

    try {
        const res = await fetch(`/api/admin/backup/${encodeURIComponent(filename)}`, { method: 'DELETE', headers: getHeaders() });
        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error);
        }
        toastSuccess('备份已删除');
        loadBackupList();
        loadSettings();
    } catch (err) {
        toastError(err.message);
    }
}

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
    admin_delete_user: 'lamp-danger',
    admin_settings_update: 'lamp-admin-action',
    admin_backup_create: 'lamp-admin-action',
    admin_backup_delete: 'lamp-admin-action',
    admin_cache_clear: 'lamp-admin-action',
    admin_export: 'lamp-admin-action'
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
            // Update avatar
            const avatarEl = document.getElementById('adminAvatar');
            if (avatarEl && user.username) {
                avatarEl.title = user.username;
                const avatarIcon = avatarEl.querySelector('.admin-avatar-icon');
                if (avatarIcon) avatarIcon.textContent = user.username.charAt(0).toUpperCase();
            }
        }
    } catch {}

    // Initialize custom confirm dialog
    initConfirmDialog();

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
    document.getElementById('userSearchInput').addEventListener('input', applyUserFilters);

    // User role filter
    document.getElementById('userRoleFilter').addEventListener('change', applyUserFilters);

    // User status filter
    document.getElementById('userStatusFilter').addEventListener('change', applyUserFilters);

    // Select all checkbox
    const selectAllHandler = (e) => {
        const checked = e.target.checked;
        const selfId = parseInt(localStorage.getItem('daycost_user_id') || '0');
        document.querySelectorAll('.user-checkbox').forEach(cb => {
            const id = parseInt(cb.dataset.id, 10);
            if (id !== selfId) {
                cb.checked = checked;
                toggleUserSelection(id, checked);
            }
        });
    };
    const selectAllEl = document.getElementById('selectAllUsers');
    selectAllEl.addEventListener('change', selectAllHandler);
    selectAllEl._changeHandler = selectAllHandler;

    // Individual checkbox clicks (event delegation)
    document.getElementById('adminUsersList').addEventListener('change', (e) => {
        if (e.target.classList.contains('user-checkbox')) {
            const id = parseInt(e.target.dataset.id, 10);
            toggleUserSelection(id, e.target.checked);
        }
    });

    // Row click to open drawer (event delegation on username cells)
    document.getElementById('adminUsersList').addEventListener('click', (e) => {
        const cell = e.target.closest('.clickable-cell');
        if (cell) {
            const userId = parseInt(cell.dataset.id, 10);
            openUserDrawer(userId);
        }
    });

    // Batch toolbar buttons
    document.getElementById('batchDisableBtn').addEventListener('click', () => batchOperation('disable'));
    document.getElementById('batchEnableBtn').addEventListener('click', () => batchOperation('enable'));
    document.getElementById('batchDeleteBtn').addEventListener('click', () => batchOperation('delete'));
    document.getElementById('batchCancelBtn').addEventListener('click', () => {
        selectedUserIds.clear();
        updateBatchToolbar();
        document.querySelectorAll('.user-checkbox').forEach(cb => cb.checked = false);
        document.querySelectorAll('.manifest-row.selected').forEach(r => r.classList.remove('selected'));
        updateSelectAllState();
    });

    // Column sort clicks
    document.querySelectorAll('[data-sort]').forEach(th => {
        th.addEventListener('click', () => {
            const field = th.dataset.sort;
            if (sortField === field) {
                sortDir = sortDir === 'asc' ? 'desc' : 'asc';
            } else {
                sortField = field;
                sortDir = 'asc';
            }
            // Update sort indicators
            document.querySelectorAll('[data-sort]').forEach(el => {
                el.classList.remove('sort-active');
                el.querySelector('.sort-indicator').textContent = '';
            });
            th.classList.add('sort-active');
            th.querySelector('.sort-indicator').textContent = sortDir === 'asc' ? '▲' : '▼';
            applyUserFilters();
        });
    });

    // Drawer close
    document.getElementById('drawerCloseBtn').addEventListener('click', closeDrawer);
    document.getElementById('drawerOverlay').addEventListener('click', closeDrawer);

    // Drawer action buttons (event delegation)
    document.getElementById('drawerBody').addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const action = btn.dataset.action;
        const id = btn.dataset.id;

        if (action === 'reset-pwd') {
            const name = btn.dataset.name;
            const confirmed = await showConfirm(`确定要重置用户「${name}」的密码吗？`);
            if (!confirmed) return;
            try {
                const res = await fetch(`/api/admin/user/${id}/reset-password`, { method: 'POST', headers: getHeaders() });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error);
                document.getElementById('tempPwdValue').textContent = data.tempPassword;
                document.getElementById('tempPwdUsername').textContent = data.username;
                document.getElementById('tempPwdModal').classList.remove('hidden');
            } catch (err) { toastError(err.message); }
        } else if (action === 'toggle-disable') {
            const currentlyDisabled = btn.dataset.disabled === '1' || btn.dataset.disabled === 'true';
            const label = currentlyDisabled ? '启用' : '禁用';
            const confirmed = await showConfirm(`确定要${label}该账号吗？`);
            if (!confirmed) return;
            try {
                const res = await fetch(`/api/admin/user/${id}/disable`, { method: 'PUT', headers: getHeaders() });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error);
                toastSuccess(`账号已${label}`);
                closeDrawer();
                loadUsers();
            } catch (err) { toastError(err.message); }
        } else if (action === 'toggle-role') {
            const currentRole = btn.dataset.role;
            const newRole = currentRole === 'admin' ? '普通用户' : '管理员';
            const confirmed = await showConfirm(`确定要将该用户角色变更为「${newRole}」吗？`);
            if (!confirmed) return;
            try {
                const res = await fetch(`/api/admin/user/${id}/role`, { method: 'PUT', headers: getHeaders() });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error);
                toastSuccess(`角色已变更为${newRole}`);
                closeDrawer();
                loadUsers();
            } catch (err) { toastError(err.message); }
        } else if (action === 'delete-user') {
            const name = btn.dataset.name;
            const confirmed = await showConfirm(`确定要删除用户「${name}」及其所有记录吗？此操作无法撤销。`, '危险操作');
            if (!confirmed) return;
            try {
                const res = await fetch(`/api/admin/user/${id}`, { method: 'DELETE', headers: getHeaders() });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error);
                toastSuccess(data.message || '用户已删除');
                closeDrawer();
                loadUsers();
            } catch (err) { toastError(err.message); }
        }
    });

    // Analytics controls
    document.getElementById('analyticsTimeRange').addEventListener('change', loadAnalytics);
    document.getElementById('analyticsRefreshBtn').addEventListener('click', loadAnalytics);
    document.getElementById('analyticsExportBtn').addEventListener('click', exportAnalyticsReport);

    // Settings controls
    document.getElementById('settingsSaveBtn').addEventListener('click', saveSettings);
    document.getElementById('createBackupBtn').addEventListener('click', createBackup);
    document.getElementById('clearCacheBtn').addEventListener('click', clearCache);

    // Backup delete (event delegation)
    document.getElementById('backupList').addEventListener('click', (e) => {
        const btn = e.target.closest('.backup-item-delete');
        if (btn) {
            deleteBackup(btn.dataset.filename);
        }
    });

    // Logs controls
    document.getElementById('adminRefreshLogsBtn').addEventListener('click', () => { logPage = 1; loadLogs(); });
    document.getElementById('logActionFilter').addEventListener('change', () => { logPage = 1; loadLogs(); });
    document.getElementById('logUserSearch').addEventListener('input', () => { logPage = 1; loadLogs(); });
    document.getElementById('logPrevBtn').addEventListener('click', () => { if (logPage > 1) { logPage--; loadLogs(); } });
    document.getElementById('logNextBtn').addEventListener('click', () => { if (logPage < logPages) { logPage++; loadLogs(); } });
});

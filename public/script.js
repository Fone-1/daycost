// --- PWA Service Worker Registration ---
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(reg => console.log('ServiceWorker registered'))
            .catch(err => console.log('ServiceWorker registration failed: ', err));
    });
}

document.addEventListener('DOMContentLoaded', () => {
    // --- Tooltip System ---
    const tooltip = document.getElementById('globalTooltip');
    let tooltipTimeout;

    function bindTooltip(el, text) {
        el.addEventListener('mouseenter', (e) => {
            // Only show if the element is actually truncated
            if (el.scrollWidth <= el.clientWidth) return;
            tooltip.textContent = text;
            tooltip.classList.add('show');
            positionTooltip(e);
        });
        el.addEventListener('mousemove', positionTooltip);
        el.addEventListener('mouseleave', () => {
            tooltip.classList.remove('show');
        });
    }

    function positionTooltip(e) {
        const pad = 14;
        const tw = tooltip.offsetWidth;
        const th = tooltip.offsetHeight;
        let x = e.clientX + pad;
        let y = e.clientY + pad;
        if (x + tw > window.innerWidth) x = e.clientX - tw - pad;
        if (y + th > window.innerHeight) y = e.clientY - th - pad;
        tooltip.style.left = x + 'px';
        tooltip.style.top = y + 'px';
    }

    // --- Elements ---
    const displayUsername = document.getElementById('displayUsername');
    const changePwdBtn = document.getElementById('changePwdBtn');
    const logoutBtn = document.getElementById('logoutBtn');

    const authSection = document.getElementById('authSection');
    const dashboardSection = document.getElementById('dashboardSection');

    const tabLogin = document.getElementById('tabLogin');
    const tabRegister = document.getElementById('tabRegister');
    const authForm = document.getElementById('authForm');
    const authSubmitBtn = document.getElementById('authSubmitBtn');
    const authError = document.getElementById('authError');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');

    const dateInput = document.getElementById('purchaseDate');
    const parentSelect = document.getElementById('parentSelect');
    const costForm = document.getElementById('costForm');

    // Result Modal
    const resultModal = document.getElementById('resultModal');
    const modalCloseBtn = document.getElementById('modalCloseBtn');
    const modalResultTitle = document.getElementById('modalResultTitle');
    const modalDailyCost = document.getElementById('modalDailyCost');
    const modalDaysUsed = document.getElementById('modalDaysUsed');
    const modalTotalCost = document.getElementById('modalTotalCost');

    // Status Modal
    const statusModal = document.getElementById('statusModal');
    const statusModalCloseBtn = document.getElementById('statusModalCloseBtn');
    const statusForm = document.getElementById('statusForm');
    const statusRecordId = document.getElementById('statusRecordId');
    const statusEditName = document.getElementById('statusEditName');
    const statusEditParentId = document.getElementById('statusEditParentId');
    const statusEditPrice = document.getElementById('statusEditPrice');
    const statusEditDate = document.getElementById('statusEditDate');
    const statusSelect = document.getElementById('statusSelect');
    const endDateGroup = document.getElementById('endDateGroup');
    const statusEndDate = document.getElementById('statusEndDate');
    const resalePriceGroup = document.getElementById('resalePriceGroup');
    const statusResalePrice = document.getElementById('statusResalePrice');

    // Password Modal
    const passwordModal = document.getElementById('passwordModal');
    const passwordModalCloseBtn = document.getElementById('passwordModalCloseBtn');
    const passwordForm = document.getElementById('passwordForm');
    const passwordError = document.getElementById('passwordError');
    const oldPassword = document.getElementById('oldPassword');
    const newPassword = document.getElementById('newPassword');
    const confirmPassword = document.getElementById('confirmPassword');

    // Modal Events
    [modalCloseBtn, resultModal].forEach(el => {
        el.addEventListener('click', (e) => {
            if (e.target === resultModal || e.target === modalCloseBtn) resultModal.classList.add('hidden');
        });
    });

    [statusModalCloseBtn, statusModal].forEach(el => {
        el.addEventListener('click', (e) => {
            if (e.target === statusModal || e.target === statusModalCloseBtn) statusModal.classList.add('hidden');
        });
    });

    [passwordModalCloseBtn, passwordModal].forEach(el => {
        el.addEventListener('click', (e) => {
            if (e.target === passwordModal || e.target === passwordModalCloseBtn) passwordModal.classList.add('hidden');
        });
    });

    // History
    const historyList = document.getElementById('historyList');
    const filterSelect = document.getElementById('filterSelect');
    const sortSelect = document.getElementById('sortSelect');
    const searchInput = document.getElementById('searchInput');

    // --- State ---
    let isLoginMode = true;
    let globalRecords = [];
    let costChartInstance = null;
    let trendChartInstance = null;
    let currentTrendRange = '30d';
    let chartCurrentParentId = null;
    let clusterizeInstance = null;
    let trashClusterizeInstance = null;
    let expandedParents = {};
    let globalTrashRecords = [];
    let statsActiveView = 'tag';
    let statsLinkedFilter = null;

    // --- Pagination State ---
    let currentPage = 1;
    const itemsPerPage = 10000; // Load all to preserve tree structure across pagination
    let hasMoreRecords = true;
    let isLoadingRecords = false;

    // --- Custom Alert Modal Logic ---
    const alertIcon = document.getElementById('alertIcon');
    const alertTitle = document.getElementById('alertTitle');

    window.showAppAlert = function (msg, type = 'error') {
        alertMessage.innerText = msg;
        if (type === 'success') {
            alertIcon.innerText = '✅';
            alertTitle.innerText = '成功';
            alertTitle.style.color = '#10b981';
        } else {
            alertIcon.innerText = '❌';
            alertTitle.innerText = '错误提示';
            alertTitle.style.color = '#ef4444';
        }
        customAlertModal.classList.remove('hidden');
    };

    alertOkBtn.addEventListener('click', () => {
        customAlertModal.classList.add('hidden');
    });

    window.showAppConfirm = function (title, msg, onOk, okLabel = '确认') {
        const modal = document.getElementById('customConfirmModal');
        document.getElementById('confirmTitle').innerText = title;
        document.getElementById('confirmMessage').innerText = msg;

        const okBtn = document.getElementById('confirmOkBtn');
        const cancelBtn = document.getElementById('confirmCancelBtn');
        okBtn.innerText = okLabel;

        const newOk = okBtn.cloneNode(true);
        const newCancel = cancelBtn.cloneNode(true);
        okBtn.replaceWith(newOk);
        cancelBtn.replaceWith(newCancel);

        newCancel.addEventListener('click', () => modal.classList.add('hidden'));
        newOk.addEventListener('click', () => {
            modal.classList.add('hidden');
            onOk();
        });
        modal.classList.remove('hidden');
    };

    window.showAppChoice = function (title, msg, onBundle, onOrphan, onCancel) {
        const modal = document.getElementById('customChoiceModal');
        if (!modal) return;
        document.getElementById('choiceTitle').innerText = title;
        document.getElementById('choiceMessage').innerText = msg;

        const bundleBtn = document.getElementById('choiceBundleBtn');
        const orphanBtn = document.getElementById('choiceOrphanBtn');
        const cancelBtn = document.getElementById('choiceCancelBtn');

        const newBundle = bundleBtn.cloneNode(true);
        const newOrphan = orphanBtn.cloneNode(true);
        const newCancel = cancelBtn.cloneNode(true);
        
        bundleBtn.replaceWith(newBundle);
        orphanBtn.replaceWith(newOrphan);
        cancelBtn.replaceWith(newCancel);

        newCancel.addEventListener('click', () => {
            modal.classList.add('hidden');
            if (onCancel) onCancel();
        });
        
        newBundle.addEventListener('click', () => {
            modal.classList.add('hidden');
            onBundle();
        });

        newOrphan.addEventListener('click', () => {
            modal.classList.add('hidden');
            onOrphan();
        });

        modal.classList.remove('hidden');
    };

    const chartBackBtn = document.getElementById('chartBackBtn');
    if (chartBackBtn) {
        chartBackBtn.addEventListener('click', () => {
            chartCurrentParentId = null;
            // Hacky but simple: re-render the history view (which re-renders charts)
            const event = new Event('submit');
            if (globalRecords.length > 0) {
                // Re-calculate simply by calling renderChart again
                renderChart();
            }
        });
    }

    // --- Initial Setup ---
    const todayStr = new Date().toISOString().split('T')[0];
    dateInput.max = todayStr;
    dateInput.value = todayStr;

    // --- SPA Routing Logic ---
    const navBtns = document.querySelectorAll('.nav-btn');
    const panes = document.querySelectorAll('.spa-pane');

    navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-target');

            navBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            panes.forEach(pane => {
                if (pane.id === targetId) {
                    pane.classList.remove('hidden');
                    pane.classList.add('active');
                } else {
                    pane.classList.remove('active');
                    pane.classList.add('hidden');
                }
            });

            if (targetId === 'pane-history' && clusterizeInstance) {
                // Must force a refresh when the tab becomes visible, otherwise height evaluates to 0
                setTimeout(() => clusterizeInstance.refresh(true), 10);
            }

            if (targetId === 'pane-trash') {
                loadTrash();
            }
        });
    });

    checkAuth();

    // --- Auth Logic ---
    tabLogin.addEventListener('click', () => {
        isLoginMode = true;
        tabLogin.classList.add('active');
        tabRegister.classList.remove('active');
        authSubmitBtn.textContent = '登录';
        authError.classList.add('hidden');
    });

    tabRegister.addEventListener('click', () => {
        isLoginMode = false;
        tabRegister.classList.add('active');
        tabLogin.classList.remove('active');
        authSubmitBtn.textContent = '注册并登录';
        authError.classList.add('hidden');
    });

    // Clean labels for the repaired UTF-8 interface. Registered after legacy listeners so it wins.
    tabLogin.addEventListener('click', () => {
        authSubmitBtn.textContent = '登录';
    });
    tabRegister.addEventListener('click', () => {
        authSubmitBtn.textContent = '注册并登录';
    });

    authForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = usernameInput.value.trim();
        const password = passwordInput.value;

        if (isLoginMode) {
            await login(username, password);
        } else {
            await register(username, password);
        }
    });

    logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('daycost_token');
        localStorage.removeItem('daycost_username');
        localStorage.removeItem('daycost_role');
        checkAuth();
    });

    function checkAuth() {
        const token = localStorage.getItem('daycost_token');
        const username = localStorage.getItem('daycost_username');
        const role = localStorage.getItem('daycost_role');
        const globalStatsBox = document.getElementById('globalStatsBox');
        const navAdminBtn = document.getElementById('navAdminBtn');

        if (token && username) {
            authSection.classList.add('hidden');
            dashboardSection.classList.remove('hidden');
            displayUsername.textContent = username;
            
            if (navAdminBtn) {
                if (role === 'admin') {
                    navAdminBtn.classList.remove('hidden');
                } else {
                    navAdminBtn.classList.add('hidden');
                    // Safety UI check: if they are on the admin pane but not admin, kick them home
                    if (document.getElementById('pane-admin') && !document.getElementById('pane-admin').classList.contains('hidden')) {
                        document.querySelector('[data-target="pane-home"]').click();
                    }
                }
            }

            loadHistory();
            loadStats();
        } else {
            authSection.classList.remove('hidden');
            dashboardSection.classList.add('hidden');
            if (globalStatsBox) globalStatsBox.classList.add('hidden');
        }
    }

    async function login(username, password) {
        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            // 处理 Rate Limiting (429 状态码)
            if (res.status === 429) {
                const retryAfter = res.headers.get('Retry-After');
                const seconds = retryAfter ? Math.ceil(parseInt(retryAfter)) : 900;
                const minutes = Math.ceil(seconds / 60);
                throw new Error(`请求过于频繁，请 ${minutes} 分钟后再试`);
            }

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || '登录失败');

            localStorage.setItem('daycost_token', data.token);
            localStorage.setItem('daycost_username', data.username);
            localStorage.setItem('daycost_role', data.role || 'user');
            checkAuth();
            passwordInput.value = '';
        } catch (err) {
            showAuthError(err.message);
        }
    }

    async function register(username, password) {
        try {
            const res = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            // 处理 Rate Limiting (429 状态码)
            if (res.status === 429) {
                const retryAfter = res.headers.get('Retry-After');
                const seconds = retryAfter ? Math.ceil(parseInt(retryAfter)) : 900;
                const minutes = Math.ceil(seconds / 60);
                throw new Error(`请求过于频繁，请 ${minutes} 分钟后再试`);
            }

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || '注册失败');

            await login(username, password);
        } catch (err) {
            showAuthError(err.message);
        }
    }

    function showAuthError(msg) {
        authError.textContent = msg;
        authError.classList.remove('hidden');

        // 如果是 Rate Limiting 错误，添加倒计时
        if (msg.includes('请求过于频繁')) {
            const match = msg.match(/(\d+)\s*分钟/);
            if (match) {
                let remainingSeconds = parseInt(match[1]) * 60;
                authSubmitBtn.disabled = true;
                authSubmitBtn.style.opacity = '0.5';
                authSubmitBtn.style.cursor = 'not-allowed';

                const countdown = setInterval(() => {
                    remainingSeconds--;
                    if (remainingSeconds <= 0) {
                        clearInterval(countdown);
                        authSubmitBtn.disabled = false;
                        authSubmitBtn.style.opacity = '1';
                        authSubmitBtn.style.cursor = 'pointer';
                        authError.classList.add('hidden');
                        authError.textContent = '';
                    } else {
                        const mins = Math.floor(remainingSeconds / 60);
                        const secs = remainingSeconds % 60;
                        authError.textContent = `请求过于频繁，请 ${mins > 0 ? mins + '分' : ''}${secs}秒 后再试`;
                    }
                }, 1000);
            }
        }
    }

    // --- Change Password Logic ---
    changePwdBtn.addEventListener('click', () => {
        passwordForm.reset();
        passwordError.classList.add('hidden');
        passwordModal.classList.remove('hidden');
    });

    passwordForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const oldPw = oldPassword.value;
        const newPw = newPassword.value;
        const confirmPw = confirmPassword.value;

        if (newPw !== confirmPw) {
            passwordError.textContent = '两次输入的新密码不一致';
            passwordError.classList.remove('hidden');
            return;
        }

        try {
            const res = await fetch('/api/auth/password', {
                method: 'PUT',
                headers: getHeaders(),
                body: JSON.stringify({ oldPassword: oldPw, newPassword: newPw })
            });
            const data = await res.json();

            if (res.ok) {
                showAppAlert(data.message);
                passwordModal.classList.add('hidden');
                logoutBtn.click(); // force re-login
            } else {
                passwordError.textContent = data.error || '修改失败';
                passwordError.classList.remove('hidden');
            }
        } catch (err) {
            passwordError.textContent = '网络错误';
            passwordError.classList.remove('hidden');
        }
    });

    // --- Api Calls ---
    function getHeaders() {
        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('daycost_token')}`
        };
    }

    // --- Dynamic form fields based on status ---
    const initialStatusSelect = document.getElementById('initialStatus');
    const formEndDateGroup = document.getElementById('formEndDateGroup');
    const formResalePriceGroup = document.getElementById('formResalePriceGroup');
    const formEndDate = document.getElementById('formEndDate');
    const purchaseDateInput = document.getElementById('purchaseDate');

    // Make sure end date calendar cannot select dates before purchase date
    purchaseDateInput.addEventListener('change', () => {
        formEndDate.min = purchaseDateInput.value;
        if (formEndDate.value && new Date(formEndDate.value) < new Date(purchaseDateInput.value)) {
            formEndDate.value = purchaseDateInput.value;
        }
    });

    initialStatusSelect.addEventListener('change', () => {
        const val = initialStatusSelect.value;
        if (val === 'active') {
            formEndDateGroup.classList.add('hidden');
            formResalePriceGroup.classList.add('hidden');
        } else if (val === 'broken') {
            formEndDateGroup.classList.remove('hidden');
            formResalePriceGroup.classList.add('hidden');
        } else if (val === 'sold') {
            formEndDateGroup.classList.remove('hidden');
            formResalePriceGroup.classList.remove('hidden');
        }
    });

    window.openDepreciationInfoModal = function() {
        const modal = document.getElementById('depreciationInfoModal');
        if (modal) {
            modal.classList.remove('hidden');
        }
    };

    // --- Calculator Logic ---
    costForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const itemName = document.getElementById('itemName').value.trim() || '该物品';
        const price = parseFloat(document.getElementById('price').value);
        const purchaseDateStr = document.getElementById('purchaseDate').value;
        const parent_id = parentSelect.value || null;
        const status = initialStatusSelect.value;
        const end_date = formEndDate.value || null;
        const resale_price = parseFloat(document.getElementById('formResalePrice').value) || 0;
        const tags = document.getElementById('itemTags').value;
        const depreciation_method = document.getElementById('formDepreciationMethod').value;
        const expected_lifespan = parseInt(document.getElementById('formExpectedLifespan').value) || 1095;
        const expected_salvage = parseFloat(document.getElementById('formExpectedSalvage').value) || 0;

        // Validate end_date when status requires it
        if (status === 'broken' || status === 'sold') {
            if (!end_date) {
                formEndDate.focus();
                formEndDate.style.borderColor = 'var(--danger)';
                setTimeout(() => formEndDate.style.borderColor = '', 2000);
                return;
            }
            if (new Date(end_date) < new Date(purchaseDateStr)) {
                showAppAlert('终止日期不能早于购买日期！');
                formEndDate.focus();
                formEndDate.style.borderColor = 'var(--danger)';
                setTimeout(() => formEndDate.style.borderColor = '', 2000);
                return;
            }
        }

        if (!Number.isFinite(price) || price < 0) {
            showAppAlert('金额必须是大于等于 0 的数字');
            return;
        }
        if (resale_price < 0 || resale_price > price) {
            showAppAlert('回血金额必须在 0 到购买金额之间');
            return;
        }
        if (expected_lifespan < 1) {
            showAppAlert('预计寿命至少为 1 天');
            return;
        }
        if (expected_salvage < 0 || expected_salvage > price) {
            showAppAlert('终期残值必须在 0 到购买金额之间');
            return;
        }

        // Preview calculation using chosen status
        const { dailyCost, actualDaysForCalc } = calculateCost({
            price,
            purchase_date: purchaseDateStr,
            status,
            end_date,
            resale_price
        });

        // Save to backend
        try {
            const res = await fetch('/api/records', {
                method: 'POST',
                headers: getHeaders(),
                body: JSON.stringify({ item_name: itemName, price, purchase_date: purchaseDateStr, parent_id, status, end_date, resale_price, tags, depreciation_method, expected_lifespan, expected_salvage })
            });
            if (res.ok) {
                costForm.reset();
                // Reset conditional fields
                formEndDateGroup.classList.add('hidden');
                formResalePriceGroup.classList.add('hidden');
                dateInput.max = todayStr;
                dateInput.value = todayStr;
                document.getElementById('addItemModal').classList.add('hidden');
                loadHistory();
                loadStats();

                modalResultTitle.textContent = `${itemName} 的日均成本为`;
                resultModal.classList.remove('hidden');
                animateValue(modalDailyCost, 0, dailyCost, 1000, true);
                animateValue(modalDaysUsed, 0, actualDaysForCalc, 800, false);
                animateValue(modalTotalCost, 0, price, 800, true);
            } else if (res.status === 401 || res.status === 403) {
                logoutBtn.click();
            }
        } catch (e) {
            console.error('保存失败', e);
        }
    });

    function calculateCost(record) {
        const purchaseDate = new Date(record.purchase_date);
        purchaseDate.setHours(0, 0, 0, 0);

        let endDate = new Date();
        const status = record.status || 'active';

        if (status !== 'active' && record.end_date) {
            endDate = new Date(record.end_date);
        }
        endDate.setHours(0, 0, 0, 0);

        const timeDiff = Math.max(0, endDate.getTime() - purchaseDate.getTime());
        let daysUsed = Math.floor(timeDiff / (1000 * 3600 * 24));
        const actualDaysForCalc = daysUsed + 1;

        let finalCost = record.price;
        if (status === 'sold') {
            finalCost = Math.max(0, record.price - (record.resale_price || 0));
        }

        // --- Calculate Depreciation (Current Value) ---
        let currentValue = record.price;
        if (status === 'sold') {
            currentValue = record.resale_price || 0;
        } else if (status === 'broken') {
            currentValue = 0;
        } else {
            const depMethod = record.depreciation_method || 'straight_line';
            const lifespan = record.expected_lifespan || 1095;
            const salvage = record.expected_salvage || 0;
            
            if (depMethod === 'straight_line') {
                const dailyDep = (record.price - salvage) / lifespan;
                currentValue = Math.max(salvage, record.price - (dailyDep * actualDaysForCalc));
            } else if (depMethod === 'double_declining') {
                const dailyRate = 2 / lifespan;
                currentValue = record.price * Math.pow(1 - dailyRate, actualDaysForCalc);
                currentValue = Math.max(salvage, currentValue);
            }
        }

        return {
            dailyCost: finalCost / actualDaysForCalc,
            actualDaysForCalc,
            finalCost,
            currentValue
        };
    }

    // --- Status Modification Logic ---
    statusSelect.addEventListener('change', () => {
        const val = statusSelect.value;
        if (val === 'active') {
            endDateGroup.classList.add('hidden');
            resalePriceGroup.classList.add('hidden');
        } else if (val === 'broken') {
            endDateGroup.classList.remove('hidden');
            resalePriceGroup.classList.add('hidden');
        } else if (val === 'sold') {
            endDateGroup.classList.remove('hidden');
            resalePriceGroup.classList.remove('hidden');
        }
    });

    statusForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = statusRecordId.value;
        const item_name = statusEditName.value.trim() || '物品';
        const price = parseFloat(statusEditPrice.value) || 0;
        const purchase_date = statusEditDate.value;
        const parent_id = statusEditParentId.value || null;

        const status = statusSelect.value;
        const end_date = statusEndDate.value;
        const resale_price = parseFloat(statusResalePrice.value) || 0;
        const tags = document.getElementById('statusEditTags').value;
        const depreciation_method = document.getElementById('statusEditDepreciationMethod').value;
        const expected_lifespan = parseInt(document.getElementById('statusEditExpectedLifespan').value) || 1095;
        const expected_salvage = parseFloat(document.getElementById('statusEditExpectedSalvage').value) || 0;

        if (!Number.isFinite(price) || price < 0) {
            showAppAlert('金额必须是大于等于 0 的数字');
            return;
        }
        if ((status === 'broken' || status === 'sold') && !end_date) {
            showAppAlert('已损坏或已回血的记录必须填写结束日期');
            return;
        }
        if (end_date && new Date(end_date) < new Date(purchase_date)) {
            showAppAlert('结束日期不能早于购买日期');
            return;
        }
        if (resale_price < 0 || resale_price > price) {
            showAppAlert('回血金额必须在 0 到购买金额之间');
            return;
        }
        if (expected_lifespan < 1) {
            showAppAlert('预计寿命至少为 1 天');
            return;
        }
        if (expected_salvage < 0 || expected_salvage > price) {
            showAppAlert('终期残值必须在 0 到购买金额之间');
            return;
        }

        const submitUpdate = async (cascadeAction = 'none') => {
            try {
                const res = await fetch(`/api/records/${id}`, {
                    method: 'PUT',
                    headers: getHeaders(),
                    body: JSON.stringify({ item_name, price, purchase_date, status, end_date, resale_price, parent_id, tags, depreciation_method, expected_lifespan, expected_salvage, cascadeAction })
                });
                const data = await res.json();
                if (res.ok) {
                    statusModal.classList.add('hidden');
                    loadHistory();
                    loadStats();
                } else {
                    showAppAlert(data.error || '更新失败');
                }
            } catch (err) { }
        };

        const record = globalRecords.find(r => r.id === parseInt(id));
        const children = globalRecords.filter(r => r.parent_id === parseInt(id));
        
        if (record && children.length > 0 && record.status === 'active' && (status === 'broken' || status === 'sold')) {
            const statusLabel = status === 'broken' ? '已损坏' : '已回血';
            showAppChoice(
                '级联处理',
                `该组合下包含 ${children.length} 个子配件。\n主体被标记为「${statusLabel}」后，您希望如何处理这些子配件？`,
                () => submitUpdate('bundle'),
                () => submitUpdate('orphan'),
                () => { /* cancel */ }
            );
        } else {
            submitUpdate('none');
        }
    });

    window.openStatusModal = function (id) {
        const record = globalRecords.find(r => r.id === id);
        if (!record) return;

        statusRecordId.value = record.id;
        statusEditName.value = record.item_name;
        statusEditParentId.value = record.parent_id || '';
        statusEditPrice.value = record.price;
        statusEditDate.value = record.purchase_date;
        document.getElementById('statusEditTags').value = record.tags || '';
        document.getElementById('statusEditDepreciationMethod').value = record.depreciation_method || 'straight_line';
        document.getElementById('statusEditExpectedLifespan').value = record.expected_lifespan || 1095;
        document.getElementById('statusEditExpectedSalvage').value = record.expected_salvage || 0;

        // Prevent setting itself as parent
        const options = statusEditParentId.options;
        for (let i = 0; i < options.length; i++) {
            options[i].disabled = (parseInt(options[i].value) === id);
        }

        statusSelect.value = record.status || 'active';
        statusEndDate.value = record.end_date || todayStr;
        statusEndDate.max = todayStr;
        statusResalePrice.value = record.resale_price || '';

        statusSelect.dispatchEvent(new Event('change'));
        statusModal.classList.remove('hidden');
    };

    window.deleteRecord = function (id) {
        const record = globalRecords.find(r => r.id === id);
        if (!record) return;

        showAppConfirm(
            '移入废纸篓？',
            `您确定要将 「${record.item_name}」 移入废纸篓吗？\n(注意：如果有子零件需先解除绑定才能删除)`,
            async () => {
                try {
                    const res = await fetch(`/api/records/${id}`, {
                        method: 'DELETE',
                        headers: getHeaders()
                    });
                    const data = await res.json();
                    if (res.ok) {
                        loadHistory();
                        loadStats();
                    } else {
                        showAppAlert(data.error);
                    }
                } catch (e) {
                    showAppAlert('操作失败');
                }
            },
            '确认删除'
        );
    };

    function updateParentDropdowns() {
        const topLevelRecords = globalRecords.filter(r => !r.parent_id);
        const optionsHtml = '<option value="">- 独立物品 -</option>' +
            topLevelRecords.map(r => `<option value="${r.id}">${escapeHtml(r.item_name || '未命名')}</option>`).join('');

        parentSelect.innerHTML = optionsHtml;
        statusEditParentId.innerHTML = optionsHtml;
    }

    window.deleteRecord = function (id) {
        const record = globalRecords.find(r => r.id === id);
        if (!record) return;

        showAppConfirm(
            '移入回收站？',
            `确定要将「${record.item_name}」移入回收站吗？\n如果它还有子配件，请先解除绑定或移动子配件。`,
            async () => {
                try {
                    const res = await fetch(`/api/records/${id}`, {
                        method: 'DELETE',
                        headers: getHeaders()
                    });
                    const data = await res.json();
                    if (res.ok) {
                        loadHistory();
                        loadStats();
                    } else {
                        showAppAlert(data.error || '删除失败');
                    }
                } catch (e) {
                    showAppAlert('操作失败');
                }
            },
            '确认删除'
        );
    };

    function updateParentDropdowns() {
        const topLevelRecords = globalRecords.filter(r => !r.parent_id);
        const optionsHtml = '<option value="">- 独立物品 -</option>' +
            topLevelRecords.map(r => `<option value="${r.id}">${escapeHtml(r.item_name || '未命名')}</option>`).join('');

        parentSelect.innerHTML = optionsHtml;
        statusEditParentId.innerHTML = optionsHtml;
    }

    async function loadStats() {
        const globalStatsBox = document.getElementById('globalStatsBox');
        const globalTotalDaily = document.getElementById('globalTotalDaily');
        const globalTotalPrice = document.getElementById('globalTotalPrice');

        const queryParams = new URLSearchParams({
            q: searchInput.value,
            status: filterSelect.value
        });

        try {
            const res = await fetch(`/api/stats?${queryParams.toString()}`, { headers: getHeaders() });
            if (!res.ok) return;
            const stats = await res.json();

            if (stats.total_count === 0) {
                // Do not hide the box, just show zero so layout doesn't break
            }

            if (globalStatsBox) globalStatsBox.classList.remove('hidden');

            const oldDailyVal = parseFloat(globalTotalDaily.textContent) || 0;
            animateValue(globalTotalDaily, oldDailyVal, stats.total_daily_cost, 800, true);

            const oldPriceVal = parseFloat(globalTotalPrice.textContent) || 0;
            animateValue(globalTotalPrice, oldPriceVal, stats.total_price, 800, true);

            document.getElementById('statTotal').textContent = stats.total_count;
            document.getElementById('statActive').textContent = stats.status_counts?.active || 0;
            document.getElementById('statBroken').textContent = stats.status_counts?.broken || 0;
            document.getElementById('statSold').textContent = stats.status_counts?.sold || 0;

            // Render Tag Stats
            const tagContainer = document.getElementById('tagStatsContainer');
            if (tagContainer && stats.tag_stats) {
                const tagEntries = Object.entries(stats.tag_stats).map(([name, data]) => ({ name, ...data }));
                tagEntries.sort((a, b) => b.daily_cost - a.daily_cost);

                if (tagEntries.length === 0) {
                    tagContainer.innerHTML = '<div style="text-align:center; color:#94a3b8; font-size:0.85rem; padding: 20px;">暂无标签数据，请尝试为物品添加标签。</div>';
                } else {
                    const maxDailyCost = tagEntries[0].daily_cost;
                    tagContainer.innerHTML = tagEntries.map(tag => {
                        const percent = maxDailyCost > 0 ? (tag.daily_cost / maxDailyCost) * 100 : 0;
                        return `
                            <div class="tag-list-item">
                                <div class="tag-list-header">
                                    <span class="tag-list-name">#${tag.name}</span>
                                    <span class="tag-list-cost">¥${tag.daily_cost.toFixed(2)}<span style="font-size:0.7rem; color:#94a3b8;">/天</span></span>
                                </div>
                                <div class="tag-progress-track">
                                    <div class="tag-progress-fill" style="width: ${percent}%;"></div>
                                </div>
                                <div class="tag-list-sub" style="margin-top: 4px; text-align: right;">
                                    包含投资: ¥${tag.total_price.toFixed(2)}
                                </div>
                            </div>
                        `;
                    }).join('');
                }
            }

            if (tagContainer && stats.tag_stats) {
                const cleanTagEntries = Object.entries(stats.tag_stats)
                    .map(([name, data]) => ({ name, ...data }))
                    .sort((a, b) => b.daily_cost - a.daily_cost);

                if (cleanTagEntries.length === 0) {
                    tagContainer.innerHTML = '<div class="empty-state">暂无标签数据。给物品添加标签后会在这里汇总。</div>';
                } else {
                    const maxDailyCost = cleanTagEntries[0].daily_cost;
                    tagContainer.innerHTML = cleanTagEntries.map(tag => {
                        const percent = maxDailyCost > 0 ? (tag.daily_cost / maxDailyCost) * 100 : 0;
                        return `
                            <div class="tag-list-item">
                                <div class="tag-list-header">
                                    <span class="tag-list-name">#${escapeHtml(tag.name)}</span>
                                    <span class="tag-list-cost">¥${tag.daily_cost.toFixed(2)}<span style="font-size:0.7rem; color:#94a3b8;">/天</span></span>
                                </div>
                                <div class="tag-progress-track">
                                    <div class="tag-progress-fill" style="width: ${percent}%;"></div>
                                </div>
                                <div class="tag-list-sub" style="margin-top: 4px; text-align: right;">
                                    包含投入：¥${tag.total_price.toFixed(2)}
                                </div>
                            </div>
                        `;
                    }).join('');
                }
            }

        } catch (e) {
            console.error("加载统计数据失败", e);
        }
    }

    // --- History Logic (Optimized for Pagination) ---
    async function loadHistory(page = 1, append = false) {
        if (isLoadingRecords) return;
        isLoadingRecords = true;

        try {
            const sortByMap = { 
                'default': 'created_at', 
                'priceDesc': 'price',
                'costDesc': 'dailyCost',
                'costAsc': 'dailyCost',
                'daysDesc': 'days',
                'daysAsc': 'days'
            };
            const sortBy = sortByMap[sortSelect.value] || 'created_at';
            const sortOrder = sortSelect.value.toLowerCase().includes('asc') ? 'ASC' : 'DESC';
            const query = (searchInput.value || '').trim();
            const filter = filterSelect.value;
            const statsParams = statsLinkedFilter
                ? `&statsType=${encodeURIComponent(statsLinkedFilter.type)}&statsValue=${encodeURIComponent(statsLinkedFilter.value)}`
                : '';

            const res = await fetch(`/api/records?page=${page}&limit=${itemsPerPage}&sortBy=${sortBy}&sortOrder=${sortOrder}&q=${encodeURIComponent(query)}&status=${filter}${statsParams}`, {
                headers: getHeaders()
            });

            if (res.status === 401 || res.status === 403) {
                return logoutBtn.click();
            }

            const result = await res.json();
            const newRecords = result.data || [];

            if (append) {
                globalRecords = [...globalRecords, ...newRecords];
            } else {
                globalRecords = newRecords;
                // Reset scroll to top on new search/filter
                document.getElementById('historyListScroll').scrollTop = 0;
            }

            currentPage = result.page;
            hasMoreRecords = result.hasMore;

            const loadingIndicator = document.getElementById('loadingIndicator');
            if (loadingIndicator) {
                if (hasMoreRecords) {
                    loadingIndicator.classList.remove('hidden');
                } else {
                    loadingIndicator.classList.add('hidden');
                }
            }

            updateParentDropdowns();
            renderHistory();
        } catch (e) {
            console.error("加载历史记录失败", e);
        } finally {
            isLoadingRecords = false;
        }
    }

    // Infinite Scroll Listener
    const scrollContainer = document.getElementById('historyListScroll');
    if (scrollContainer) {
        scrollContainer.addEventListener('scroll', () => {
            if (!hasMoreRecords || isLoadingRecords) return;

            const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
            // Trigger 200px before bottom
            if (scrollTop + clientHeight >= scrollHeight - 200) {
                loadHistory(currentPage + 1, true);
            }
        });
    }

    filterSelect.addEventListener('change', () => {
        statsLinkedFilter = null;
        updateStatsControls();
        currentPage = 1;
        loadHistory(1, false);
    });
    sortSelect.addEventListener('change', () => {
        currentPage = 1;
        loadHistory(1, false);
    });
    searchInput.addEventListener('input', () => {
        statsLinkedFilter = null;
        updateStatsControls();
        // Search still happens locally for now for responsiveness, 
        // but we could move it to server if needed. 
        // For infinite scroll, server-side search is better.
        currentPage = 1;
        loadHistory(1, false);
    });

    window.toggleChildren = function (parentId) {
        expandedParents[parentId] = !expandedParents[parentId];
        renderHistory();
    }

    // Modal open/close bindings (moved from inline onclick in HTML)
    const fabAddBtn = document.getElementById('fabAddBtn');
    const addItemModal = document.getElementById('addItemModal');
    const addItemModalClose = document.getElementById('addItemModalClose');
    const depreciationInfoModal = document.getElementById('depreciationInfoModal');
    const depreciationInfoModalClose = document.getElementById('depreciationInfoModalClose');
    const depreciationInfoOkBtn = document.getElementById('depreciationInfoOkBtn');
    if (fabAddBtn && addItemModal) fabAddBtn.addEventListener('click', () => addItemModal.classList.remove('hidden'));
    if (addItemModalClose && addItemModal) addItemModalClose.addEventListener('click', () => addItemModal.classList.add('hidden'));
    if (depreciationInfoModalClose && depreciationInfoModal) depreciationInfoModalClose.addEventListener('click', () => depreciationInfoModal.classList.add('hidden'));
    if (depreciationInfoOkBtn && depreciationInfoModal) depreciationInfoOkBtn.addEventListener('click', () => depreciationInfoModal.classList.add('hidden'));

    // Depreciation info buttons (two instances: one in status modal, one in add form)
    const depInfoBtn1 = document.getElementById('depreciationInfoBtn1');
    const depInfoBtn2 = document.getElementById('depreciationInfoBtn2');
    if (depInfoBtn1 && depreciationInfoModal) depInfoBtn1.addEventListener('click', () => depreciationInfoModal.classList.remove('hidden'));
    if (depInfoBtn2 && depreciationInfoModal) depInfoBtn2.addEventListener('click', () => depreciationInfoModal.classList.remove('hidden'));

    // Admin refresh button
    const adminRefreshBtn = document.getElementById('adminRefreshBtn');
    if (adminRefreshBtn) adminRefreshBtn.addEventListener('click', () => { if (typeof loadAdminUsers === 'function') loadAdminUsers(); });

    // Event delegation for buttons inside Clusterize virtual scroll
    // (Clusterize replaces DOM via innerHTML, so inline onclick handlers may not bind reliably)
    const historyScrollEl = document.getElementById('historyListScroll');
    if (historyScrollEl) {
        historyScrollEl.addEventListener('click', (e) => {
            const toggleBtn = e.target.closest('.toggle-children-btn');
            if (toggleBtn) {
                e.stopPropagation();
                const parentId = parseInt(toggleBtn.dataset.parentId, 10);
                if (!isNaN(parentId)) toggleChildren(parentId);
                return;
            }
            const actionBtn = e.target.closest('[data-action]');
            if (actionBtn) {
                e.stopPropagation();
                const recordId = parseInt(actionBtn.dataset.recordId, 10);
                const action = actionBtn.dataset.action;
                if (isNaN(recordId)) return;
                if (action === 'edit') openStatusModal(recordId);
                else if (action === 'delete') deleteRecord(recordId);
                else if (action === 'restore') restoreRecord(recordId);
                else if (action === 'purge') purgeRecord(recordId);
            }
        });
    }

    // Event delegation for trash list buttons
    const trashScrollEl = document.getElementById('trashListScroll');
    if (trashScrollEl) {
        trashScrollEl.addEventListener('click', (e) => {
            const actionBtn = e.target.closest('[data-action]');
            if (!actionBtn) return;
            e.stopPropagation();
            const recordId = parseInt(actionBtn.dataset.recordId, 10);
            const action = actionBtn.dataset.action;
            if (isNaN(recordId)) return;
            if (action === 'restore') restoreRecord(recordId);
            else if (action === 'purge') purgeRecord(recordId);
        });
    }

    // Helper to generate a single historic item HTML
    function createItemHtml(record, isChild = false) {
        const status = record.status || 'active';
        let classModifiers = isChild ? 'child-item' : '';
        if (status === 'broken') classModifiers += ' broken';
        if (status === 'sold') classModifiers += ' sold';

        let badges = '';
        let tagBadges = '';

        const dailyCost = record._aggDailyCost !== undefined ? record._aggDailyCost : record._dailyCost;
        const price = record._aggPrice !== undefined ? record._aggPrice : record.price;
        const days = record._aggDays !== undefined ? record._aggDays : record._days;
        const finalCost = record._aggFinalCost !== undefined ? record._aggFinalCost : record._finalCost;
        const currentValue = record._aggCurrentValue !== undefined ? record._aggCurrentValue : record._currentValue;

        const priceLabel = isChild ? '零件单价' : '组合总价';
        let metaHtml = `${priceLabel} ￥${price.toFixed(2)}${isChild ? '' : ` · 已用 ${days} 天`}`;

        if (status === 'broken') {
            badges = '<span class="status-badge bg-red">已损坏</span>';
        } else if (status === 'sold') {
            badges = '<span class="status-badge bg-yellow">已回血</span>';
            const resaleLabel = isChild ? '零件折损' : '组合折损';
            metaHtml = `${resaleLabel} ￥${finalCost.toFixed(2)} (售￥${record.resale_price}) · 定格 ${days}天`;
        } else {
            metaHtml += ` · 估值 ￥${(currentValue || 0).toFixed(2)}`;
        }

        if (record.tags) {
            const tagsArr = record.tags.split(/[,，\s]+/).map(t => t.trim()).filter(t => t);
            tagsArr.forEach(t => {
                const cleanTag = t.startsWith('#') ? t : '#' + t;
                tagBadges += `<span class="tag-badge">${cleanTag}</span>`;
            });
        }

        return `
            <div class="history-item ${classModifiers}" data-id="${record.id}">
                <div class="swipe-wrapper" ontouchstart="handleSwipeStart(event)" ontouchmove="handleSwipeMove(event)" ontouchend="handleSwipeEnd(event)">
                    <div class="swipe-content">
                        <div class="history-info">
                            <span class="history-name" data-fulltext="${record.item_name}">${record.item_name} ${badges}${tagBadges}</span>
                            <span class="history-meta" data-fulltext="${metaHtml.replace(/￥/g, '\xA5')}">${metaHtml}</span>
                        </div>
                        <div class="history-cost">
                            <div class="history-cost-val">￥${dailyCost.toFixed(2)}<span>/天</span></div>
                        </div>
                    </div>
                    <div class="swipe-actions">
                        <button class="status-btn" data-action="edit" data-record-id="${record.id}" title="修改">⚙️</button>
                        ${isChild ? '' : `<button class="delete-btn" data-action="delete" data-record-id="${record.id}" title="删除">🗑️</button>`}
                    </div>
                </div>
            </div>
        `;
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function formatCurrency(value) {
        const number = Number(value) || 0;
        return `¥${number.toFixed(2)}`;
    }

    function createItemHtml(record, isChild = false) {
        const status = record.status || 'active';
        let classModifiers = isChild ? 'child-item' : '';
        if (status === 'broken') classModifiers += ' broken';
        if (status === 'sold') classModifiers += ' sold';

        let badges = '';
        let tagBadges = '';

        const dailyCost = record._aggDailyCost !== undefined ? record._aggDailyCost : record._dailyCost;
        const price = record._aggPrice !== undefined ? record._aggPrice : record.price;
        const days = record._aggDays !== undefined ? record._aggDays : record._days;
        const finalCost = record._aggFinalCost !== undefined ? record._aggFinalCost : record._finalCost;
        const currentValue = record._aggCurrentValue !== undefined ? record._aggCurrentValue : record._currentValue;

        const priceLabel = isChild ? '零件单价' : '组合总价';
        let metaText = `${priceLabel} ${formatCurrency(price)}${isChild ? '' : ` · 已用 ${days || 0} 天`}`;

        if (status === 'broken') {
            badges = '<span class="status-badge bg-red">已损坏</span>';
        } else if (status === 'sold') {
            badges = '<span class="status-badge bg-yellow">已回血</span>';
            const resaleLabel = isChild ? '零件折损' : '组合折损';
            metaText = `${resaleLabel} ${formatCurrency(finalCost)} · 回血 ${formatCurrency(record.resale_price || 0)} · ${days || 0} 天`;
        } else {
            metaText += ` · 估值 ${formatCurrency(currentValue || 0)}`;
        }

        if (record.tags) {
            const tagsArr = record.tags.split(/[,，\s]+/).map(t => t.trim()).filter(t => t);
            tagsArr.forEach(t => {
                const cleanTag = t.startsWith('#') ? t : '#' + t;
                tagBadges += `<span class="tag-badge">${escapeHtml(cleanTag)}</span>`;
            });
        }

        const safeName = escapeHtml(record.item_name || '未命名');
        const safeMeta = escapeHtml(metaText);

        return `
            <div class="history-item ${classModifiers}" data-id="${record.id}">
                <div class="swipe-wrapper" ontouchstart="handleSwipeStart(event)" ontouchmove="handleSwipeMove(event)" ontouchend="handleSwipeEnd(event)">
                    <div class="swipe-content">
                        <div class="history-info">
                            <span class="history-name" data-fulltext="${safeName}">${safeName} ${badges}${tagBadges}</span>
                            <span class="history-meta" data-fulltext="${safeMeta}">${safeMeta}</span>
                        </div>
                        <div class="history-cost">
                            <div class="history-cost-val">${formatCurrency(dailyCost)}<span>/天</span></div>
                        </div>
                    </div>
                    <div class="swipe-actions">
                        <button class="status-btn" data-action="edit" data-record-id="${record.id}" title="编辑">编辑</button>
                        ${isChild ? '' : `<button class="delete-btn" data-action="delete" data-record-id="${record.id}" title="删除">删除</button>`}
                    </div>
                </div>
            </div>
        `;
    }

    function renderHistory() {
        const globalStatsBox = document.getElementById('globalStatsBox');

        // Removed logic that hides globalStatsBox when records are empty
        if (globalStatsBox) {
            globalStatsBox.classList.remove('hidden');
        }

        // Server already sends processed and sorted data in `globalRecords`!
        // We just need to separate them into top-level and children for UI expansion.
        const childrenMap = {}; // parent_id -> array of children
        const topLevelRecords = [];

        globalRecords.forEach(r => {
            if (r.parent_id) {
                if (!childrenMap[r.parent_id]) childrenMap[r.parent_id] = [];
                childrenMap[r.parent_id].push(r);
            } else {
                topLevelRecords.push(r);
            }
        });

        // 6. Rendering (Virtual List via Clusterize)
        let virtualRows = [];

        if (topLevelRecords.length === 0) {
            virtualRows.push('<div class="clusterize-no-data" style="text-align:center; color:#94a3b8; padding: 20px;">没有符合条件的记录</div>');
        } else {
            topLevelRecords.forEach(record => {
                const children = childrenMap[record.id] || [];
                // Children come sorted from the backend!

                // Push parent row
                virtualRows.push(`<div class="record-wrapper">${createItemHtml(record, false)}</div>`);

                // Check if children exist and if they are expanded
                if (children.length > 0) {
                    const totalChildren = children.length;
                    const isExpanded = !!expandedParents[record.id];
                    const btnText = isExpanded ? `▲ 收起零件明细` : `▼ 展开零件明细 (${totalChildren}个部件)`;

                    virtualRows.push(`<div class="record-wrapper"><button class="toggle-children-btn" data-parent-id="${record.id}" style="width:100%; border-radius:10px; margin-top:5px; margin-bottom:5px;">${btnText}</button></div>`);

                    if (isExpanded) {
                        children.forEach(child => {
                            virtualRows.push(`<div class="record-wrapper children-container show" style="padding-left:15px; border-left:3px solid var(--primary); margin-left:10px;">${createItemHtml(child, true)}</div>`);
                        });
                    }
                }
            });
        }
        if (!clusterizeInstance) {
            clusterizeInstance = new Clusterize({
                rows: virtualRows,
                scrollId: 'historyListScroll',
                contentId: 'historyListContent',
                callbacks: {
                    clusterChanged: () => {
                        // Bind tooltips after new cluster renders
                        const scrollEl = document.getElementById('historyListScroll');
                        if (scrollEl) {
                            scrollEl.querySelectorAll('[data-fulltext]').forEach(el => {
                                bindTooltip(el, el.dataset.fulltext);
                            });
                        }
                    }
                }
            });
        } else {
            clusterizeInstance.update(virtualRows);
        }

        // 7. Render Visualization Charts
        renderStatsBreakdown();
        renderChart();
        renderTrendChart(currentTrendRange);
    }

    async function renderChart() {
        const ctx = document.getElementById('costChart');
        if (!ctx) return;

        const chartTitle = document.getElementById('chartTitle');
        const chartBackBtn = document.getElementById('chartBackBtn');

        const queryParams = new URLSearchParams({
            q: searchInput.value,
            status: filterSelect.value
        });
        
        if (chartCurrentParentId) {
            queryParams.append('parent_id', chartCurrentParentId);
        }
        
        let url = `/api/stats/pie?${queryParams.toString()}`;

        try {
            const res = await fetch(url, { headers: getHeaders() });
            if (!res.ok) return;
            const dataObj = await res.json();

            if (!chartCurrentParentId) {
                if (chartBackBtn) chartBackBtn.classList.add('hidden');
                if (chartTitle) chartTitle.innerText = "前5大消费本体";
            } else {
                if (chartBackBtn) chartBackBtn.classList.remove('hidden');
                if (chartTitle) chartTitle.innerText = dataObj.parentName ? `拆解: ${dataObj.parentName}` : '子项分布';
            }

            if (costChartInstance) {
                costChartInstance.destroy();
            }

            if (!dataObj.data || dataObj.data.length === 0) {
                ctx.classList.add('hidden');
                return;
        } else {
            ctx.classList.remove('hidden');
        }

        costChartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: dataObj.labels,
                datasets: [{
                    data: dataObj.data,
                    backgroundColor: [
                        'rgba(59, 130, 246, 0.8)', 'rgba(167, 139, 250, 0.8)',
                        'rgba(16, 185, 129, 0.8)', 'rgba(245, 158, 11, 0.8)',
                        'rgba(239, 68, 68, 0.8)', 'rgba(148, 163, 184, 0.8)'
                    ],
                    borderColor: 'rgba(15, 23, 42, 1)',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                onClick: (event, elements, chart) => {
                    if (elements.length > 0) {
                        const idx = elements[0].index;
                        const clickedId = dataObj.originalIds[idx];
                        const hasChildren = dataObj.hasChildrenArray[idx];
                        if (clickedId && !chartCurrentParentId && hasChildren) {
                            chartCurrentParentId = clickedId;
                            renderChart();
                        }
                    }
                },
                plugins: {
                    legend: { position: 'right', labels: { color: '#cbd5e1', font: { size: 11 } } },
                    tooltip: {
                        callbacks: {
                            label: function (context) { return ' ￥' + context.parsed + ' / 天'; }
                        }
                    }
                },
                cutout: '70%'
            }
        });
        } catch(e) {
            console.error(e);
        }
    }

    async function renderTrendChart(range = '30d') {
        const ctx = document.getElementById('trendChart');
        if (!ctx) return;

        currentTrendRange = range;

        // Update UI buttons
        document.querySelectorAll('.trend-btn').forEach(btn => {
            if (btn.getAttribute('data-range') === range) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        try {
            const queryParams = new URLSearchParams({
                range: range,
                q: searchInput.value,
                status: filterSelect.value
            });
            const res = await fetch(`/api/stats/trend?${queryParams.toString()}`, { headers: getHeaders() });
            if (!res.ok) return;
            const trendData = await res.json();

            if (trendChartInstance) {
                trendChartInstance.destroy();
            }

            if (!trendData.data || trendData.data.length === 0) {
                ctx.classList.add('hidden');
                return;
            } else {
                ctx.classList.remove('hidden');
            }

            trendChartInstance = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: trendData.labels,
                    datasets: [{
                        label: '系统总日均耗散 (元)',
                        data: trendData.data,
                        borderColor: 'rgba(96, 165, 250, 1)',
                        backgroundColor: 'rgba(96, 165, 250, 0.1)',
                        borderWidth: 2,
                        pointBackgroundColor: 'rgba(15, 23, 42, 1)',
                        pointBorderColor: 'rgba(96, 165, 250, 1)',
                        pointHoverBackgroundColor: 'rgba(96, 165, 250, 1)',
                        fill: true,
                        tension: 0.4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: function (context) { return ' ¥' + context.parsed.y + ' / 天'; }
                            }
                        }
                    },
                    scales: {
                        x: {
                            grid: { display: false, color: 'rgba(255, 255, 255, 0.05)' },
                            ticks: { color: '#94a3b8', maxTicksLimit: 8 }
                        },
                        y: {
                            grid: { color: 'rgba(255, 255, 255, 0.05)' },
                            ticks: { color: '#94a3b8' },
                            beginAtZero: true
                        }
                    }
                }
            });
        } catch (e) {
            console.error("加载趋势图失败", e);
        }
    }

    // Bind Trend Controls
    document.querySelectorAll('.trend-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const range = btn.getAttribute('data-range');
            renderTrendChart(range);
        });
    });

    // --- Animation ---
    function animateValue(obj, start, end, duration, isCurrency) {
        let startTimestamp = null;
        const step = (timestamp) => {
            if (!startTimestamp) startTimestamp = timestamp;
            const progress = Math.min((timestamp - startTimestamp) / duration, 1);
            const easeProgress = 1 - Math.pow(1 - progress, 4);
            const currentVal = start + (end - start) * easeProgress;

            obj.textContent = isCurrency ?
                currentVal.toFixed(2) :
                Math.floor(currentVal);

            if (progress < 1) {
                window.requestAnimationFrame(step);
            } else {
                obj.textContent = isCurrency ? end.toFixed(2) : end;
            }
        };
        window.requestAnimationFrame(step);
    }

    // --- Export / Import Logic ---
    const exportCsvBtn = document.getElementById('exportCsvBtn');
    const backupExportBtn = document.getElementById('backupExportBtn');
    const backupImportBtn = document.getElementById('backupImportBtn');
    const importFileInput = document.getElementById('importFileInput');
    const importChoiceModal = document.getElementById('importChoiceModal');
    let tempDataToImport = null;

    if (exportCsvBtn) {
        exportCsvBtn.addEventListener('click', () => {
            if (!globalRecords || globalRecords.length === 0) {
                showAppAlert('没有可导出的数据');
                return;
            }

            const headers = ['ID', '归属组合ID', '物品名称', '花费金额', '购买日期', '状态', '记录时间', '结束日期', '回血残值', '日均成本(算后)', '总天数(算后)', '最终折算金额(算后)'];

            const rows = globalRecords.map(r => {
                const statusMap = { 'active': '使用中', 'broken': '已损坏', 'sold': '已售出' };
                const statusStr = statusMap[r.status] || '使用中';
                return [
                    r.id,
                    r.parent_id || '',
                    `"${r.item_name}"`,
                    r.price,
                    r.purchase_date,
                    statusStr,
                    r.created_at,
                    r.end_date || '',
                    r.resale_price || 0,
                    r._dailyCost?.toFixed(2) || '',
                    r._days || '',
                    r._finalCost?.toFixed(2) || ''
                ];
            });

            let csvContent = "data:text/csv;charset=utf-8,\uFEFF" + headers.join(',') + "\n";
            rows.forEach(rowArray => {
                const row = rowArray.join(",");
                csvContent += row + "\r\n";
            });

            const encodedUri = encodeURI(csvContent);
            const link = document.createElement("a");
            link.setAttribute("href", encodedUri);
            link.setAttribute("download", `DayCost_Export_${new Date().toISOString().split('T')[0]}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        });
    }

    if (backupExportBtn) {
        backupExportBtn.addEventListener('click', () => {
            if (!globalRecords || globalRecords.length === 0) {
                showAppAlert('没有可导出的数据');
                return;
            }

            // Exclude calculated frontend local values (_*)
            const cleanRecords = globalRecords.map(r => {
                const clean = { ...r };
                for (let key in clean) {
                    if (key.startsWith('_')) delete clean[key];
                }
                return clean;
            });

            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(cleanRecords, null, 2));
            const link = document.createElement("a");
            link.setAttribute("href", dataStr);
            link.setAttribute("download", `DayCost_Backup_${new Date().toISOString().split('T')[0]}.daycost`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        });
    }

    if (backupImportBtn) {
        backupImportBtn.addEventListener('click', () => {
            importFileInput.value = '';
            importFileInput.click();
        });
    }

    if (importFileInput) {
        importFileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = function (evt) {
                try {
                    const json = JSON.parse(evt.target.result);
                    if (!Array.isArray(json)) throw new Error('无效的文件格式');
                    tempDataToImport = json;
                    importChoiceModal.classList.remove('hidden');
                } catch (err) {
                    showAppAlert('解析备份文件失败: ' + err.message);
                }
            };
            reader.readAsText(file);
        });
    }

    if (importChoiceModal) {
        document.getElementById('importCancelBtn').addEventListener('click', () => {
            importChoiceModal.classList.add('hidden');
            tempDataToImport = null;
        });

        async function executeImport(mode) {
            importChoiceModal.classList.add('hidden');
            if (!tempDataToImport) return;

            try {
                const res = await fetch('/api/records/import', {
                    method: 'POST',
                    headers: getHeaders(),
                    body: JSON.stringify({
                        mode: mode,
                        records: tempDataToImport
                    })
                });
                const data = await res.json();
                if (res.ok) {
                    showAppAlert('数据恢复成功！');
                    loadHistory();
                } else {
                    showAppAlert(data.error);
                }
            } catch (e) {
                showAppAlert('导入请求失败');
            } finally {
                tempDataToImport = null;
            }
        }

        document.getElementById('importOverwriteBtn').addEventListener('click', () => executeImport('overwrite'));
        document.getElementById('importAppendBtn').addEventListener('click', () => executeImport('append'));
    }

    // --- Trash / Recycle Bin Logic ---
    async function loadTrash() {
        try {
            const res = await fetch('/api/records/trash', { headers: getHeaders() });
            if (!res.ok) throw new Error('无法加载废纸篓');
            globalTrashRecords = await res.json();
            renderTrash();
        } catch (e) {
            console.error(e);
            showAppAlert('获取废纸篓数据失败');
        }
    }

    function renderTrash() {
        const trashRows = globalTrashRecords.map(record => {
            // Calculate days left (30 days total)
            const deletedDate = new Date(record.deleted_at);
            const now = new Date();
            const diffTime = now - deletedDate;
            const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
            const daysLeft = Math.max(0, 30 - diffDays);

            let countdownClass = 'status-badge';
            if (daysLeft <= 3) countdownClass += ' bg-red';
            else if (daysLeft <= 7) countdownClass += ' bg-yellow';
            else countdownClass += ' bg-blue';

            const countdownBadge = `<span class="${countdownClass}" style="margin-left: 8px;">${daysLeft}天后清理</span>`;

            return `
                <div class="record-wrapper">
                    <div class="history-item deleted">
                        <div class="history-info">
                            <span class="history-name" style="color: #cbd5e1;">${record.item_name} ${countdownBadge}</span>
                            <span class="history-meta" style="color: #64748b;">买入 ¥${record.price.toFixed(2)} · 删于 ${record.deleted_at ? record.deleted_at.split(' ')[0] : '未知'}</span>
                        </div>
                        <div class="history-actions" style="display: flex; gap: 8px;">
                            <button class="status-btn" data-action="restore" data-record-id="${record.id}" title="还原记录" style="background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.2); padding: 5px 12px; border-radius: 10px;">↩️</button>
                            <button class="delete-btn" data-action="purge" data-record-id="${record.id}" title="粉碎销毁" style="background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.2); color: #ef4444; padding: 5px 12px; border-radius: 10px;">🔥</button>
                        </div>
                    </div>
                </div>
            `;
        });

        if (trashRows.length === 0) {
            trashRows.push('<div style="text-align:center; color:#94a3b8; padding: 40px;">废纸篓空空如也</div>');
        }

        if (!trashClusterizeInstance) {
            trashClusterizeInstance = new Clusterize({
                rows: trashRows,
                scrollId: 'trashListScroll',
                contentId: 'trashListContent'
            });
        } else {
            trashClusterizeInstance.update(trashRows);
        }
    }

    window.restoreRecord = async function (id) {
        try {
            const res = await fetch(`/api/records/restore/${id}`, { method: 'POST', headers: getHeaders() });
            const data = await res.json();
            if (res.ok) {
                showAppAlert('记录已还原到主页', 'success');
                loadTrash();
                loadHistory();
                loadStats();
            } else {
                showAppAlert(data.error || '还原失败：记录可能已过期');
            }
        } catch (e) {
            console.error(e);
            showAppAlert('网络故障，请稍后再试');
        }
    };

    window.purgeRecord = function (id) {
        showAppConfirm('彻底粉碎记录？', '此操作无法撤销，数据将永久从云端抹除。', async () => {
            try {
                const res = await fetch(`/api/records/purge/${id}`, { method: 'DELETE', headers: getHeaders() });
                if (res.ok) {
                    showAppAlert('记录已永久销毁');
                    loadTrash();
                } else {
                    const data = await res.json();
                    showAppAlert(data.error || '销毁过程中遇到问题');
                }
            } catch (e) {
                console.error(e);
                showAppAlert('销毁失败');
            }
        });
    };
    
    // --- ADMIN DASHBOARD ---
    
    window.loadAdminUsers = async function() {
        const tbody = document.getElementById('adminUsersList');
        if (!tbody) return;
        
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: #94a3b8; padding: 20px;">数据加载中...</td></tr>';
        
        try {
            const res = await fetch('/api/admin/users', { headers: getHeaders() });
            const data = await res.json();
            
            if (!res.ok) throw new Error(data.error || '获取用户列表失败');
            
            if (!data.data || data.data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: #94a3b8; padding: 20px;">暂无用户数据</td></tr>';
                return;
            }
            
            tbody.innerHTML = '';
            
            data.data.forEach(u => {
                const tr = document.createElement('tr');
                tr.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
                
                const roleBadge = u.role === 'admin' 
                    ? '<span style="background: rgba(239, 68, 68, 0.2); color: #ef4444; padding: 2px 8px; border-radius: 12px; font-size: 0.8rem;">管理员</span>'
                    : '<span style="background: rgba(59, 130, 246, 0.2); color: #3b82f6; padding: 2px 8px; border-radius: 12px; font-size: 0.8rem;">普通用户</span>';
                
                const safeUsername = escapeHtml(u.username);
                const delBtn = u.role === 'admin'
                    ? '<span style="color: #64748b; font-size: 0.8rem;">不可处决</span>'
                    : `<button onclick="deleteAdminUser(${u.id}, '${safeUsername}')" style="background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.5); color: #fca5a5; padding: 4px 10px; border-radius: 6px; cursor: pointer; transition: 0.2s;">处决</button>`;

                tr.innerHTML = `
                    <td style="padding: 12px 10px; color: #94a3b8;">#${u.id}</td>
                    <td style="padding: 12px 10px; font-weight: 600;">${safeUsername}</td>
                    <td style="padding: 12px 10px;">${roleBadge}</td>
                    <td style="padding: 12px 10px; color: #94a3b8;">${new Date(u.created_at).toLocaleDateString()}</td>
                    <td style="padding: 12px 10px; color: #f8fafc;">${u.total_items} 件</td>
                    <td style="padding: 12px 10px; color: #10b981;">¥${(u.total_spent || 0).toFixed(2)}</td>
                    <td style="padding: 12px 10px; text-align: right;">${delBtn}</td>
                `;
                tbody.appendChild(tr);
            });
        } catch (e) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: #ef4444; padding: 20px;">${escapeHtml(e.message)}</td></tr>`;
        }
    };
    
    window.deleteAdminUser = function(id, username) {
        showAppConfirm('处决确认', `确定要彻底歼灭用户 [${username}] 及其名下所有的消费记录吗？此操作属于物理删除，无法通过废纸篓还原！`, async () => {
            try {
                const res = await fetch(`/api/admin/user/${id}`, {
                    method: 'DELETE',
                    headers: getHeaders()
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || '处决失败');
                
                showAppAlert(data.message, 'success');
                loadAdminUsers();
            } catch (err) {
                showAppAlert(err.message, 'error');
            }
        }, '确认物理删除');
    };
    
    // --- Stats dimension views and list linkage ---
    const statsViewMeta = {
        tag: { title: '标签日均成本分布', empty: '暂无标签数据。给物品添加标签后会在这里汇总。' },
        status: { title: '状态日均成本分布', empty: '暂无状态数据。' },
        group: { title: '组合日均成本分布', empty: '暂无组合数据。' },
        month: { title: '月份投入分布', empty: '暂无月份数据。' }
    };

    const statusLabels = { active: '使用中', broken: '已损坏', sold: '已回血' };

    function recordDailyCost(record) {
        return Number(record._aggDailyCost ?? record._dailyCost ?? 0);
    }

    function recordPrice(record) {
        return Number(record._aggPrice ?? record.price ?? 0);
    }

    function topLevelStatsRecords() {
        return globalRecords.filter(r => !r.parent_id);
    }

    function addStatsBucket(map, key, label, record, metric = 'daily') {
        if (!key) return;
        if (!map.has(key)) {
            map.set(key, { key, label, dailyCost: 0, totalPrice: 0, count: 0 });
        }
        const bucket = map.get(key);
        bucket.dailyCost += recordDailyCost(record);
        bucket.totalPrice += recordPrice(record);
        bucket.count += 1;
        if (metric === 'price') bucket.value = bucket.totalPrice;
        else bucket.value = bucket.dailyCost;
    }

    function getStatsBuckets(view = statsActiveView) {
        const buckets = new Map();
        const records = view === 'group' ? topLevelStatsRecords() : globalRecords;

        records.forEach(record => {
            if (view === 'tag') {
                const tags = (record.tags || '').split(/[,，\s]+/).map(t => t.trim().replace(/^#/, '')).filter(Boolean);
                tags.forEach(tag => addStatsBucket(buckets, tag.toLowerCase(), `#${tag}`, record));
            } else if (view === 'status') {
                const key = record.status || 'active';
                addStatsBucket(buckets, key, statusLabels[key] || key, record);
            } else if (view === 'group') {
                addStatsBucket(buckets, String(record.id), record.item_name || '未命名组合', record);
            } else if (view === 'month') {
                const month = String(record.purchase_date || '').slice(0, 7);
                addStatsBucket(buckets, month, month, record, 'price');
            }
        });

        return [...buckets.values()]
            .map(bucket => ({ ...bucket, value: bucket.value ?? bucket.dailyCost }))
            .filter(bucket => bucket.value > 0)
            .sort((a, b) => b.value - a.value);
    }

    function statsFilterLabel(filter = statsLinkedFilter) {
        if (!filter) return '当前图表跟随账本列表筛选。';
        const label = filter.label || filter.value;
        const viewLabel = ({ tag: '标签', status: '状态', group: '组合', month: '月份' })[filter.type] || '筛选';
        return `已联动筛选：${viewLabel} ${label}`;
    }

    function updateStatsControls() {
        document.querySelectorAll('[data-stats-view]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.statsView === statsActiveView);
        });
        const title = document.getElementById('statsBreakdownTitle');
        if (title) title.textContent = statsViewMeta[statsActiveView]?.title || '统计分布';
        const label = document.getElementById('statsLinkLabel');
        if (label) label.textContent = statsFilterLabel();
    }

    function applyStatsFilter(type, value, label) {
        statsLinkedFilter = { type, value, label };
        if (type === 'status') {
            filterSelect.value = value;
            searchInput.value = '';
        } else {
            filterSelect.value = 'all';
            searchInput.value = '';
        }
        updateStatsControls();
        loadHistory(1, false);
    }

    function clearStatsFilter() {
        statsLinkedFilter = null;
        filterSelect.value = 'all';
        searchInput.value = '';
        updateStatsControls();
        loadHistory(1, false);
    }

    function renderStatsBreakdown() {
        updateStatsControls();
        const container = document.getElementById('tagStatsContainer');
        if (!container) return;

        const buckets = getStatsBuckets();
        const meta = statsViewMeta[statsActiveView] || statsViewMeta.tag;

        if (buckets.length === 0) {
            container.innerHTML = `<div class="empty-state">${meta.empty}</div>`;
            return;
        }

        const maxValue = buckets[0].value;
        container.innerHTML = buckets.map(bucket => {
            const percent = maxValue > 0 ? (bucket.value / maxValue) * 100 : 0;
            const isActive = statsLinkedFilter?.type === statsActiveView && String(statsLinkedFilter.value) === String(bucket.key);
            const mainValue = statsActiveView === 'month' ? formatCurrency(bucket.totalPrice) : `${formatCurrency(bucket.dailyCost)}<span style="font-size:0.7rem; color:#94a3b8;">/天</span>`;
            const subValue = statsActiveView === 'month'
                ? `${bucket.count} 条记录`
                : `${bucket.count} 条 · 总投入 ${formatCurrency(bucket.totalPrice)}`;
            return `
                <div class="tag-list-item ${isActive ? 'active' : ''}" data-stats-key="${escapeHtml(bucket.key)}" data-stats-label="${escapeHtml(bucket.label)}">
                    <div class="tag-list-header">
                        <span class="tag-list-name">${escapeHtml(bucket.label)}</span>
                        <span class="tag-list-cost">${mainValue}</span>
                    </div>
                    <div class="tag-progress-track">
                        <div class="tag-progress-fill" style="width: ${percent}%;"></div>
                    </div>
                    <div class="tag-list-sub">${subValue}</div>
                </div>
            `;
        }).join('');

        container.querySelectorAll('[data-stats-key]').forEach(item => {
            item.addEventListener('click', () => {
                applyStatsFilter(statsActiveView, item.dataset.statsKey, item.dataset.statsLabel);
            });
        });
    }

    renderChart = async function () {
        const ctx = document.getElementById('costChart');
        if (!ctx) return;

        const buckets = getStatsBuckets();
        const chartTitle = document.getElementById('chartTitle');
        const chartBackBtn = document.getElementById('chartBackBtn');
        if (chartBackBtn) chartBackBtn.classList.add('hidden');
        if (chartTitle) chartTitle.innerText = statsViewMeta[statsActiveView]?.title || '统计分布';

        if (costChartInstance) costChartInstance.destroy();
        if (buckets.length === 0) {
            ctx.classList.add('hidden');
            return;
        }
        ctx.classList.remove('hidden');

        costChartInstance = new Chart(ctx, {
            type: statsActiveView === 'month' ? 'bar' : 'doughnut',
            data: {
                labels: buckets.map(b => b.label),
                datasets: [{
                    data: buckets.map(b => Number(b.value.toFixed(2))),
                    backgroundColor: [
                        'rgba(59, 130, 246, 0.8)', 'rgba(16, 185, 129, 0.8)',
                        'rgba(245, 158, 11, 0.8)', 'rgba(239, 68, 68, 0.8)',
                        'rgba(167, 139, 250, 0.8)', 'rgba(148, 163, 184, 0.8)'
                    ],
                    borderColor: 'rgba(15, 23, 42, 1)',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                onClick: (event, elements) => {
                    if (!elements.length) return;
                    const bucket = buckets[elements[0].index];
                    applyStatsFilter(statsActiveView, bucket.key, bucket.label);
                },
                plugins: {
                    legend: { position: 'right', labels: { color: '#cbd5e1', font: { size: 11 } } },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                const suffix = statsActiveView === 'month' ? '' : ' / 天';
                                return ` ${formatCurrency(context.parsed.y ?? context.parsed)}${suffix}`;
                            }
                        }
                    }
                },
                scales: statsActiveView === 'month' ? {
                    x: { ticks: { color: '#94a3b8' }, grid: { display: false } },
                    y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.06)' }, beginAtZero: true }
                } : undefined,
                cutout: statsActiveView === 'month' ? undefined : '70%'
            }
        });
    };

    renderTrendChart = async function (range = currentTrendRange) {
        const ctx = document.getElementById('trendChart');
        if (!ctx) return;
        currentTrendRange = range;

        document.querySelectorAll('.trend-btn').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-range') === range);
        });

        const monthBuckets = getStatsBuckets('month').sort((a, b) => a.key.localeCompare(b.key));
        const labels = monthBuckets.map(b => b.label);
        const values = monthBuckets.map(b => Number(b.totalPrice.toFixed(2)));

        if (trendChartInstance) trendChartInstance.destroy();
        if (values.length === 0) {
            ctx.classList.add('hidden');
            return;
        }
        ctx.classList.remove('hidden');

        trendChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: '月度投入（元）',
                    data: values,
                    borderColor: 'rgba(96, 165, 250, 1)',
                    backgroundColor: 'rgba(96, 165, 250, 0.1)',
                    borderWidth: 2,
                    pointBackgroundColor: 'rgba(15, 23, 42, 1)',
                    pointBorderColor: 'rgba(96, 165, 250, 1)',
                    fill: true,
                    tension: 0.35
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                onClick: (event, elements) => {
                    if (!elements.length) return;
                    const bucket = monthBuckets[elements[0].index];
                    applyStatsFilter('month', bucket.key, bucket.label);
                },
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: context => ` ${formatCurrency(context.parsed.y)}` } }
                },
                scales: {
                    x: { grid: { display: false }, ticks: { color: '#94a3b8', maxTicksLimit: 8 } },
                    y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' }, beginAtZero: true }
                }
            }
        });
    };

    document.querySelectorAll('[data-stats-view]').forEach(btn => {
        btn.addEventListener('click', () => {
            statsActiveView = btn.dataset.statsView || 'tag';
            updateStatsControls();
            renderStatsBreakdown();
            renderChart();
        });
    });

    const statsClearFilterBtn = document.getElementById('statsClearFilterBtn');
    if (statsClearFilterBtn) {
        statsClearFilterBtn.addEventListener('click', clearStatsFilter);
    }

    // --- Clean UI overrides for repaired UTF-8 interface ---
    function cloneButtonWithHandler(button, handler) {
        if (!button) return null;
        const clone = button.cloneNode(true);
        button.replaceWith(clone);
        clone.addEventListener('click', handler);
        return clone;
    }

    function downloadTextFile(content, filename, mime = 'text/plain;charset=utf-8') {
        const blob = new Blob([content], { type: mime });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    cloneButtonWithHandler(document.getElementById('exportCsvBtn'), () => {
        if (!globalRecords || globalRecords.length === 0) {
            showAppAlert('没有可导出的数据');
            return;
        }

        const headers = ['ID', '归属组合ID', '物品名称', '花费金额', '购买日期', '状态', '记录时间', '结束日期', '回血金额', '日均成本', '总天数', '最终折算金额'];
        const statusMap = { active: '使用中', broken: '已损坏', sold: '已回血' };
        const rows = globalRecords.map(r => [
            r.id,
            r.parent_id || '',
            `"${String(r.item_name || '').replace(/"/g, '""')}"`,
            r.price,
            r.purchase_date,
            statusMap[r.status] || '使用中',
            r.created_at,
            r.end_date || '',
            r.resale_price || 0,
            r._dailyCost?.toFixed(2) || '',
            r._days || '',
            r._finalCost?.toFixed(2) || ''
        ]);

        const csv = '\uFEFF' + [headers.join(','), ...rows.map(row => row.join(','))].join('\r\n');
        downloadTextFile(csv, `DayCost_Export_${new Date().toISOString().split('T')[0]}.csv`, 'text/csv;charset=utf-8');
    });

    cloneButtonWithHandler(document.getElementById('backupExportBtn'), () => {
        if (!globalRecords || globalRecords.length === 0) {
            showAppAlert('没有可导出的数据');
            return;
        }

        const cleanRecords = globalRecords.map(r => {
            const clean = { ...r };
            Object.keys(clean).forEach(key => {
                if (key.startsWith('_')) delete clean[key];
            });
            return clean;
        });

        downloadTextFile(
            JSON.stringify(cleanRecords, null, 2),
            `DayCost_Backup_${new Date().toISOString().split('T')[0]}.daycost`,
            'application/json;charset=utf-8'
        );
    });

    cloneButtonWithHandler(document.getElementById('backupImportBtn'), () => {
        importFileInput.value = '';
        importFileInput.click();
    });

    const cleanImportFileInput = document.getElementById('importFileInput');
    if (cleanImportFileInput) {
        const clonedInput = cleanImportFileInput.cloneNode(true);
        cleanImportFileInput.replaceWith(clonedInput);
        clonedInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (evt) => {
                try {
                    const json = JSON.parse(evt.target.result);
                    if (!Array.isArray(json)) throw new Error('备份文件格式无效');
                    tempDataToImport = json;
                    importChoiceModal.classList.remove('hidden');
                } catch (err) {
                    showAppAlert('解析备份文件失败：' + err.message);
                }
            };
            reader.readAsText(file);
        });
    }

    cloneButtonWithHandler(document.getElementById('backupImportBtn'), () => {
        const input = document.getElementById('importFileInput');
        if (!input) return;
        input.value = '';
        input.click();
    });

    async function executeCleanImport(mode) {
        importChoiceModal.classList.add('hidden');
        if (!tempDataToImport) return;

        try {
            const res = await fetch('/api/records/import', {
                method: 'POST',
                headers: getHeaders(),
                body: JSON.stringify({ mode, records: tempDataToImport })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || '导入失败');

            showAppAlert('数据导入成功', 'success');
            loadHistory();
            loadStats();
        } catch (err) {
            showAppAlert(err.message || '导入请求失败');
        } finally {
            tempDataToImport = null;
        }
    }

    cloneButtonWithHandler(document.getElementById('importCancelBtn'), () => {
        importChoiceModal.classList.add('hidden');
        tempDataToImport = null;
    });
    cloneButtonWithHandler(document.getElementById('importOverwriteBtn'), () => executeCleanImport('overwrite'));
    cloneButtonWithHandler(document.getElementById('importAppendBtn'), () => executeCleanImport('append'));

    function renderTrash() {
        const trashRows = globalTrashRecords.map(record => {
            const deletedDate = new Date(record.deleted_at);
            const now = new Date();
            const diffDays = Math.floor((now - deletedDate) / (1000 * 60 * 60 * 24));
            const daysLeft = Math.max(0, 30 - diffDays);
            let countdownClass = 'status-badge';
            if (daysLeft <= 3) countdownClass += ' bg-red';
            else if (daysLeft <= 7) countdownClass += ' bg-yellow';
            else countdownClass += ' bg-blue';

            return `
                <div class="record-wrapper">
                    <div class="history-item deleted">
                        <div class="history-info">
                            <span class="history-name">${escapeHtml(record.item_name || '未命名')} <span class="${countdownClass}">${daysLeft}天后清理</span></span>
                            <span class="history-meta">买入 ${formatCurrency(record.price)} · 删除于 ${record.deleted_at ? record.deleted_at.split(' ')[0] : '未知'}</span>
                        </div>
                        <div class="history-actions" style="display:flex; gap:8px;">
                            <button class="status-btn" data-action="restore" data-record-id="${record.id}" title="恢复记录">恢复</button>
                            <button class="delete-btn" data-action="purge" data-record-id="${record.id}" title="永久删除">删除</button>
                        </div>
                    </div>
                </div>
            `;
        });

        if (trashRows.length === 0) {
            trashRows.push('<div class="empty-state">回收站为空</div>');
        }

        if (!trashClusterizeInstance) {
            trashClusterizeInstance = new Clusterize({
                rows: trashRows,
                scrollId: 'trashListScroll',
                contentId: 'trashListContent'
            });
        } else {
            trashClusterizeInstance.update(trashRows);
        }
    }

    window.restoreRecord = async function (id) {
        try {
            const res = await fetch(`/api/records/restore/${id}`, { method: 'POST', headers: getHeaders() });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || '恢复失败');

            showAppAlert('记录已恢复', 'success');
            loadTrash();
            loadHistory();
            loadStats();
        } catch (err) {
            showAppAlert(err.message || '恢复失败');
        }
    };

    window.purgeRecord = function (id) {
        showAppConfirm('永久删除？', '此操作无法撤销，记录会被永久移除。', async () => {
            try {
                const res = await fetch(`/api/records/purge/${id}`, { method: 'DELETE', headers: getHeaders() });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(data.error || '永久删除失败');

                showAppAlert('记录已永久删除', 'success');
                loadTrash();
            } catch (err) {
                showAppAlert(err.message || '永久删除失败');
            }
        }, '永久删除');
    };

    window.loadAdminUsers = async function() {
        const tbody = document.getElementById('adminUsersList');
        if (!tbody) return;

        tbody.innerHTML = '<tr><td colspan="7" class="empty-state">数据加载中...</td></tr>';

        try {
            const res = await fetch('/api/admin/users', { headers: getHeaders() });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || '获取用户列表失败');

            if (!data.data || data.data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" class="empty-state">暂无用户数据</td></tr>';
                return;
            }

            tbody.innerHTML = '';
            data.data.forEach(u => {
                const tr = document.createElement('tr');
                const roleBadge = u.role === 'admin'
                    ? '<span class="status-badge bg-red">管理员</span>'
                    : '<span class="status-badge bg-blue">普通用户</span>';
                const delBtn = u.role === 'admin'
                    ? '<span class="muted">不可删除</span>'
                    : `<button onclick="deleteAdminUser(${u.id}, '${escapeHtml(u.username)}')" class="btn-small">删除用户</button>`;

                tr.innerHTML = `
                    <td>#${u.id}</td>
                    <td>${escapeHtml(u.username)}</td>
                    <td>${roleBadge}</td>
                    <td>${new Date(u.created_at).toLocaleDateString()}</td>
                    <td>${u.total_items || 0} 件</td>
                    <td>${formatCurrency(u.total_spent || 0)}</td>
                    <td class="align-right">${delBtn}</td>
                `;
                tbody.appendChild(tr);
            });
        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="7" class="empty-state" style="color:#ef4444;">${escapeHtml(err.message)}</td></tr>`;
        }
    };

    window.deleteAdminUser = function(id, username) {
        showAppConfirm('删除用户？', `确定要删除用户「${username}」及其所有记录吗？此操作无法撤销。`, async () => {
            try {
                const res = await fetch(`/api/admin/user/${id}`, {
                    method: 'DELETE',
                    headers: getHeaders()
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || '删除用户失败');

                showAppAlert(data.message || '用户已删除', 'success');
                loadAdminUsers();
            } catch (err) {
                showAppAlert(err.message || '删除用户失败');
            }
        }, '确认删除');
    };

    // --- Mobile Swipe-to-Reveal Logic ---
    let touchStartX = 0;
    let swipeWrapper = null;
    
    window.handleSwipeStart = function(e) {
        if(window.innerWidth > 799) return; // Only on mobile
        const wrapper = e.currentTarget;
        
        // Auto-close other swiped items
        document.querySelectorAll('.swipe-wrapper.swiped').forEach(w => {
            if(w !== wrapper) {
                w.style.transform = 'translateX(0)';
                w.classList.remove('swiped');
            }
        });
        
        touchStartX = e.touches[0].clientX;
        swipeWrapper = wrapper;
        wrapper.style.transition = 'none'; // Instant follow finger
    };

    window.handleSwipeMove = function(e) {
        if(!swipeWrapper || window.innerWidth > 799) return;
        const currentX = e.touches[0].clientX;
        const diff = currentX - touchStartX;
        
        if (diff < 0 && diff > -110) { // Drag left
            swipeWrapper.style.transform = `translateX(${diff}px)`;
            if (Math.abs(diff) > 15) { 
                e.preventDefault(); // Stop vertical scroll if horizontal swipe detected
            }
        } else if (diff > 0 && swipeWrapper.classList.contains('swiped')) { // Drag right to close
            const newPos = -100 + diff;
            if (newPos <= 0) {
                swipeWrapper.style.transform = `translateX(${newPos}px)`;
            }
        }
    };

    window.handleSwipeEnd = function(e) {
        if(!swipeWrapper || window.innerWidth > 799) return;
        swipeWrapper.style.transition = 'transform 0.3s cubic-bezier(0.1, 0.7, 0.1, 1)';
        
        const transformStr = swipeWrapper.style.transform;
        let x = 0;
        if(transformStr.includes('translateX')) {
            x = parseInt(transformStr.replace('translateX(', '').replace('px)', ''));
        }
        
        if (x < -40) { // If dragged left enough, snap open
            swipeWrapper.style.transform = 'translateX(-100px)';
            swipeWrapper.classList.add('swiped');
        } else { // Snap back closed
            swipeWrapper.style.transform = 'translateX(0)';
            swipeWrapper.classList.remove('swiped');
        }
        swipeWrapper = null;
    };
    
    // Bind the loadAdminUsers to the nav tap if that pane is opened
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.getAttribute('data-target') === 'pane-admin') {
                loadAdminUsers();
            }
            // Load TOTP codes when switching to TOTP tab
            if (btn.getAttribute('data-target') === 'pane-totp') {
                loadTOTPCodes();
            }
        });
    });

    // --- TOTP ---
    let totpRefreshInterval = null;

    async function loadTOTPCodes() {
        try {
            const res = await fetch('/api/totp/codes', { headers: getHeaders() });
            if (!res.ok) return;
            const codes = await res.json();
            renderTOTPCards(codes);
            // Start auto-refresh
            clearInterval(totpRefreshInterval);
            totpRefreshInterval = setInterval(loadTOTPCodes, 1000);
        } catch (e) {
            console.error('TOTP load failed', e);
        }
    }

    function renderTOTPCards(codes) {
        const container = document.getElementById('totpCodesContainer');
        const emptyState = document.getElementById('totpEmptyState');
        if (!container) return;

        if (codes.length === 0) {
            container.innerHTML = '';
            if (emptyState) emptyState.style.display = 'block';
            return;
        }
        if (emptyState) emptyState.style.display = 'none';

        container.innerHTML = codes.map(c => {
            const pct = (c.remaining / c.period) * 100;
            let colorClass = 'green';
            if (c.remaining <= 5) colorClass = 'red';
            else if (c.remaining <= 10) colorClass = 'yellow';
            return `
                <div class="totp-card">
                    <div class="totp-card-header">
                        <div>
                            <div class="totp-label">${escapeHtml(c.label)}</div>
                            ${c.issuer ? `<div class="totp-issuer">${escapeHtml(c.issuer)}</div>` : ''}
                        </div>
                        <button class="totp-delete-btn" data-totp-id="${c.id}" title="删除">🗑️</button>
                    </div>
                    <div class="totp-code" data-totp-code="${c.code}" title="点击复制">${c.code.slice(0,3)} ${c.code.slice(3)}</div>
                    <div class="totp-progress-bar"><div class="totp-progress-fill ${colorClass}" style="width:${pct}%"></div></div>
                    <div class="totp-remaining">${c.remaining}s 后刷新</div>
                </div>
            `;
        }).join('');
    }

    // TOTP event delegation
    const totpContainer = document.getElementById('totpCodesContainer');
    if (totpContainer) {
        totpContainer.addEventListener('click', async (e) => {
            // Copy code
            const codeEl = e.target.closest('.totp-code');
            if (codeEl) {
                const code = codeEl.dataset.totpCode;
                try {
                    await navigator.clipboard.writeText(code);
                    codeEl.classList.add('copied');
                    setTimeout(() => codeEl.classList.remove('copied'), 1000);
                } catch (err) {
                    // Fallback: select text
                    const range = document.createRange();
                    range.selectNodeContents(codeEl);
                    window.getSelection().removeAllRanges();
                    window.getSelection().addRange(range);
                }
                return;
            }
            // Delete entry
            const delBtn = e.target.closest('.totp-delete-btn');
            if (delBtn) {
                const id = delBtn.dataset.totpId;
                if (!confirm('确定删除这个密钥？')) return;
                await fetch(`/api/totp/${id}`, { method: 'DELETE', headers: getHeaders() });
                loadTOTPCodes();
            }
        });
    }

    // TOTP add form
    const totpAddForm = document.getElementById('totpAddForm');
    if (totpAddForm) {
        totpAddForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const label = document.getElementById('totpLabel').value.trim();
            const secret = document.getElementById('totpSecret').value.trim();
            const issuer = document.getElementById('totpIssuer').value.trim();
            if (!label || !secret) return;
            try {
                const res = await fetch('/api/totp', {
                    method: 'POST',
                    headers: { ...getHeaders(), 'Content-Type': 'application/json' },
                    body: JSON.stringify({ label, secret, issuer })
                });
                if (res.ok) {
                    totpAddForm.reset();
                    loadTOTPCodes();
                } else {
                    const data = await res.json();
                    alert(data.error || '添加失败');
                }
            } catch (err) {
                alert('网络错误');
            }
        });
    }

});

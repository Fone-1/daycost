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

    // --- Pagination State ---
    let currentPage = 1;
    const itemsPerPage = 50;
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

    const chartBackBtn = document.getElementById('chartBackBtn');
    if (chartBackBtn) {
        chartBackBtn.addEventListener('click', () => {
            chartCurrentParentId = null;
            // Hacky but simple: re-render the history view (which re-renders charts)
            const event = new Event('submit');
            if (globalRecords.length > 0) {
                // Re-calculate simply by calling renderHistory again
                renderHistory();
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
        checkAuth();
    });

    function checkAuth() {
        const token = localStorage.getItem('daycost_token');
        const username = localStorage.getItem('daycost_username');
        const globalStatsBox = document.getElementById('globalStatsBox');

        if (token && username) {
            authSection.classList.add('hidden');
            dashboardSection.classList.remove('hidden');
            displayUsername.textContent = username;
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
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || '登录失败');

            localStorage.setItem('daycost_token', data.token);
            localStorage.setItem('daycost_username', data.username);
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
                body: JSON.stringify({ item_name: itemName, price, purchase_date: purchaseDateStr, parent_id, status, end_date, resale_price })
            });
            if (res.ok) {
                costForm.reset();
                // Reset conditional fields
                formEndDateGroup.classList.add('hidden');
                formResalePriceGroup.classList.add('hidden');
                dateInput.max = todayStr;
                dateInput.value = todayStr;
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

        return {
            dailyCost: finalCost / actualDaysForCalc,
            actualDaysForCalc,
            finalCost
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

        try {
            const res = await fetch(`/api/records/${id}`, {
                method: 'PUT',
                headers: getHeaders(),
                body: JSON.stringify({ item_name, price, purchase_date, status, end_date, resale_price, parent_id })
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
    });

    window.openStatusModal = function (id) {
        const record = globalRecords.find(r => r.id === id);
        if (!record) return;

        statusRecordId.value = record.id;
        statusEditName.value = record.item_name;
        statusEditParentId.value = record.parent_id || '';
        statusEditPrice.value = record.price;
        statusEditDate.value = record.purchase_date;

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
            topLevelRecords.map(r => `<option value="${r.id}">${r.item_name}</option>`).join('');

        parentSelect.innerHTML = optionsHtml;
        statusEditParentId.innerHTML = optionsHtml;
    }

    async function loadStats() {
        const globalStatsBox = document.getElementById('globalStatsBox');
        const globalTotalDaily = document.getElementById('globalTotalDaily');
        const globalTotalPrice = document.getElementById('globalTotalPrice');

        try {
            const res = await fetch('/api/stats', { headers: getHeaders() });
            if (!res.ok) return;
            const stats = await res.json();

            if (stats.total_count === 0) {
                if (globalStatsBox) globalStatsBox.classList.add('hidden');
                return;
            }

            if (globalStatsBox) globalStatsBox.classList.remove('hidden');

            const oldDailyVal = parseFloat(globalTotalDaily.textContent) || 0;
            animateValue(globalTotalDaily, oldDailyVal, stats.total_daily_cost, 800, true);

            const oldPriceVal = parseFloat(globalTotalPrice.textContent) || 0;
            animateValue(globalTotalPrice, oldPriceVal, stats.total_price, 800, true);

            document.getElementById('statTotal').textContent = stats.total_count;
            document.getElementById('statActive').textContent = stats.status_counts.active;
            document.getElementById('statBroken').textContent = stats.status_counts.broken;
            document.getElementById('statSold').textContent = stats.status_counts.sold;
        } catch (e) {
            console.error("加载统计数据失败", e);
        }
    }

    // --- History Logic (Optimized for Pagination) ---
    async function loadHistory(page = 1, append = false) {
        if (isLoadingRecords) return;
        isLoadingRecords = true;

        try {
            const sortByMap = { 'default': 'created_at', 'priceDesc': 'price' };
            const sortBy = sortByMap[sortSelect.value] || 'created_at';
            const sortOrder = sortSelect.value.toLowerCase().includes('asc') ? 'ASC' : 'DESC';
            const query = (searchInput.value || '').trim();
            const filter = filterSelect.value;

            const res = await fetch(`/api/records?page=${page}&limit=${itemsPerPage}&sortBy=${sortBy}&sortOrder=${sortOrder}&q=${encodeURIComponent(query)}&status=${filter}`, {
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
        currentPage = 1;
        loadHistory(1, false);
    });
    sortSelect.addEventListener('change', () => {
        currentPage = 1;
        loadHistory(1, false);
    });
    searchInput.addEventListener('input', () => {
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

    // Helper to generate a single historic item HTML
    function createItemHtml(record, isChild = false) {
        const status = record.status || 'active';
        let classModifiers = isChild ? 'child-item' : '';
        if (status === 'broken') classModifiers += ' broken';
        if (status === 'sold') classModifiers += ' sold';

        let badges = '';
        let metaHtml = `个体总价 ￥${record.price.toFixed(2)}${isChild ? '' : ` · 已用 ${record._days} 天`}`;

        if (status === 'broken') {
            badges = '<span class="status-badge bg-red">已损坏</span>';
        } else if (status === 'sold') {
            badges = '<span class="status-badge bg-yellow">已回血</span>';
            metaHtml = `个体积压 ￥${record._finalCost.toFixed(2)} (售￥${record.resale_price}) · 定格 ${record._days}天`;
        }

        return `
            <div class="history-item ${classModifiers}">
                <div class="history-info">
                    <span class="history-name" data-fulltext="${record.item_name}">${record.item_name} ${badges}</span>
                    <span class="history-meta" data-fulltext="${metaHtml.replace(/￥/g, '\xA5')}">${metaHtml}</span>
                </div>
                <div class="history-cost">
                    <div class="history-cost-val">￥${record._dailyCost.toFixed(2)}<span>/天</span></div>
                    <button class="status-btn" onclick="openStatusModal(${record.id})" title="修改">⚙️</button>
                    ${isChild ? '' : `<button class="delete-btn" onclick="deleteRecord(${record.id})" title="删除">🗑️</button>`}
                </div>
            </div>
        `;
    }

    function renderHistory() {
        const globalStatsBox = document.getElementById('globalStatsBox');
        const globalTotalDaily = document.getElementById('globalTotalDaily');
        const globalTotalPrice = document.getElementById('globalTotalPrice');

        if (globalRecords.length === 0 && globalStatsBox) {
            globalStatsBox.classList.add('hidden');
        } else if (globalStatsBox) {
            globalStatsBox.classList.remove('hidden');
        }

        const processedRecords = globalRecords.map(r => {
            const clone = { ...r };
            const costs = calculateCost(clone);
            clone._dailyCost = costs.dailyCost;
            clone._days = costs.actualDaysForCalc;
            clone._finalCost = costs.finalCost;
            return clone;
        });

        // 2. Separate into parents and children (Still needed for tree rendering)
        const childrenMap = {}; // parent_id -> array of children
        const topLevelRecords = [];

        processedRecords.forEach(r => {
            if (r.parent_id) {
                if (!childrenMap[r.parent_id]) childrenMap[r.parent_id] = [];
                childrenMap[r.parent_id].push(r);
            } else {
                topLevelRecords.push(r);
            }
        });

        // 3. FULL AGGREGATION: Aggregate costs into all parents before filtering!
        // This ensures a parent's cost is always correct even if some children are filtered out of view.
        topLevelRecords.forEach(parent => {
            parent._aggDailyCost = parent._dailyCost;
            parent._aggFinalCost = parent._finalCost;
            parent._aggPrice = parent.price;
            let aggMaxDays = parent._days;

            const children = childrenMap[parent.id] || [];
            children.forEach(child => {
                parent._aggDailyCost += child._dailyCost;
                parent._aggFinalCost += child._finalCost;
                parent._aggPrice += child.price;
                if (child._days > aggMaxDays) {
                    aggMaxDays = child._days;
                }
            });

            // To work with existing sorting logic seamlessly
            parent._dailyCost = parent._aggDailyCost;
            parent.price = parent._aggPrice;
            parent._finalCost = parent._aggFinalCost;
            parent._days = aggMaxDays;
        });

        // 4. Apply Advanced Tree Filtering - Removed (Moved to Server)

        let sortedRecords = [];
        const filteredChildrenMap = {}; // We will only render children inside this map!

        topLevelRecords.forEach(parent => {
            const allChildren = childrenMap[parent.id] || [];

            // In pagination mode, we assume server returned everything matching the current filter.
            // We only keep the parent if it's top-level. 
            sortedRecords.push(parent);
            filteredChildrenMap[parent.id] = allChildren;
        });

        // 5. Sorting
        const sortMode = sortSelect.value;
        const sortFn = (a, b) => {
            if (sortMode === 'costDesc') return b._dailyCost - a._dailyCost;
            if (sortMode === 'costAsc') return a._dailyCost - b._dailyCost;
            if (sortMode === 'priceDesc') return b.price - a.price;
            if (sortMode === 'daysDesc') return b._days - a._days;
            if (sortMode === 'daysAsc') return a._days - b._days;
            return b.id - a.id;
        };

        sortedRecords.sort(sortFn);

        // 6. Rendering (Virtual List via Clusterize)
        let virtualRows = [];

        if (sortedRecords.length === 0) {
            virtualRows.push('<div class="clusterize-no-data" style="text-align:center; color:#94a3b8; padding: 20px;">没有符合条件的记录</div>');
        } else {
            sortedRecords.forEach(record => {
                const children = filteredChildrenMap[record.id] || [];
                if (children.length > 0) children.sort(sortFn);

                // Push parent row
                virtualRows.push(`<div class="record-wrapper">${createItemHtml(record, false)}</div>`);

                // Check if children exist and if they are expanded
                if (children.length > 0) {
                    const totalChildren = children.length;
                    const isExpanded = !!expandedParents[record.id];
                    const btnText = isExpanded ? `▲ 收起零件明细` : `▼ 展开零件明细 (${totalChildren}个部件)`;

                    virtualRows.push(`<div class="record-wrapper"><button class="toggle-children-btn" style="width:100%; border-radius:10px; margin-top:5px; margin-bottom:5px;" onclick="toggleChildren(${record.id})">${btnText}</button></div>`);

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
        renderChart(processedRecords);
        renderTrendChart(currentTrendRange);
    }

    function renderChart(processedRecords) {
        const ctx = document.getElementById('costChart');
        if (!ctx) return;

        const chartTitle = document.getElementById('chartTitle');
        const chartBackBtn = document.getElementById('chartBackBtn');

        let dataToShow = [];

        if (!chartCurrentParentId) {
            if (chartBackBtn) chartBackBtn.classList.add('hidden');
            if (chartTitle) chartTitle.innerText = "前5大消费本体";

            const topLevelMap = {};
            processedRecords.forEach(r => {
                if (!r.parent_id) {
                    topLevelMap[r.id] = { ...r, _aggDailyCost: r._dailyCost };
                }
            });

            dataToShow = Object.values(topLevelMap);
        } else {
            if (chartBackBtn) chartBackBtn.classList.remove('hidden');
            const parent = processedRecords.find(r => r.id === chartCurrentParentId);
            if (chartTitle) chartTitle.innerText = parent ? `拆解: ${parent.item_name}` : '子项分布';

            // Do not show the parent itself, only children
            processedRecords.filter(r => r.parent_id === chartCurrentParentId).forEach(c => {
                dataToShow.push({ ...c, _aggDailyCost: c._dailyCost });
            });
        }

        const sortedForChart = dataToShow.sort((a, b) => b._aggDailyCost - a._aggDailyCost);

        let labels = [];
        let data = [];
        let otherCost = 0;
        let originalIds = [];

        sortedForChart.forEach((item, index) => {
            if (item._aggDailyCost <= 0) return;

            if (index < 5) {
                labels.push(item.item_name);
                data.push(item._aggDailyCost.toFixed(2));
                originalIds.push(item.id);
            } else {
                otherCost += item._aggDailyCost;
            }
        });

        if (otherCost > 0) {
            labels.push('其他项并集');
            data.push(otherCost.toFixed(2));
            originalIds.push(null);
        }

        if (costChartInstance) {
            costChartInstance.destroy();
        }

        if (data.length === 0) {
            ctx.classList.add('hidden');
            return;
        } else {
            ctx.classList.remove('hidden');
        }

        costChartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
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
                        const clickedId = originalIds[idx];
                        if (clickedId && !chartCurrentParentId) {
                            const hasChildren = processedRecords.some(r => r.parent_id === clickedId);
                            if (hasChildren) {
                                chartCurrentParentId = clickedId;
                                renderHistory();
                            }
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
            const res = await fetch(`/api/stats/trend?range=${range}`, { headers: getHeaders() });
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
                            <button class="status-btn" onclick="restoreRecord(${record.id})" title="还原记录" style="background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.2); padding: 5px 12px; border-radius: 10px;">↩️</button>
                            <button class="delete-btn" onclick="purgeRecord(${record.id})" title="粉碎销毁" style="background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.2); color: #ef4444; padding: 5px 12px; border-radius: 10px;">🔥</button>
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
});

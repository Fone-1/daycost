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
        tooltip.style.top  = y + 'px';
    }

    // --- Elements ---
    const userStatus = document.getElementById('userStatus');
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

    // --- State ---
    let isLoginMode = true;
    let globalRecords = [];

    // --- Initial Setup ---
    const todayStr = new Date().toISOString().split('T')[0];
    dateInput.max = todayStr;
    dateInput.value = todayStr;

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
            userStatus.style.display = 'flex';
            displayUsername.textContent = username;
            loadHistory();
        } else {
            authSection.classList.remove('hidden');
            dashboardSection.classList.add('hidden');
            userStatus.style.display = 'none';
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
                alert(data.message);
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

    // --- Calculator Logic ---
    costForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const itemName = document.getElementById('itemName').value.trim() || '该物品';
        const price = parseFloat(document.getElementById('price').value);
        const purchaseDateStr = document.getElementById('purchaseDate').value;
        const parent_id = parentSelect.value || null;
        
        // Mock a record temporarily for front end calculation
        const { dailyCost, actualDaysForCalc } = calculateCost({
            price, 
            purchase_date: purchaseDateStr,
            status: 'active'
        });

        // Save to backend
        try {
            const res = await fetch('/api/records', {
                method: 'POST',
                headers: getHeaders(),
                body: JSON.stringify({ item_name: itemName, price, purchase_date: purchaseDateStr, parent_id })
            });
            if (res.ok) {
                // 清空表格
                costForm.reset();
                dateInput.max = todayStr;
                dateInput.value = todayStr;
                loadHistory(); 

                // Display Modal
                modalResultTitle.textContent = `${itemName} 的日均成本为`;
                resultModal.classList.remove('hidden');
                animateValue(modalDailyCost, 0, dailyCost, 1000, true);
                animateValue(modalDaysUsed, 0, actualDaysForCalc, 800, false);
                animateValue(modalTotalCost, 0, price, 800, true);
            } else if (res.status === 401 || res.status === 403) {
                logoutBtn.click();
            }
        } catch(e) {
            console.error("保存失败", e);
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
            } else {
                alert(data.error || '更新失败');
            }
        } catch (err) { }
    });

    window.openStatusModal = function(id) {
        const record = globalRecords.find(r => r.id === id);
        if (!record) return;
        
        statusRecordId.value = record.id;
        statusEditName.value = record.item_name;
        statusEditParentId.value = record.parent_id || '';
        statusEditPrice.value = record.price;
        statusEditDate.value = record.purchase_date;
        
        // Prevent setting itself as parent
        const options = statusEditParentId.options;
        for(let i=0; i<options.length; i++){
            options[i].disabled = (parseInt(options[i].value) === id);
        }

        statusSelect.value = record.status || 'active';
        statusEndDate.value = record.end_date || todayStr;
        statusEndDate.max = todayStr;
        statusResalePrice.value = record.resale_price || '';
        
        statusSelect.dispatchEvent(new Event('change'));
        statusModal.classList.remove('hidden');
    };

    window.deleteRecord = async function(id) {
        const record = globalRecords.find(r => r.id === id);
        if (!record) return;

        const modal = document.getElementById('customConfirmModal');
        document.getElementById('confirmMessage').innerText = `您确定要永久删除 「${record.item_name}」 这条记录吗？\n(注意：如果有子零件需先解除绑定才能删除)`;
        modal.classList.remove('hidden');

        const oldOkBtn = document.getElementById('confirmOkBtn');
        const newOkBtn = oldOkBtn.cloneNode(true);
        oldOkBtn.replaceWith(newOkBtn);

        const oldCancelBtn = document.getElementById('confirmCancelBtn');
        const newCancelBtn = oldCancelBtn.cloneNode(true);
        oldCancelBtn.replaceWith(newCancelBtn);

        newCancelBtn.addEventListener('click', () => {
            modal.classList.add('hidden');
        });

        newOkBtn.addEventListener('click', async () => {
            modal.classList.add('hidden');
            try {
                const res = await fetch(`/api/records/${id}`, {
                    method: 'DELETE',
                    headers: getHeaders()
                });
                const data = await res.json();
                if (res.ok) {
                    loadHistory();
                } else {
                    alert(data.error);
                }
            } catch(e) {
                alert('删除失败');
            }
        });
    };

    function updateParentDropdowns() {
        const topLevelRecords = globalRecords.filter(r => !r.parent_id);
        const optionsHtml = '<option value="">- 独立物品 -</option>' + 
            topLevelRecords.map(r => `<option value="${r.id}">${r.item_name}</option>`).join('');
            
        parentSelect.innerHTML = optionsHtml;
        statusEditParentId.innerHTML = optionsHtml;
    }

    // --- History Logic ---
    async function loadHistory() {
        try {
            const res = await fetch('/api/records', { headers: getHeaders() });
            if (res.status === 401 || res.status === 403) {
                return logoutBtn.click();
            }
            globalRecords = await res.json();
            updateParentDropdowns();
            renderHistory();
        } catch(e) {
            console.error("加载历史记录失败", e);
        }
    }

    filterSelect.addEventListener('change', () => renderHistory());
    sortSelect.addEventListener('change', () => renderHistory());

    window.toggleChildren = function(parentId) {
        const container = document.getElementById(`children-${parentId}`);
        const btn = document.getElementById(`toggleBtn-${parentId}`);
        if(container.classList.contains('show')) {
            container.classList.remove('show');
            btn.innerHTML = `▼ 展开零件明细`;
        } else {
            container.classList.add('show');
            btn.innerHTML = `▲ 收起零件明细`;
        }
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
                    <span class="history-meta" data-fulltext="${metaHtml.replace(/￥/g,'\xA5')}">${metaHtml}</span>
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
        historyList.innerHTML = '';
        const globalStatsBox = document.getElementById('globalStatsBox');
        const globalTotalDaily = document.getElementById('globalTotalDaily');
        const globalTotalPrice = document.getElementById('globalTotalPrice');

        if (globalRecords.length === 0) {
            historyList.innerHTML = '<p style="text-align:center; color:#94a3b8; font-size:0.9rem;">暂无记录</p>';
            if (globalStatsBox) globalStatsBox.classList.add('hidden');
            return;
        }

        let totalGlobalDailyCost = 0;
        let totalGlobalPrice = 0;

        // 1. Calculate individual standard costs
        // IMPORTANT: We must deep/shallow clone each record.
        // Otherwise, setting parent.price = aggPrice below will mutate the global truth
        // and cause prices to explode upon re-sorting.
        const processedRecords = globalRecords.map(r => {
            const clone = { ...r };
            const costs = calculateCost(clone);
            clone._dailyCost = costs.dailyCost;
            clone._days = costs.actualDaysForCalc;
            clone._finalCost = costs.finalCost;
            totalGlobalDailyCost += clone._dailyCost;
            totalGlobalPrice += clone.price;
            return clone;
        });

        if (globalStatsBox) {
            globalStatsBox.classList.remove('hidden');
            
            // To make it look dynamic without crashing context heavily, use simple assignment
            const oldDailyVal = parseFloat(globalTotalDaily.textContent) || 0;
            if (oldDailyVal !== totalGlobalDailyCost && globalTotalDaily) {
                animateValue(globalTotalDaily, oldDailyVal, totalGlobalDailyCost, 800, true);
            }

            if (globalTotalPrice) {
                const oldPriceVal = parseFloat(globalTotalPrice.textContent) || 0;
                if (oldPriceVal !== totalGlobalPrice) {
                    animateValue(globalTotalPrice, oldPriceVal, totalGlobalPrice, 800, true);
                }
            }
        }

        // 2. Separate into parents and children
        const childrenMap = {}; // parent_id -> array of children
        const topLevelRecords = [];

        processedRecords.forEach(r => {
            if (r.parent_id) {
                if(!childrenMap[r.parent_id]) childrenMap[r.parent_id] = [];
                childrenMap[r.parent_id].push(r);
            } else {
                topLevelRecords.push(r);
            }
        });

        // 3. Aggregate costs into parents
        topLevelRecords.forEach(parent => {
            parent._aggDailyCost = parent._dailyCost;
            parent._aggFinalCost = parent._finalCost;
            parent._aggPrice = parent.price;
            
            const children = childrenMap[parent.id] || [];
            children.forEach(child => {
                parent._aggDailyCost += child._dailyCost;
                parent._aggFinalCost += child._finalCost;
                parent._aggPrice += child.price;
            });
            
            // To work with existing sorting logic seamlessly
            parent._dailyCost = parent._aggDailyCost; 
            parent.price = parent._aggPrice;
            parent._finalCost = parent._aggFinalCost;
        });

        // 4. Filtering (Apply to top-level records)
        let sortedRecords = [...topLevelRecords];
        const filterMode = filterSelect.value;
        if (filterMode !== 'all') {
            sortedRecords = sortedRecords.filter(r => (r.status || 'active') === filterMode);
        }

        if (sortedRecords.length === 0) {
            historyList.innerHTML = '<p style="text-align:center; color:#94a3b8; font-size:0.9rem;">没有符合条件的记录</p>';
            return;
        }

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

        // 6. Rendering
        sortedRecords.forEach(record => {
            const children = childrenMap[record.id] || [];
            if (children.length > 0) children.sort(sortFn);
            
            let wrapperHtml = `<div class="record-wrapper">`;
            
            wrapperHtml += createItemHtml(record, false);
            
            // Render children if exist
            if (children.length > 0) {
                const totalChildren = children.length;
                wrapperHtml += `<button class="toggle-children-btn" id="toggleBtn-${record.id}" onclick="toggleChildren(${record.id})">▼ 展开零件明细 (${totalChildren}个部件)</button>`;
                wrapperHtml += `<div class="children-container" id="children-${record.id}">`;
                children.forEach(child => {
                    wrapperHtml += createItemHtml(child, true);
                });
                wrapperHtml += `</div>`;
            }
            
            wrapperHtml += `</div>`;
            
            historyList.insertAdjacentHTML('beforeend', wrapperHtml);
        });

        // Bind tooltip to all newly rendered truncated candidates
        historyList.querySelectorAll('[data-fulltext]').forEach(el => {
            bindTooltip(el, el.dataset.fulltext);
        });
    }

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
});

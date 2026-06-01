(function () {
    function init(deps) {
        const { getHeaders, escapeHtml } = deps;

    // Load TOTP codes when switching to TOTP tab
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.getAttribute('data-target') === 'pane-totp') {
                loadTOTPGroups();
                loadTOTPCodes();
            }
        });
    });

    // --- TOTP ---
    let totpRefreshInterval = null;
    let totpCurrentGroup = null; // null = all
    const totpPendingGroups = []; // groups created by user but not yet in DB

    // Load groups into sidebar
    async function loadTOTPGroups() {
        try {
            const res = await fetch('/api/totp/groups', { headers: getHeaders() });
            if (!res.ok) return;
            const groups = await res.json();
            renderTOTPGroupSidebar(groups);
            renderTOTPGroupSelect(groups);
        } catch (e) {
            console.error('TOTP groups load failed', e);
        }
    }

    function renderTOTPGroupSidebar(groups) {
        const list = document.getElementById('totpGroupList');
        if (!list) return;

        // Merge DB groups with pending groups
        const allGroupNames = new Set(groups.map(g => g.group_name));
        const merged = [...groups];
        for (const pg of totpPendingGroups) {
            if (!allGroupNames.has(pg)) {
                merged.push({ group_name: pg, count: 0 });
            }
        }

        const total = groups.reduce((s, g) => s + g.count, 0);

        list.innerHTML = `
            <div class="totp-group-item ${totpCurrentGroup === null ? 'active' : ''}" data-group="">
                <span class="totp-group-name">全部</span>
                <span class="totp-group-count">${total}</span>
                <div class="totp-group-actions"></div>
            </div>
        ` + merged.map(g => `
            <div class="totp-group-item ${totpCurrentGroup === g.group_name ? 'active' : ''}" data-group="${escapeHtml(g.group_name)}">
                <span class="totp-group-name">${escapeHtml(g.group_name)}</span>
                <span class="totp-group-count">${g.count}</span>
                <div class="totp-group-actions">
                    <button class="totp-group-action-btn" data-action="rename" data-name="${escapeHtml(g.group_name)}" title="重命名">✏️</button>
                    ${g.group_name !== '默认分组' ? `<button class="totp-group-action-btn" data-action="delete" data-name="${escapeHtml(g.group_name)}" title="删除分组">🗑️</button>` : ''}
                </div>
            </div>
        `).join('');

        // Click handlers
        list.querySelectorAll('.totp-group-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const actionBtn = e.target.closest('.totp-group-action-btn');
                if (actionBtn) {
                    e.stopPropagation();
                    const action = actionBtn.dataset.action;
                    const name = actionBtn.dataset.name;
                    if (action === 'rename') renameTOTPGroup(name);
                    else if (action === 'delete') deleteTOTPGroup(name);
                    return;
                }
                const group = item.dataset.group || null;
                totpCurrentGroup = group;
                loadTOTPGroups();
                loadTOTPCodes();
            });
        });

        // Update section title
        const title = document.getElementById('totpSectionTitle');
        if (title) title.textContent = totpCurrentGroup ? `${totpCurrentGroup} - 验证码` : '验证码';
    }

    function renderTOTPGroupSelect(groups) {
        const sel = document.getElementById('totpGroupSelect');
        if (!sel) return;
        // Merge DB groups with pending groups
        const allGroupNames = new Set(groups.map(g => g.group_name));
        const merged = [...groups.map(g => g.group_name)];
        for (const pg of totpPendingGroups) {
            if (!allGroupNames.has(pg)) merged.push(pg);
        }
        if (!merged.includes('默认分组')) merged.unshift('默认分组');
        sel.innerHTML = merged.map(g =>
            `<option value="${escapeHtml(g)}" ${g === (totpCurrentGroup || '默认分组') ? 'selected' : ''}>${escapeHtml(g)}</option>`
        ).join('');
    }

    // --- TOTP Group Prompt Modal ---
    function showTOTPGroupModal(title, defaultValue, options) {
        // options: array of strings for dropdown, or null/undefined for text input
        return new Promise((resolve) => {
            const modal = document.getElementById('totpGroupModal');
            const titleEl = document.getElementById('totpGroupModalTitle');
            const input = document.getElementById('totpGroupModalInput');
            const inputWrap = document.getElementById('totpGroupModalInputWrap');
            const selectWrap = document.getElementById('totpGroupModalSelectWrap');
            const select = document.getElementById('totpGroupModalSelect');
            const errorEl = document.getElementById('totpGroupModalError');
            const confirmBtn = document.getElementById('totpGroupModalConfirm');
            const cancelBtn = document.getElementById('totpGroupModalCancel');
            const closeBtn = document.getElementById('totpGroupModalClose');

            titleEl.textContent = title;
            errorEl.classList.add('hidden');
            errorEl.textContent = '';

            if (options && options.length > 0) {
                // Select mode
                inputWrap.style.display = 'none';
                selectWrap.style.display = '';
                select.innerHTML = options.map(o =>
                    `<option value="${escapeHtml(o)}" ${o === defaultValue ? 'selected' : ''}>${escapeHtml(o)}</option>`
                ).join('');
                setTimeout(() => select.focus(), 100);
            } else {
                // Input mode
                inputWrap.style.display = '';
                selectWrap.style.display = 'none';
                input.value = defaultValue || '';
                setTimeout(() => input.focus(), 100);
            }

            modal.classList.remove('hidden');

            function cleanup() {
                modal.classList.add('hidden');
                confirmBtn.removeEventListener('click', onConfirm);
                cancelBtn.removeEventListener('click', onCancel);
                closeBtn.removeEventListener('click', onCancel);
                input.removeEventListener('keydown', onKeydown);
                select.removeEventListener('keydown', onKeydown);
            }

            function onConfirm() {
                const val = options && options.length > 0 ? select.value : input.value.trim();
                if (!val) {
                    errorEl.textContent = '名称不能为空';
                    errorEl.classList.remove('hidden');
                    return;
                }
                cleanup();
                resolve(val);
            }

            function onCancel() {
                cleanup();
                resolve(null);
            }

            function onKeydown(e) {
                if (e.key === 'Enter') { e.preventDefault(); onConfirm(); }
                if (e.key === 'Escape') { onCancel(); }
            }

            confirmBtn.addEventListener('click', onConfirm);
            cancelBtn.addEventListener('click', onCancel);
            closeBtn.addEventListener('click', onCancel);
            input.addEventListener('keydown', onKeydown);
            select.addEventListener('keydown', onKeydown);
        });
    }

    async function renameTOTPGroup(oldName) {
        const newName = await showTOTPGroupModal(`重命名分组`, oldName);
        if (!newName || newName === oldName) return;
        await fetch('/api/totp/group/rename', {
            method: 'PUT',
            headers: { ...getHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ oldName, newName })
        });
        if (totpCurrentGroup === oldName) totpCurrentGroup = newName;
        loadTOTPGroups();
        loadTOTPCodes();
    }

    async function deleteTOTPGroup(name) {
        if (!confirm(`删除分组 "${name}"？其中的密钥将移入"默认分组"`)) return;
        await fetch(`/api/totp/group/${encodeURIComponent(name)}`, { method: 'DELETE', headers: getHeaders() });
        if (totpCurrentGroup === name) totpCurrentGroup = null;
        loadTOTPGroups();
        loadTOTPCodes();
    }

    // Move TOTP entry to a different group
    async function showMoveGroupPicker(totpId, currentGroup) {
        // Get all groups
        const groupsRes = await fetch('/api/totp/groups', { headers: getHeaders() });
        const groups = groupsRes.ok ? await groupsRes.json() : [];
        const groupNames = groups.map(g => g.group_name);
        if (!groupNames.includes('默认分组')) groupNames.unshift('默认分组');
        for (const pg of totpPendingGroups) {
            if (!groupNames.includes(pg)) groupNames.push(pg);
        }

        const chosen = await showTOTPGroupModal('移动到分组', currentGroup, groupNames);
        if (!chosen || chosen === currentGroup) return;

        await fetch(`/api/totp/${totpId}`, {
            method: 'PUT',
            headers: { ...getHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ group: chosen })
        });
        if (!totpPendingGroups.includes(chosen)) {
            totpPendingGroups.push(chosen);
        }
        loadTOTPGroups();
        loadTOTPCodes();
    }

    // Add group button
    const totpAddGroupBtn = document.getElementById('totpAddGroupBtn');
    if (totpAddGroupBtn) {
        totpAddGroupBtn.addEventListener('click', async () => {
            const name = await showTOTPGroupModal('新建分组', '');
            if (!name) return;
            if (name === '默认分组') { alert('默认分组已存在'); return; }
            if (!totpPendingGroups.includes(name)) {
                totpPendingGroups.push(name);
            }
            totpCurrentGroup = name;
            loadTOTPGroups();
            loadTOTPCodes();
        });
    }

    async function loadTOTPCodes() {
        try {
            const url = totpCurrentGroup ? `/api/totp/codes?group=${encodeURIComponent(totpCurrentGroup)}` : '/api/totp/codes';
            const res = await fetch(url, { headers: getHeaders() });
            if (!res.ok) return;
            const codes = await res.json();
            renderTOTPCards(codes);
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
            const period = Number(c.period) || 30;
            const pct = (c.remaining / period) * 100;
            const formattedCode = String(c.code).replace(/(.{3})(?=.)/g, '$1 ');
            let colorClass = 'green';
            if (c.remaining <= 5) colorClass = 'red';
            else if (c.remaining <= 10) colorClass = 'yellow';
            return `
                <div class="totp-card">
                    <div class="totp-card-header">
                        <div>
                            <div class="totp-label" title="${escapeHtml(c.label)}">${escapeHtml(c.label)}</div>
                            ${c.issuer ? `<div class="totp-issuer" title="${escapeHtml(c.issuer)}">${escapeHtml(c.issuer)}</div>` : ''}
                        </div>
                        <div class="totp-card-actions">
                            <button class="totp-move-btn" data-totp-id="${c.id}" data-totp-group="${escapeHtml(c.group || '默认分组')}" title="移动分组">📁</button>
                            <button class="totp-delete-btn" data-totp-id="${c.id}" title="删除">🗑️</button>
                        </div>
                    </div>
                    <div class="totp-code" data-totp-code="${c.code}" title="点击复制">${formattedCode}</div>
                    <div class="totp-progress-bar"><div class="totp-progress-fill ${colorClass}" style="width:${pct}%"></div></div>
                    <div class="totp-card-footer">
                        <span class="totp-group-tag">${escapeHtml(c.group || '默认分组')}</span>
                        <span class="totp-remaining">${c.remaining}s</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    // TOTP event delegation
    const totpContainer = document.getElementById('totpCodesContainer');
    if (totpContainer) {
        totpContainer.addEventListener('click', async (e) => {
            const codeEl = e.target.closest('.totp-code');
            if (codeEl) {
                const code = codeEl.dataset.totpCode;
                try {
                    await navigator.clipboard.writeText(code);
                    codeEl.classList.add('copied');
                    setTimeout(() => codeEl.classList.remove('copied'), 1000);
                } catch (err) {
                    const range = document.createRange();
                    range.selectNodeContents(codeEl);
                    window.getSelection().removeAllRanges();
                    window.getSelection().addRange(range);
                }
                return;
            }
            const delBtn = e.target.closest('.totp-delete-btn');
            if (delBtn) {
                const id = delBtn.dataset.totpId;
                if (!confirm('确定删除这个密钥？')) return;
                await fetch(`/api/totp/${id}`, { method: 'DELETE', headers: getHeaders() });
                loadTOTPGroups();
                loadTOTPCodes();
                return;
            }
            // Move to group
            const moveBtn = e.target.closest('.totp-move-btn');
            if (moveBtn) {
                const id = moveBtn.dataset.totpId;
                const currentGroup = moveBtn.dataset.totpGroup;
                await showMoveGroupPicker(id, currentGroup);
                return;
            }
        });
    }

    // TOTP add key modal
    const totpAddKeyBtn = document.getElementById('totpAddKeyBtn');
    const totpAddKeyModal = document.getElementById('totpAddKeyModal');
    const totpAddKeyModalClose = document.getElementById('totpAddKeyModalClose');
    const totpAddKeyCancel = document.getElementById('totpAddKeyCancel');

    function openAddKeyModal() {
        if (totpAddKeyModal) totpAddKeyModal.classList.remove('hidden');
    }
    function closeAddKeyModal() {
        if (totpAddKeyModal) totpAddKeyModal.classList.add('hidden');
    }

    if (totpAddKeyBtn) totpAddKeyBtn.addEventListener('click', openAddKeyModal);
    if (totpAddKeyModalClose) totpAddKeyModalClose.addEventListener('click', closeAddKeyModal);
    if (totpAddKeyCancel) totpAddKeyCancel.addEventListener('click', closeAddKeyModal);
    if (totpAddKeyModal) {
        totpAddKeyModal.addEventListener('click', (e) => {
            if (e.target === totpAddKeyModal) { closeAddKeyModal(); }
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
            const groupSel = document.getElementById('totpGroupSelect');
            const group = groupSel ? groupSel.value : '默认分组';
            if (!label || !secret) return;
            try {
                const res = await fetch('/api/totp', {
                    method: 'POST',
                    headers: { ...getHeaders(), 'Content-Type': 'application/json' },
                    body: JSON.stringify({ label, secret, issuer, group })
                });
                if (res.ok) {
                    totpAddForm.reset();
                    closeAddKeyModal();
                    loadTOTPGroups();
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

    // TOTP QR Scan
    const totpScanBtn = document.getElementById('totpScanBtn');
    if (totpScanBtn) {
        totpScanBtn.addEventListener('click', () => {
            openScanModal();
        });
    }

    let scanStream = null;
    let scanAnimFrame = null;

    function parseOtpauthUri(uri) {
        // otpauth://totp/Label?secret=XXX&issuer=YYY&digits=6&period=30
        try {
            const url = new URL(uri);
            if (url.protocol !== 'otpauth:') return null;
            const params = url.searchParams;
            let label = decodeURIComponent(url.pathname.replace(/^\//, ''));
            // Label may contain issuer:account format
            const issuer = params.get('issuer') || '';
            if (label.includes(':')) {
                const parts = label.split(':');
                if (!issuer) label = parts[1].trim();
                else label = label;
            }
            const secret = params.get('secret');
            if (!secret) return null;
            const digits = parseInt(params.get('digits')) || 6;
            const period = parseInt(params.get('period')) || 30;
            return { label: label || 'Unknown', secret: secret.replace(/\s/g, '').toUpperCase(), issuer, digits, period };
        } catch (e) {
            return null;
        }
    }

    async function openScanModal() {
        const modal = document.getElementById('totpScanModal');
        const video = document.getElementById('totpScanVideo');
        const canvas = document.getElementById('totpScanCanvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        const resultDiv = document.getElementById('totpScanResult');
        const resultText = document.getElementById('totpScanResultText');
        const scanContinue = document.getElementById('totpScanContinue');
        const scanDone = document.getElementById('totpScanDone');
        const scanClose = document.getElementById('totpScanModalClose');

        resultDiv.classList.add('hidden');
        modal.classList.remove('hidden');

        try {
            // Check if getUserMedia is available
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error('当前环境不支持摄像头（需要 HTTPS 访问）');
            }
            scanStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } }
            });
            video.srcObject = scanStream;
            await video.play();
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            scanLoop(video, canvas, ctx, resultDiv, resultText);
        } catch (e) {
            let msg = '无法访问摄像头';
            if (e.name === 'NotAllowedError' || e.message.includes('Permission denied')) {
                msg = '摄像头权限被拒绝，请在浏览器设置中允许摄像头权限';
            } else if (e.name === 'NotFoundError') {
                msg = '未找到摄像头设备';
            } else if (e.name === 'NotReadableError') {
                msg = '摄像头被其他应用占用';
            } else if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
                msg = '扫码需要 HTTPS 访问（当前为 HTTP）';
            } else {
                msg = '无法访问摄像头：' + e.message;
            }
            resultText.textContent = msg;
            resultDiv.classList.remove('hidden');
        }

        function cleanup() {
            if (scanAnimFrame) { cancelAnimationFrame(scanAnimFrame); scanAnimFrame = null; }
            if (scanStream) { scanStream.getTracks().forEach(t => t.stop()); scanStream = null; }
            modal.classList.add('hidden');
        }

        scanClose.onclick = cleanup;
        scanDone.onclick = cleanup;
        scanContinue.onclick = () => {
            resultDiv.classList.add('hidden');
            scanLoop(video, canvas, ctx, resultDiv, resultText);
        };
    }

    function scanLoop(video, canvas, ctx, resultDiv, resultText) {
        if (!scanStream) return;
        if (video.readyState === video.HAVE_ENOUGH_DATA) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'dontInvert' });
            if (code && code.data) {
                handleScannedQR(code.data, resultDiv, resultText);
                return;
            }
        }
        scanAnimFrame = requestAnimationFrame(() => scanLoop(video, canvas, ctx, resultDiv, resultText));
    }

    async function handleScannedQR(data, resultDiv, resultText) {
        // Play a short beep
        try {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = audioCtx.createOscillator();
            osc.type = 'sine';
            osc.frequency.value = 1200;
            osc.connect(audioCtx.destination);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.1);
        } catch (e) {}

        const parsed = parseOtpauthUri(data);
        if (!parsed) {
            resultText.textContent = '无法识别的二维码（需要 otpauth:// 格式）';
            resultDiv.classList.remove('hidden');
            return;
        }

        try {
            const res = await fetch('/api/totp', {
                method: 'POST',
                headers: { ...getHeaders(), 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    label: parsed.label,
                    secret: parsed.secret,
                    issuer: parsed.issuer,
                    digits: parsed.digits,
                    period: parsed.period,
                    group: totpCurrentGroup || '默认分组'
                })
            });
            if (res.ok) {
                resultText.textContent = `✅ 已添加：${parsed.label}${parsed.issuer ? ' (' + parsed.issuer + ')' : ''}`;
                loadTOTPGroups();
                loadTOTPCodes();
            } else {
                const err = await res.json();
                resultText.textContent = '❌ 添加失败：' + (err.error || '未知错误');
            }
        } catch (e) {
            resultText.textContent = '❌ 网络错误';
        }
        resultDiv.classList.remove('hidden');
    }

    // TOTP Export
    const totpExportBtn = document.getElementById('totpExportBtn');
    if (totpExportBtn) {
        totpExportBtn.addEventListener('click', async () => {
            try {
                const res = await fetch('/api/totp/export', { headers: getHeaders() });
                if (!res.ok) { alert('导出失败'); return; }
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `daycost-totp-export-${new Date().toISOString().slice(0,10)}.json`;
                a.click();
                URL.revokeObjectURL(url);
            } catch (e) {
                alert('导出失败');
            }
        });
    }

    // TOTP Import button - trigger file input
    const totpImportBtn = document.getElementById('totpImportBtn');
    if (totpImportBtn) {
        totpImportBtn.addEventListener('click', () => {
            document.getElementById('totpImportFile').click();
        });
    }

    // TOTP Import
    let totpImportPending = null;
    const totpImportFile = document.getElementById('totpImportFile');
    if (totpImportFile) {
        totpImportFile.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                try {
                    const data = JSON.parse(ev.target.result);
                    let entries = [];
                    // Support DayCost format
                    if (data.type === 'daycost-totp' && Array.isArray(data.entries)) {
                        entries = data.entries;
                    }
                    // Support generic array format
                    else if (Array.isArray(data)) {
                        entries = data;
                    }
                    // Support Google Authenticator otpauth://migration format
                    else if (data.otpauth_migration && Array.isArray(data.otpauth_migration)) {
                        entries = data.otpauth_migration.map(e => ({
                            label: e.name || e.label || 'Unknown',
                            secret: e.secret,
                            issuer: e.issuer || '',
                            digits: e.digits,
                            period: e.period,
                            group: e.group || '默认分组'
                        }));
                    }
                    else {
                        alert('无法识别的文件格式');
                        return;
                    }
                    entries = entries.filter(e => e.label && e.secret);
                    if (entries.length === 0) {
                        alert('未找到有效密钥条目');
                        return;
                    }
                    totpImportPending = entries;
                    showTOTPImportPreview(entries);
                } catch (err) {
                    alert('文件解析失败：' + err.message);
                }
            };
            reader.readAsText(file);
            totpImportFile.value = '';
        });
    }

    function showTOTPImportPreview(entries) {
        const modal = document.getElementById('totpImportModal');
        const summary = document.getElementById('totpImportSummary');
        const preview = document.getElementById('totpImportPreview');
        if (!modal) return;

        const groups = {};
        entries.forEach(e => {
            const g = e.group || '默认分组';
            groups[g] = (groups[g] || 0) + 1;
        });
        const groupSummary = Object.entries(groups).map(([g, c]) => `${g}(${c})`).join('、');

        summary.textContent = `共 ${entries.length} 条密钥，分组：${groupSummary}`;
        preview.innerHTML = entries.map(e => `
            <div class="totp-import-item">
                <span>${escapeHtml(e.label)}${e.issuer ? ` (${escapeHtml(e.issuer)})` : ''}</span>
                <span class="totp-import-group">${escapeHtml(e.group || '默认分组')}</span>
            </div>
        `).join('');

        modal.classList.remove('hidden');
    }

    const totpImportModalClose = document.getElementById('totpImportModalClose');
    const totpImportCancel = document.getElementById('totpImportCancel');
    const totpImportConfirm = document.getElementById('totpImportConfirm');

    function closeTOTPImportModal() {
        const modal = document.getElementById('totpImportModal');
        if (modal) modal.classList.add('hidden');
        totpImportPending = null;
    }

    if (totpImportModalClose) totpImportModalClose.addEventListener('click', closeTOTPImportModal);
    if (totpImportCancel) totpImportCancel.addEventListener('click', closeTOTPImportModal);

    if (totpImportConfirm) {
        totpImportConfirm.addEventListener('click', async () => {
            if (!totpImportPending || totpImportPending.length === 0) return;
            try {
                const res = await fetch('/api/totp/import', {
                    method: 'POST',
                    headers: { ...getHeaders(), 'Content-Type': 'application/json' },
                    body: JSON.stringify({ entries: totpImportPending })
                });
                const data = await res.json();
                if (data.success) {
                    alert(`导入成功！已导入 ${data.imported} 条${data.skipped > 0 ? `，跳过 ${data.skipped} 条` : ''}`);
                    closeTOTPImportModal();
                    loadTOTPGroups();
                    loadTOTPCodes();
                } else {
                    alert(data.error || '导入失败');
                }
            } catch (e) {
                alert('导入失败：网络错误');
            }
        });
    }
    }

    window.DayCostTotp = { init };
}());

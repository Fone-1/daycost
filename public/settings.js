// --- Settings & Profile Module ---

const AVATAR_COLORS = ['#f59e0b', '#ef4444', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899'];

function getAvatarColor(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getInitialAvatarHTML(name, size) {
    const initial = (name || '?').charAt(0).toUpperCase();
    const color = getAvatarColor(name || '');
    return `<div class="initial-avatar" style="width:${size}px;height:${size}px;background:${color};font-size:${size * 0.45}px">${initial}</div>`;
}

function renderProfileAvatar(container, user, size) {
    if (!container) return;
    size = size || 80;
    if (user.avatar) {
        container.innerHTML = `<img src="${user.avatar}" alt="avatar" style="width:${size}px;height:${size}px;border-radius:50%;object-fit:cover">`;
    } else {
        container.innerHTML = getInitialAvatarHTML(user.nickname || user.username, size);
    }
}

async function loadProfile() {
    const token = localStorage.getItem('daycost_token');
    if (!token) return null;
    try {
        const res = await fetch('/api/auth/profile', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) return null;
        return await res.json();
    } catch {
        return null;
    }
}

async function initSettings() {
    const user = await loadProfile();
    if (!user) return;

    // Render profile card
    renderProfileAvatar(document.getElementById('profileAvatar'), user, 80);

    const nameEl = document.getElementById('profileName');
    if (nameEl) nameEl.textContent = user.nickname || user.username;

    const bioEl = document.getElementById('profileBio');
    if (bioEl) {
        bioEl.textContent = user.bio || '';
        bioEl.style.display = user.bio ? '' : 'none';
    }

    const statDays = document.getElementById('profileStatDays');
    const statTotal = document.getElementById('profileStatTotal');
    const statActive = document.getElementById('profileStatActive');
    if (statDays) statDays.textContent = user.stats.daysSinceRegistration;
    if (statTotal) statTotal.textContent = user.stats.totalAssets;
    if (statActive) statActive.textContent = user.stats.activeAssets;

    // Update version
    const versionEl = document.getElementById('appVersion');
    if (versionEl) versionEl.textContent = 'v' + (document.querySelector('meta[name="app-version"]')?.content || '1.0.0');

    // Store user data for modal
    window._profileData = user;

    // Bind edit button
    const editBtn = document.getElementById('editProfileBtn');
    if (editBtn && !editBtn._bound) {
        editBtn._bound = true;
        editBtn.addEventListener('click', () => openEditProfileModal());
    }
}

function openEditProfileModal() {
    const user = window._profileData;
    if (!user) return;

    const modal = document.getElementById('editProfileModal');
    const preview = document.getElementById('editAvatarPreview');
    const nicknameInput = document.getElementById('editNickname');
    const emailInput = document.getElementById('editEmail');
    const bioInput = document.getElementById('editBio');
    const errorEl = document.getElementById('editProfileError');

    // Fill form
    renderProfileAvatar(preview, user, 64);
    nicknameInput.value = user.nickname || '';
    emailInput.value = user.email || '';
    bioInput.value = user.bio || '';
    errorEl.classList.add('hidden');

    modal.classList.remove('hidden');
}

function closeEditProfileModal() {
    document.getElementById('editProfileModal').classList.add('hidden');
}

async function handleAvatarUpload(file) {
    if (!file) return;
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) {
        alert('请上传 jpg/png/webp 格式的图片');
        return;
    }
    if (file.size > 2 * 1024 * 1024) {
        alert('头像文件不能超过 2MB');
        return;
    }

    const token = localStorage.getItem('daycost_token');
    const formData = new FormData();
    formData.append('avatar', file);

    try {
        const res = await fetch('/api/auth/avatar', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '上传失败');

        window._profileData.avatar = data.avatar;
        renderProfileAvatar(document.getElementById('editAvatarPreview'), window._profileData, 64);
        renderProfileAvatar(document.getElementById('profileAvatar'), window._profileData, 80);
    } catch (err) {
        alert(err.message);
    }
}

async function handleAvatarRemove() {
    const token = localStorage.getItem('daycost_token');
    try {
        const res = await fetch('/api/auth/avatar', {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('移除失败');

        window._profileData.avatar = '';
        renderProfileAvatar(document.getElementById('editAvatarPreview'), window._profileData, 64);
        renderProfileAvatar(document.getElementById('profileAvatar'), window._profileData, 80);
    } catch (err) {
        alert(err.message);
    }
}

async function saveProfile(nickname, email, bio) {
    const token = localStorage.getItem('daycost_token');
    try {
        const res = await fetch('/api/auth/profile', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ nickname, email, bio })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '保存失败');

        window._profileData.nickname = nickname;
        window._profileData.email = email;
        window._profileData.bio = bio;

        // Update profile card
        const nameEl = document.getElementById('profileName');
        if (nameEl) nameEl.textContent = nickname || window._profileData.username;

        const bioEl = document.getElementById('profileBio');
        if (bioEl) {
            bioEl.textContent = bio;
            bioEl.style.display = bio ? '' : 'none';
        }

        // Re-render avatar (name may have changed for initial avatar)
        if (!window._profileData.avatar) {
            renderProfileAvatar(document.getElementById('profileAvatar'), window._profileData, 80);
        }

        return true;
    } catch (err) {
        throw err;
    }
}

// Bind all settings events
document.addEventListener('DOMContentLoaded', () => {
    // Edit profile modal close
    const closeBtn = document.getElementById('editProfileCloseBtn');
    if (closeBtn) closeBtn.addEventListener('click', closeEditProfileModal);

    const modal = document.getElementById('editProfileModal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeEditProfileModal();
        });
    }

    // Avatar upload
    const uploadBtn = document.getElementById('editAvatarUploadBtn');
    const avatarInput = document.getElementById('editAvatarInput');
    if (uploadBtn && avatarInput) {
        uploadBtn.addEventListener('click', () => avatarInput.click());
        avatarInput.addEventListener('change', (e) => {
            if (e.target.files[0]) handleAvatarUpload(e.target.files[0]);
            e.target.value = '';
        });
    }

    // Avatar remove
    const removeBtn = document.getElementById('editAvatarRemoveBtn');
    if (removeBtn) removeBtn.addEventListener('click', handleAvatarRemove);

    // Edit profile form submit
    const form = document.getElementById('editProfileForm');
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const nickname = document.getElementById('editNickname').value.trim();
            const email = document.getElementById('editEmail').value.trim();
            const bio = document.getElementById('editBio').value.trim();
            const errorEl = document.getElementById('editProfileError');

            try {
                await saveProfile(nickname, email, bio);
                closeEditProfileModal();
            } catch (err) {
                errorEl.textContent = err.message;
                errorEl.classList.remove('hidden');
            }
        });
    }
});

// Expose for script.js
window.initSettings = initSettings;

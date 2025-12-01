// Configuration - Update this to your backend URL
const API = 'http://localhost:8000/api';

// Authentication State
let currentUser = null;
let authToken = null;

// Media Tracker State
let mediaItems = [];
let currentFilter = 'all';
let editingId = null;
let deleteId = null;
let searchQuery = "";
let syncInterval = null;

// Icons SVG
const loginIcon = `<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path><polyline points="10 17 15 12 10 7"></polyline><line x1="15" y1="12" x2="3" y2="12"></line>`;
const signupIcon = `<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="20" y1="8" x2="20" y2="14"></line><line x1="23" y1="11" x2="17" y2="11"></line>`;

// Initialize application
document.addEventListener('DOMContentLoaded', function() {
    // Check if email verification token is in URL
    const urlParams = new URLSearchParams(window.location.search);
    const verifyToken = urlParams.get('verify');
    
    if (verifyToken) {
        verifyEmailWithToken(verifyToken);
    } else {
        initializeApp();
    }
});

async function verifyEmailWithToken(token) {
    document.getElementById('loading-screen').style.display = 'flex';
    
    try {
        const response = await fetch(`${API}/auth/verify-email?token=${token}`);
        const data = await response.json();
        
        if (response.ok) {
            alert(data.message);
            // Remove token from URL
            window.history.replaceState({}, document.title, window.location.pathname);
            initializeApp();
        } else {
            throw new Error(data.detail || 'Verification failed');
        }
    } catch (error) {
        alert('Email verification failed: ' + error.message);
        initializeApp();
    }
}

async function initializeApp() {
    // Check authentication
    authToken = localStorage.getItem('token');
    
    if (authToken) {
        try {
            await fetchCurrentUser();
            showMainApp();
            await initializeMediaTracker();
            startRealTimeSync();
        } catch (error) {
            console.error('Auth failed:', error);
            localStorage.removeItem('token');
            showAuthPage();
        }
    } else {
        showAuthPage();
    }
}

// ========== AUTHENTICATION FUNCTIONS ==========

let isLoginMode = true;

function showAuthPage() {
    document.getElementById('loading-screen').style.display = 'none';
    document.getElementById('auth-page').style.display = 'flex';
    document.getElementById('main-app').style.display = 'none';
    setupAuthListeners();
}

function showMainApp() {
    document.getElementById('loading-screen').style.display = 'none';
    document.getElementById('auth-page').style.display = 'none';
    document.getElementById('main-app').style.display = 'block';
    
    // Update header with user info
    if (currentUser) {
        document.getElementById('header-user-name').textContent = currentUser.name;
    }
}

function setupAuthListeners() {
    const authForm = document.getElementById('auth-form');
    const toggleBtn = document.getElementById('toggle-btn');
    const logoutBtn = document.getElementById('logout-btn');
    
    authForm.removeEventListener('submit', handleAuthSubmit);
    authForm.addEventListener('submit', handleAuthSubmit);
    
    toggleBtn.removeEventListener('click', toggleAuthMode);
    toggleBtn.addEventListener('click', toggleAuthMode);
    
    if (logoutBtn) {
        logoutBtn.removeEventListener('click', handleLogout);
        logoutBtn.addEventListener('click', handleLogout);
    }
}

function toggleAuthMode() {
    isLoginMode = !isLoginMode;
    
    const authIconSvg = document.getElementById('auth-icon-svg');
    const authTitle = document.getElementById('auth-title');
    const authSubtitle = document.getElementById('auth-subtitle');
    const submitText = document.getElementById('submit-text');
    const toggleText = document.getElementById('toggle-text');
    const toggleBtn = document.getElementById('toggle-btn');
    const nameGroup = document.getElementById('name-group');
    const nameInput = document.getElementById('auth-name');
    
    document.getElementById('auth-form').reset();
    hideAuthError();
    hideAuthSuccess();
    
    if (isLoginMode) {
        authIconSvg.innerHTML = loginIcon;
        authTitle.textContent = 'Welcome Back';
        authSubtitle.textContent = 'Sign in to continue';
        submitText.textContent = 'Sign In';
        toggleText.textContent = "Don't have an account?";
        toggleBtn.textContent = 'Sign Up';
        nameGroup.style.display = 'none';
        nameInput.removeAttribute('required');
    } else {
        authIconSvg.innerHTML = signupIcon;
        authTitle.textContent = 'Create Account';
        authSubtitle.textContent = 'Sign up to get started';
        submitText.textContent = 'Sign Up';
        toggleText.textContent = 'Already have an account?';
        toggleBtn.textContent = 'Sign In';
        nameGroup.style.display = 'flex';
        nameInput.setAttribute('required', 'required');
    }
}

async function handleAuthSubmit(e) {
    e.preventDefault();
    hideAuthError();
    hideAuthSuccess();
    
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const name = document.getElementById('auth-name').value;
    
    // Validate password length
    if (password.length < 8) {
        showAuthError('Password must be at least 8 characters long');
        return;
    }
    
    const submitBtn = document.querySelector('.auth-submit-btn');
    const submitText = document.getElementById('submit-text');
    submitBtn.disabled = true;
    submitText.textContent = 'Please wait...';
    
    try {
        const endpoint = isLoginMode ? '/auth/login' : '/auth/signup';
        const payload = isLoginMode
            ? { email, password }
            : { email, password, name };
        
        const response = await fetch(`${API}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        let data;
        try {
            data = await response.json();
        } catch (err) {
            data = {};
        }
        
        if (!response.ok) {
            throw new Error(data.detail || 'Authentication failed');
        }
        
        if (isLoginMode) {
            // Login successful
            authToken = data.access_token;
            currentUser = data.user;
            localStorage.setItem('token', authToken);
            
            // Show main app
            showMainApp();
            await initializeMediaTracker();
            startRealTimeSync();
        } else {
            // Signup successful - show success message
            showAuthSuccess(data.message);
            // Switch to login mode after 3 seconds
            setTimeout(() => {
                toggleAuthMode();
            }, 3000);
        }
        
    } catch (error) {
        showAuthError(error.message);
    } finally {
        submitBtn.disabled = false;
        submitText.textContent = isLoginMode ? 'Sign In' : 'Sign Up';
    }
}

async function fetchCurrentUser() {
    const response = await fetch(`${API}/auth/me`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
    });
    
    if (!response.ok) {
        throw new Error('Authentication failed');
    }
    
    currentUser = await response.json();
}

function handleLogout() {
    stopRealTimeSync();
    localStorage.removeItem('token');
    authToken = null;
    currentUser = null;
    mediaItems = [];
    isLoginMode = true;
    showAuthPage();
}

function showAuthError(message) {
    const errorEl = document.getElementById('auth-error-message');
    errorEl.textContent = message;
    errorEl.style.display = 'block';
}

function hideAuthError() {
    const errorEl = document.getElementById('auth-error-message');
    errorEl.textContent = '';
    errorEl.style.display = 'none';
}

function showAuthSuccess(message) {
    const successEl = document.getElementById('auth-success-message');
    successEl.textContent = message;
    successEl.style.display = 'block';
}

function hideAuthSuccess() {
    const successEl = document.getElementById('auth-success-message');
    successEl.textContent = '';
    successEl.style.display = 'none';
}

// ========== MEDIA TRACKER FUNCTIONS ==========

async function initializeMediaTracker() {
    await loadMediaFromServer();
    renderMedia();
    setupMediaEventListeners();
}

function setupMediaEventListeners() {
    // Filter buttons
    const filterButtons = document.querySelectorAll('.filter-chip');
    filterButtons.forEach(button => {
        button.addEventListener('click', function() {
            filterButtons.forEach(btn => btn.classList.remove('active'));
            this.classList.add('active');
            currentFilter = this.dataset.filter;
            renderMedia();
        });
    });

    // Search input
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', function() {
            searchQuery = this.value.toLowerCase();
            renderMedia();
        });
    }

    // Form submission
    const mediaForm = document.getElementById('mediaForm');
    mediaForm.addEventListener('submit', function(e) {
        e.preventDefault();
        saveMedia();
    });

    // Media type change
    const mediaTypeSelect = document.getElementById('mediaType');
    mediaTypeSelect.addEventListener('change', updateStatusLabels);

    // Current/Total inputs validation
    const currentInput = document.getElementById('mediaCurrent');
    const totalInput = document.getElementById('mediaTotal');

    totalInput.addEventListener('input', () => {
        const total = parseInt(totalInput.value);
        const current = parseInt(currentInput.value);
        if (!isNaN(total) && total < current) {
            totalInput.value = current;
        }
    });

    currentInput.addEventListener('input', () => {
        const total = parseInt(totalInput.value);
        const current = parseInt(currentInput.value);
        if (!isNaN(total) && current > total) {
            currentInput.value = total;
        }
    });
}

async function loadMediaFromServer() {
    try {
        const response = await fetch(`${API}/media`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        if (!response.ok) {
            throw new Error('Failed to load media items');
        }
        
        mediaItems = await response.json();
    } catch (error) {
        console.error('Error loading media:', error);
        mediaItems = [];
    }
}

function updateStatusLabels() {
    const mediaType = document.getElementById('mediaType').value;
    const statusSelect = document.getElementById('mediaStatus');
    const totalLabel = document.getElementById('mediaTotalLabel');
    const isAnime = mediaType === 'anime';

    const planOption = statusSelect.querySelector('option[value="plan"]');
    const readingOption = statusSelect.querySelector('option[value="reading"]');

    if (planOption) {
        planOption.textContent = isAnime ? 'Plan to Watch' : 'Plan to Read';
    }
    if (readingOption) {
        readingOption.textContent = isAnime ? 'Watching' : 'Reading';
    }
    if (totalLabel) {
        totalLabel.textContent = isAnime ? 'Total Episodes' : 'Total Chapters';
    }
}

function renderMedia() {
    const grid = document.getElementById('mediaGrid');

    let filteredItems = mediaItems.filter(item => {
        const matchesType = currentFilter === 'all' || item.type === currentFilter;
        const matchesSearch = item.title.toLowerCase().includes(searchQuery);
        return matchesType && matchesSearch;
    });

    filteredItems.sort((a, b) => a.title.localeCompare(b.title));

    grid.innerHTML = '';

    if (filteredItems.length === 0) {
        grid.innerHTML = `
            <div class="empty-state">
                <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 7v14"></path>
                    <path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"></path>
                </svg>
                <h3>No media found</h3>
                <p>Add your first ${currentFilter === 'all' ? 'media' : currentFilter} to get started!</p>
            </div>
        `;
        return;
    }

    filteredItems.forEach(item => {
        const card = createMediaCard(item);
        grid.appendChild(card);
    });
}

function createMediaCard(item) {
    const card = document.createElement('div');
    card.className = 'media-card';
    card.dataset.testid = `media-card-${item.id}`;

    const percentage = item.total > 0 ? Math.min(100, Math.round((item.current / item.total) * 100)) : 0;
    const statusInfo = getStatusInfo(item.status, item.type);

    card.innerHTML = `
        <div class="card-header">
            <div class="card-title-section">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 7v14"></path>
                    <path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"></path>
                </svg>
                <h3 class="card-title" data-testid="media-title-${item.id}">${escapeHtml(item.title)}</h3>
            </div>
            <div class="card-actions">
                <button data-testid="edit-button-${item.id}" class="edit-button" onclick="editMedia('${item.id}')">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                        <path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z"></path>
                    </svg>
                </button>
                <button data-testid="delete-button-${item.id}" class="delete-button" onclick="showDeleteModal('${item.id}')">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M3 6h18"></path>
                        <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                        <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                        <line x1="10" x2="10" y1="11" y2="17"></line>
                        <line x1="14" x2="14" y1="11" y2="17"></line>
                    </svg>
                </button>
            </div>
        </div>
        <div class="card-content">
            <div class="type-badge" data-testid="type-badge-${item.id}">${capitalizeFirst(item.type)}</div>
            <div class="status-select" data-testid="status-select-${item.id}" onclick="changeStatus('${item.id}')">
                <div class="status-badge-wrapper">
                    <span class="status-dot ${item.status}"></span>
                    <span>${statusInfo.label}</span>
                </div>
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.5; width: 16px; height: 16px;">
                    <path d="m6 9 6 6 6-6"></path>
                </svg>
            </div>
            <div class="progress-section">
                <div class="progress-controls">
                    <button data-testid="decrease-progress-${item.id}" class="progress-button" onclick="decreaseProgress('${item.id}')" ${item.current <= 0 ? 'disabled' : ''}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M5 12h14"></path>
                        </svg>
                    </button>
                    <span class="progress-text" data-testid="progress-text-${item.id}">
                        ${item.current} / ${item.total ? item.total : "-"}
                    </span>
                    <button data-testid="increase-progress-${item.id}" class="progress-button" onclick="increaseProgress('${item.id}')" ${item.current >= item.total ? 'disabled' : ''}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M5 12h14"></path>
                            <path d="M12 5v14"></path>
                        </svg>
                    </button>
                </div>
                <div class="progress-bar-container">
                    <div class="progress-bar" data-testid="progress-bar-${item.id}">
                        <div class="progress-bar-fill" style="width: ${percentage}%"></div>
                    </div>
                    <span class="progress-percentage">${percentage}%</span>
                </div>
            </div>
        </div>
    `;

    return card;
}

function getStatusInfo(status, type) {
    const isAnime = type === 'anime';
    const statusMap = {
        'plan': { label: isAnime ? 'Plan to Watch' : 'Plan to Read', color: 'gray' },
        'reading': { label: isAnime ? 'Watching' : 'Reading', color: 'blue' },
        'completed': { label: 'Completed', color: 'green' },
        'on-hold': { label: 'On Hold', color: 'yellow' },
        'dropped': { label: 'Dropped', color: 'red' }
    };
    return statusMap[status] || statusMap['plan'];
}

function showAddModal() {
    editingId = null;
    document.getElementById('modalTitle').textContent = 'Add Media';
    document.getElementById('mediaForm').reset();
    document.getElementById('mediaId').value = '';
    updateStatusLabels();
    document.getElementById('mediaModal').classList.add('active');
}

function editMedia(id) {
    const item = mediaItems.find(m => m.id === id);
    if (!item) return;

    editingId = id;
    document.getElementById('modalTitle').textContent = 'Edit Media';
    document.getElementById('mediaId').value = item.id;
    document.getElementById('mediaTitle').value = item.title;
    document.getElementById('mediaType').value = item.type;
    document.getElementById('mediaStatus').value = item.status;
    document.getElementById('mediaCurrent').value = item.current;
    document.getElementById('mediaTotal').value = item.total;
    updateStatusLabels();
    document.getElementById('mediaModal').classList.add('active');
}

function closeModal() {
    document.getElementById('mediaModal').classList.remove('active');
    editingId = null;
}

async function saveMedia() {
    const title = document.getElementById('mediaTitle').value.trim();
    const type = document.getElementById('mediaType').value;
    const status = document.getElementById('mediaStatus').value;
    const current = parseInt(document.getElementById('mediaCurrent').value) || 0;
    const total = parseInt(document.getElementById('mediaTotal').value) || 0;

    if (!title || !type) {
        alert('Please fill in all required fields');
        return;
    }

    try {
        if (editingId) {
            // Update existing item
            const response = await fetch(`${API}/media/${editingId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                },
                body: JSON.stringify({ title, type, status, current, total })
            });

            if (!response.ok) {
                throw new Error('Failed to update media');
            }
        } else {
            // Create new item
            const response = await fetch(`${API}/media`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                },
                body: JSON.stringify({ title, type, status, current, total })
            });

            if (!response.ok) {
                throw new Error('Failed to create media');
            }
        }

        // Reload media and render
        await loadMediaFromServer();
        renderMedia();
        closeModal();
    } catch (error) {
        alert('Error saving media: ' + error.message);
    }
}

async function changeStatus(id) {
    const item = mediaItems.find(m => m.id === id);
    if (!item) return;

    const statuses = ['plan', 'reading', 'on-hold', 'completed', 'dropped'];
    const currentIndex = statuses.indexOf(item.status);
    const nextIndex = (currentIndex + 1) % statuses.length;
    const newStatus = statuses[nextIndex];

    try {
        const response = await fetch(`${API}/media/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ status: newStatus })
        });

        if (!response.ok) {
            throw new Error('Failed to update status');
        }

        await loadMediaFromServer();
        renderMedia();
    } catch (error) {
        console.error('Error updating status:', error);
    }
}

async function increaseProgress(id) {
    const item = mediaItems.find(m => m.id === id);
    if (!item) return;

    let newCurrent = item.current + 1;
    let newStatus = item.status;

    if (!item.total || isNaN(item.total)) {
        // No total set
    } else {
        if (newCurrent > item.total) return;
        if (newCurrent >= item.total && item.status !== 'completed') {
            newStatus = 'completed';
        }
    }

    try {
        const response = await fetch(`${API}/media/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ current: newCurrent, status: newStatus })
        });

        if (!response.ok) {
            throw new Error('Failed to update progress');
        }

        await loadMediaFromServer();
        renderMedia();
    } catch (error) {
        console.error('Error updating progress:', error);
    }
}

async function decreaseProgress(id) {
    const item = mediaItems.find(m => m.id === id);
    if (!item || item.current <= 0) return;

    const newCurrent = Math.max(0, item.current - 1);

    try {
        const response = await fetch(`${API}/media/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ current: newCurrent })
        });

        if (!response.ok) {
            throw new Error('Failed to update progress');
        }

        await loadMediaFromServer();
        renderMedia();
    } catch (error) {
        console.error('Error updating progress:', error);
    }
}

function showDeleteModal(id) {
    deleteId = id;
    document.getElementById('deleteModal').classList.add('active');
}

function closeDeleteModal() {
    document.getElementById('deleteModal').classList.remove('active');
    deleteId = null;
}

async function confirmDelete() {
    if (!deleteId) return;

    try {
        const response = await fetch(`${API}/media/${deleteId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to delete media');
        }

        await loadMediaFromServer();
        renderMedia();
        closeDeleteModal();
    } catch (error) {
        alert('Error deleting media: ' + error.message);
    }
}

// Real-time sync - poll server every 5 seconds for updates
function startRealTimeSync() {
    // Sync every 5 seconds
    syncInterval = setInterval(async () => {
        try {
            await loadMediaFromServer();
            renderMedia();
        } catch (error) {
            console.error('Sync error:', error);
        }
    }, 5000);
}

function stopRealTimeSync() {
    if (syncInterval) {
        clearInterval(syncInterval);
        syncInterval = null;
    }
}

window.onclick = function(event) {
    const mediaModal = document.getElementById('mediaModal');
    const deleteModal = document.getElementById('deleteModal');

    if (event.target === mediaModal) {
        closeModal();
    }
    if (event.target === deleteModal) {
        closeDeleteModal();
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function capitalizeFirst(text) {
    return text.charAt(0).toUpperCase() + text.slice(1);
}

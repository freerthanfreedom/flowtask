/* ============================================================
   FlowTask — 업무 관리 앱 (app.js)
   Firebase Auth (Google) + Firestore 기반
   ============================================================ */

import { auth, db, googleProvider } from './firebase-config.js';
import {
    signInWithPopup,
    signOut,
    onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/11.8.1/firebase-auth.js';
import {
    collection,
    addDoc,
    getDocs,
    updateDoc,
    deleteDoc,
    doc,
    query,
    where,
    serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/11.8.1/firebase-firestore.js';

// ─── State ───────────────────────────────────────────────
let tasks = [];
let currentFilter = 'all';
let editingTaskId = null;   // Firestore doc ID
let deletingTaskId = null;
let modalSubtasks = [];
let currentUser = null;

// ─── Particle System ─────────────────────────────────────
const $particleCanvas = document.getElementById('particle-canvas');
const pCtx = $particleCanvas.getContext('2d');
let particles = [];

function resizeParticleCanvas() {
    $particleCanvas.width = window.innerWidth;
    $particleCanvas.height = window.innerHeight;
}
resizeParticleCanvas();
window.addEventListener('resize', resizeParticleCanvas);

function spawnParticles(x, y, color, count = 12) {
    for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
        const speed = Math.random() * 5 + 2;
        particles.push({
            x, y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 1,
            size: Math.random() * 4 + 2,
            color,
            life: 1,
            decay: Math.random() * 0.02 + 0.012,
        });
    }
}

function spawnConfetti(x, y) {
    const colors = ['#6C5CE7', '#a29bfe', '#fd79a8', '#00cec9', '#fdcb6e', '#55efc4'];
    for (let i = 0; i < 40; i++) {
        particles.push({
            x: x + (Math.random() - 0.5) * 60,
            y: y + (Math.random() - 0.5) * 20,
            vx: (Math.random() - 0.5) * 10,
            vy: Math.random() * -8 - 2,
            size: Math.random() * 6 + 3,
            color: colors[Math.floor(Math.random() * colors.length)],
            life: 1,
            decay: Math.random() * 0.008 + 0.004,
            isConfetti: true,
            rotation: Math.random() * 360,
            rotSpeed: (Math.random() - 0.5) * 12,
        });
    }
}

function animateParticles() {
    pCtx.clearRect(0, 0, $particleCanvas.width, $particleCanvas.height);
    particles = particles.filter(p => p.life > 0);
    particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.12;
        p.vx *= 0.99;
        p.life -= p.decay;

        pCtx.save();
        pCtx.globalAlpha = Math.max(0, p.life);
        pCtx.fillStyle = p.color;

        if (p.isConfetti) {
            pCtx.translate(p.x, p.y);
            p.rotation += p.rotSpeed;
            pCtx.rotate(p.rotation * Math.PI / 180);
            pCtx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        } else {
            pCtx.beginPath();
            pCtx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
            pCtx.fill();
        }
        pCtx.restore();
    });
    requestAnimationFrame(animateParticles);
}
animateParticles();

// ─── DOM Elements ────────────────────────────────────────
// Screens
const $loadingScreen = document.getElementById('loading-screen');
const $loginScreen = document.getElementById('login-screen');
const $app = document.getElementById('app');

// Auth
const $btnGoogleSignin = document.getElementById('btn-google-signin');
const $btnSignout = document.getElementById('btn-signout');
const $userAvatar = document.getElementById('user-avatar');
const $userName = document.getElementById('user-name');

// Task list
const $taskList = document.getElementById('task-list');
const $taskLoading = document.getElementById('task-loading');
const $emptyState = document.getElementById('empty-state');
const $btnAddTask = document.getElementById('btn-add-task');

// Modal
const $modalOverlay = document.getElementById('modal-overlay');
const $modalTitle = document.getElementById('modal-title');
const $modalClose = document.getElementById('modal-close');
const $taskForm = document.getElementById('task-form');
const $taskId = document.getElementById('task-id');
const $taskTitle = document.getElementById('task-title');
const $taskDue = document.getElementById('task-due');
const $taskStatus = document.getElementById('task-status');
const $modalSubtaskList = document.getElementById('modal-subtask-list');
const $subtaskInput = document.getElementById('subtask-input');
const $btnAddSubtask = document.getElementById('btn-add-subtask');
const $btnCancel = document.getElementById('btn-cancel');

// Delete modal
const $deleteOverlay = document.getElementById('delete-modal-overlay');
const $deleteCancel = document.getElementById('delete-cancel');
const $deleteConfirm = document.getElementById('delete-confirm');

// Filter tabs
const $filterTabs = document.querySelectorAll('.filter-tab');

// Stats
const $statTotal = document.querySelector('#stat-total .stat-value');
const $statProgress = document.querySelector('#stat-progress .stat-value');
const $statDone = document.querySelector('#stat-done .stat-value');

// Toast
const $toastContainer = document.getElementById('toast-container');

// ─── Utility Functions ───────────────────────────────────
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    const month = d.getMonth() + 1;
    const day = d.getDate();
    const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
    const weekday = weekdays[d.getDay()];
    return `${month}월 ${day}일 (${weekday})`;
}

function getDueStatus(dateStr) {
    if (!dateStr) return '';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(dateStr + 'T00:00:00');
    const diff = (due - today) / (1000 * 60 * 60 * 24);
    if (diff < 0) return 'overdue';
    if (diff <= 2) return 'due-soon';
    return '';
}

function getDueLabel(dateStr) {
    if (!dateStr) return '';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(dateStr + 'T00:00:00');
    const diff = Math.round((due - today) / (1000 * 60 * 60 * 24));
    if (diff < 0) return `${Math.abs(diff)}일 지남`;
    if (diff === 0) return '오늘까지';
    if (diff === 1) return '내일까지';
    return `${diff}일 남음`;
}

function getStatusLabel(status) {
    const labels = { 'todo': '할 일', 'in-progress': '진행 중', 'done': '완료' };
    return labels[status] || status;
}

function calculateProgress(subtasks) {
    if (!subtasks || subtasks.length === 0) return 0;
    const done = subtasks.filter(s => s.completed).length;
    return Math.round((done / subtasks.length) * 100);
}

// ─── Screen Management ───────────────────────────────────
function showScreen(screen) {
    $loadingScreen.style.display = 'none';
    $loginScreen.style.display = 'none';
    $app.style.display = 'none';

    if (screen === 'loading') $loadingScreen.style.display = 'flex';
    else if (screen === 'login') $loginScreen.style.display = 'flex';
    else if (screen === 'app') $app.style.display = 'block';
}

// ─── Authentication ──────────────────────────────────────
function handleGoogleSignIn() {
    $btnGoogleSignin.disabled = true;
    $btnGoogleSignin.querySelector('span').textContent = '로그인 중...';

    signInWithPopup(auth, googleProvider)
        .catch((error) => {
            console.error('Sign-in error:', error);
            if (error.code === 'auth/popup-closed-by-user') {
                showToast('로그인이 취소되었습니다.', 'error');
            } else if (error.code === 'auth/popup-blocked') {
                showToast('팝업이 차단되었습니다. 팝업 허용 후 다시 시도해 주세요.', 'error');
            } else {
                showToast('로그인에 실패했습니다. 다시 시도해 주세요.', 'error');
            }
        })
        .finally(() => {
            $btnGoogleSignin.disabled = false;
            $btnGoogleSignin.querySelector('span').textContent = 'Google로 시작하기';
        });
}

function handleSignOut() {
    signOut(auth)
        .then(() => {
            tasks = [];
            currentUser = null;
            showToast('로그아웃되었습니다.');
        })
        .catch((error) => {
            console.error('Sign-out error:', error);
            showToast('로그아웃에 실패했습니다.', 'error');
        });
}

function updateUserUI(user) {
    if (user) {
        $userAvatar.src = user.photoURL || '';
        $userAvatar.style.display = user.photoURL ? 'block' : 'none';
        $userName.textContent = user.displayName || user.email || '사용자';
    }
}

// ─── Firestore CRUD ──────────────────────────────────────
async function loadTasks() {
    if (!currentUser) return;

    $taskLoading.style.display = 'flex';
    $taskList.innerHTML = '';
    $emptyState.style.display = 'none';

    try {
        const q = query(
            collection(db, 'tasks'),
            where('userId', '==', currentUser.uid)
        );
        const snapshot = await getDocs(q);
        tasks = snapshot.docs.map(d => {
            const data = d.data();
            return {
                id: d.id,
                title: data.title,
                dueDate: data.dueDate || null,
                status: data.status || 'todo',
                subtasks: data.subtasks || [],
                createdAt: data.createdAt,
                updatedAt: data.updatedAt,
            };
        });
        renderTasks();
    } catch (error) {
        console.error('Load tasks error:', error);
        showToast('업무를 불러오는 데 실패했습니다.', 'error');
    } finally {
        $taskLoading.style.display = 'none';
    }
}

async function createTask(taskData) {
    if (!currentUser) return;

    try {
        await addDoc(collection(db, 'tasks'), {
            ...taskData,
            userId: currentUser.uid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        });
        showToast('새 업무가 추가되었습니다.');
        // Confetti celebration for new task
        spawnConfetti(window.innerWidth / 2, window.innerHeight / 2);
        await loadTasks();
    } catch (error) {
        console.error('Create task error:', error);
        showToast('업무 추가에 실패했습니다.', 'error');
    }
}

async function updateTask(taskId, changes) {
    try {
        await updateDoc(doc(db, 'tasks', taskId), {
            ...changes,
            updatedAt: serverTimestamp(),
        });
    } catch (error) {
        console.error('Update task error:', error);
        showToast('업무 수정에 실패했습니다.', 'error');
        throw error;
    }
}

async function removeTask(taskId) {
    try {
        await deleteDoc(doc(db, 'tasks', taskId));
        showToast('업무가 삭제되었습니다.');
        await loadTasks();
    } catch (error) {
        console.error('Delete task error:', error);
        showToast('업무 삭제에 실패했습니다.', 'error');
    }
}

// ─── Toast Notifications ─────────────────────────────────
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    $toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('removing');
        setTimeout(() => toast.remove(), 250);
    }, 2500);
}

// ─── Stats Update ────────────────────────────────────────
function updateStats() {
    const total = tasks.length;
    const progress = tasks.filter(t => t.status === 'in-progress').length;
    const done = tasks.filter(t => t.status === 'done').length;

    animateNumber($statTotal, total);
    animateNumber($statProgress, progress);
    animateNumber($statDone, done);
}

function animateNumber(el, target) {
    const current = parseInt(el.textContent) || 0;
    if (current === target) return;
    el.textContent = target;
    el.style.transform = 'scale(1.2)';
    el.style.transition = 'transform 0.2s ease';
    setTimeout(() => { el.style.transform = 'scale(1)'; }, 200);
}

// ─── Render Tasks ────────────────────────────────────────
function renderTasks() {
    const filtered = currentFilter === 'all'
        ? tasks
        : tasks.filter(t => t.status === currentFilter);

    const statusOrder = { 'in-progress': 0, 'todo': 1, 'done': 2 };
    filtered.sort((a, b) => {
        const sa = statusOrder[a.status] ?? 1;
        const sb = statusOrder[b.status] ?? 1;
        if (sa !== sb) return sa - sb;
        if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
        if (a.dueDate) return -1;
        if (b.dueDate) return 1;
        return 0;
    });

    $taskList.innerHTML = '';

    if (filtered.length === 0) {
        $emptyState.style.display = 'flex';
        if (currentFilter !== 'all') {
            $emptyState.querySelector('h2').textContent = '해당 상태의 업무가 없어요';
            $emptyState.querySelector('p').textContent = '다른 필터를 선택하거나 새 업무를 추가해 보세요.';
        } else {
            $emptyState.querySelector('h2').textContent = '아직 업무가 없어요';
            $emptyState.querySelector('p').textContent = '"새 업무" 버튼을 눌러 첫 번째 업무를 추가해 보세요.';
        }
    } else {
        $emptyState.style.display = 'none';
    }

    filtered.forEach((task, index) => {
        const card = createTaskCard(task, index);
        $taskList.appendChild(card);
    });

    updateStats();
}

function createTaskCard(task, index) {
    const card = document.createElement('div');
    card.className = `task-card${task.status === 'done' ? ' done' : ''}`;
    card.dataset.status = task.status;
    card.dataset.id = task.id;
    card.style.animationDelay = `${index * 0.05}s`;

    const progress = calculateProgress(task.subtasks);
    const dueStatus = getDueStatus(task.dueDate);
    const dueLabel = getDueLabel(task.dueDate);

    let subtasksHtml = '';
    if (task.subtasks && task.subtasks.length > 0) {
        const items = task.subtasks.map(st => `
            <div class="subtask-preview-item ${st.completed ? 'completed' : ''}" data-subtask-id="${st.id}">
                <button class="subtask-check ${st.completed ? 'checked' : ''}" data-task-id="${task.id}" data-subtask-id="${st.id}" aria-label="세부업무 완료 토글">
                    ${st.completed ? '<svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5l2.5 2.5L8 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>' : ''}
                </button>
                <span class="subtask-text">${escapeHtml(st.title)}</span>
            </div>
        `).join('');
        subtasksHtml = `<div class="task-subtask-preview">${items}</div>`;
    }

    let progressHtml = '';
    if (task.subtasks && task.subtasks.length > 0) {
        const completedCount = task.subtasks.filter(s => s.completed).length;
        progressHtml = `
            <div class="task-progress-section">
                <div class="task-progress-header">
                    <span class="task-progress-label">진행률</span>
                    <span class="task-progress-value">${completedCount}/${task.subtasks.length}</span>
                </div>
                <div class="task-progress-bar">
                    <div class="task-progress-fill ${progress === 100 ? 'complete' : ''}" style="width: ${progress}%"></div>
                </div>
            </div>
        `;
    }

    card.innerHTML = `
        <div class="task-card-header">
            <span class="task-title">${escapeHtml(task.title)}</span>
            <div class="task-actions">
                <button class="task-action-btn edit" data-id="${task.id}" aria-label="수정" title="수정">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <path d="M11.5 2.5l2 2-8.5 8.5H3v-2L11.5 2.5z" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                </button>
                <button class="task-action-btn delete" data-id="${task.id}" aria-label="삭제" title="삭제">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
                    </svg>
                </button>
            </div>
        </div>
        <div class="task-meta">
            <span class="task-status-badge ${task.status}">
                <span class="status-dot"></span>
                ${getStatusLabel(task.status)}
            </span>
            ${task.dueDate ? `
                <span class="task-due ${dueStatus}">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <circle cx="7" cy="7" r="5.5" stroke="currentColor" stroke-width="1.2"/>
                        <path d="M7 4v3.5l2.5 1.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
                    </svg>
                    ${formatDate(task.dueDate)}
                    <span style="opacity:0.7;margin-left:4px">(${dueLabel})</span>
                </span>
            ` : ''}
        </div>
        ${progressHtml}
        ${subtasksHtml}
    `;

    card.addEventListener('click', (e) => {
        if (e.target.closest('.task-action-btn') || e.target.closest('.subtask-check')) return;
        openEditModal(task.id);
    });

    return card;
}

// ─── Modal Management ────────────────────────────────────
function openAddModal() {
    editingTaskId = null;
    modalSubtasks = [];
    $modalTitle.textContent = '새 업무 추가';
    $taskForm.reset();
    $taskId.value = '';
    renderModalSubtasks();
    showModal($modalOverlay);
    $taskTitle.focus();
}

function openEditModal(id) {
    const task = tasks.find(t => t.id === id);
    if (!task) return;

    editingTaskId = id;
    modalSubtasks = task.subtasks ? task.subtasks.map(s => ({ ...s })) : [];

    $modalTitle.textContent = '업무 수정';
    $taskId.value = task.id;
    $taskTitle.value = task.title;
    $taskDue.value = task.dueDate || '';
    $taskStatus.value = task.status;

    renderModalSubtasks();
    showModal($modalOverlay);
    $taskTitle.focus();
}

function showModal(overlay) {
    overlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function hideModal(overlay) {
    overlay.style.display = 'none';
    document.body.style.overflow = '';
}

function renderModalSubtasks() {
    $modalSubtaskList.innerHTML = '';
    modalSubtasks.forEach((st, i) => {
        const item = document.createElement('div');
        item.className = 'subtask-item';
        item.innerHTML = `
            <span class="subtask-text">${escapeHtml(st.title)}</span>
            <button type="button" class="subtask-remove" data-index="${i}" aria-label="세부업무 삭제">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M4 4l6 6M10 4l-6 6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
                </svg>
            </button>
        `;
        $modalSubtaskList.appendChild(item);
    });
}

function addSubtask() {
    const title = $subtaskInput.value.trim();
    if (!title) return;

    modalSubtasks.push({
        id: generateId(),
        title: title,
        completed: false,
    });

    $subtaskInput.value = '';
    renderModalSubtasks();
    $subtaskInput.focus();
    $modalSubtaskList.scrollTop = $modalSubtaskList.scrollHeight;
}

function removeSubtask(index) {
    modalSubtasks.splice(index, 1);
    renderModalSubtasks();
}

// ─── Task Save ───────────────────────────────────────────
async function saveTask() {
    const title = $taskTitle.value.trim();
    if (!title) return;

    const $saveBtn = document.getElementById('btn-save');
    $saveBtn.disabled = true;
    $saveBtn.textContent = '저장 중...';

    const taskData = {
        title: title,
        dueDate: $taskDue.value || null,
        status: $taskStatus.value,
        subtasks: modalSubtasks,
    };

    try {
        if (editingTaskId) {
            await updateTask(editingTaskId, taskData);
            showToast('업무가 수정되었습니다.');
            await loadTasks();
        } else {
            await createTask(taskData);
        }
        hideModal($modalOverlay);
        // Particles on save
        const btnRect = document.getElementById('btn-save').getBoundingClientRect();
        spawnParticles(btnRect.left + btnRect.width / 2, btnRect.top, '#a29bfe', 15);
    } catch (error) {
        // Error already handled in CRUD functions
    } finally {
        $saveBtn.disabled = false;
        $saveBtn.textContent = '저장';
    }
}

// ─── Task Delete ─────────────────────────────────────────
function deleteTask(id) {
    deletingTaskId = id;
    showModal($deleteOverlay);
}

async function confirmDelete() {
    if (!deletingTaskId) return;

    const $deleteBtn = document.getElementById('delete-confirm');
    $deleteBtn.disabled = true;
    $deleteBtn.textContent = '삭제 중...';

    const card = document.querySelector(`.task-card[data-id="${deletingTaskId}"]`);
    if (card) {
        card.style.animation = 'taskRemove 0.35s ease forwards';
        await new Promise(r => setTimeout(r, 350));
    }

    // Red particles on delete
    if (card) {
        const r = card.getBoundingClientRect();
        spawnParticles(r.left + r.width / 2, r.top + r.height / 2, '#ff6b6b', 20);
    }
    await removeTask(deletingTaskId);
    deletingTaskId = null;
    hideModal($deleteOverlay);

    $deleteBtn.disabled = false;
    $deleteBtn.textContent = '삭제';
}

// ─── Subtask Toggle ──────────────────────────────────────
async function toggleSubtask(taskId, subtaskId) {
    const task = tasks.find(t => t.id === taskId);
    if (!task || !task.subtasks) return;

    const subtask = task.subtasks.find(s => s.id === subtaskId);
    if (!subtask) return;

    subtask.completed = !subtask.completed;

    // Particle burst on check
    if (subtask.completed) {
        const checkEl = document.querySelector(`.subtask-check[data-task-id="${taskId}"][data-subtask-id="${subtaskId}"]`);
        if (checkEl) {
            const r = checkEl.getBoundingClientRect();
            spawnParticles(r.left + r.width / 2, r.top + r.height / 2, '#a29bfe', 10);
        }
    }

    // Auto-update task status
    const allDone = task.subtasks.every(s => s.completed);
    const anyDone = task.subtasks.some(s => s.completed);
    let newStatus = task.status;

    if (allDone && task.subtasks.length > 0) {
        newStatus = 'done';
    } else if (anyDone) {
        if (task.status === 'done' || task.status === 'todo') {
            newStatus = 'in-progress';
        }
    }

    try {
        await updateTask(taskId, {
            subtasks: task.subtasks,
            status: newStatus,
        });
        task.status = newStatus;
        renderTasks();
    } catch (error) {
        // Revert on error
        subtask.completed = !subtask.completed;
        renderTasks();
    }
}

// ─── Filter ──────────────────────────────────────────────
function setFilter(filter) {
    currentFilter = filter;
    $filterTabs.forEach(tab => {
        const isActive = tab.dataset.filter === filter;
        tab.classList.toggle('active', isActive);
        if (isActive) {
            const r = tab.getBoundingClientRect();
            spawnParticles(r.left + r.width / 2, r.top + r.height / 2, '#6C5CE7', 6);
        }
    });
    renderTasks();
}

// ─── Event Listeners ─────────────────────────────────────
function initEventListeners() {
    // Auth
    $btnGoogleSignin.addEventListener('click', handleGoogleSignIn);
    $btnSignout.addEventListener('click', handleSignOut);

    // Add task
    $btnAddTask.addEventListener('click', openAddModal);

    // Filters
    $filterTabs.forEach(tab => {
        tab.addEventListener('click', () => setFilter(tab.dataset.filter));
    });

    // Modal close
    $modalClose.addEventListener('click', () => hideModal($modalOverlay));
    $btnCancel.addEventListener('click', () => hideModal($modalOverlay));
    $modalOverlay.addEventListener('click', (e) => {
        if (e.target === $modalOverlay) hideModal($modalOverlay);
    });

    // Form submit
    $taskForm.addEventListener('submit', (e) => {
        e.preventDefault();
        saveTask();
    });

    // Subtask input
    $btnAddSubtask.addEventListener('click', addSubtask);
    $subtaskInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addSubtask();
        }
    });

    // Subtask remove (delegation)
    $modalSubtaskList.addEventListener('click', (e) => {
        const removeBtn = e.target.closest('.subtask-remove');
        if (removeBtn) removeSubtask(parseInt(removeBtn.dataset.index));
    });

    // Task list event delegation
    $taskList.addEventListener('click', (e) => {
        const editBtn = e.target.closest('.task-action-btn.edit');
        if (editBtn) { e.stopPropagation(); openEditModal(editBtn.dataset.id); return; }

        const deleteBtn = e.target.closest('.task-action-btn.delete');
        if (deleteBtn) { e.stopPropagation(); deleteTask(deleteBtn.dataset.id); return; }

        const subtaskCheck = e.target.closest('.subtask-check');
        if (subtaskCheck) { e.stopPropagation(); toggleSubtask(subtaskCheck.dataset.taskId, subtaskCheck.dataset.subtaskId); return; }
    });

    // Delete modal
    $deleteCancel.addEventListener('click', () => { deletingTaskId = null; hideModal($deleteOverlay); });
    $deleteConfirm.addEventListener('click', confirmDelete);
    $deleteOverlay.addEventListener('click', (e) => {
        if (e.target === $deleteOverlay) { deletingTaskId = null; hideModal($deleteOverlay); }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if ($deleteOverlay.style.display !== 'none') { deletingTaskId = null; hideModal($deleteOverlay); }
            else if ($modalOverlay.style.display !== 'none') { hideModal($modalOverlay); }
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
            e.preventDefault();
            if (currentUser) openAddModal();
        }
    });
}

// ─── Init ────────────────────────────────────────────────
function init() {
    showScreen('loading');
    initEventListeners();

    // Listen for auth state changes
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUser = user;
            updateUserUI(user);
            showScreen('app');
            await loadTasks();
        } else {
            currentUser = null;
            tasks = [];
            showScreen('login');
        }
    });
}

init();

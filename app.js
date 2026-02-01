// Invitee List Application - Main JavaScript with Firebase Cloud Sync & Multi-User Support

// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyCQXnnmQD_BY7b3lAxcwRPwwF6-kFBe-Kg",
    authDomain: "invitee-list-fb893.firebaseapp.com",
    databaseURL: "https://invitee-list-fb893-default-rtdb.firebaseio.com",
    projectId: "invitee-list-fb893",
    storageBucket: "invitee-list-fb893.firebasestorage.app",
    messagingSenderId: "349634934290",
    appId: "1:349634934290:web:7bed0b8525c95f84c34acb"
};

// Initialize Firebase
let database = null;
let auth = null;
if (window.firebase && firebase.initializeApp) {
    firebase.initializeApp(firebaseConfig);
    database = firebase.database();
    auth = firebase.auth();
} else {
    console.warn('Firebase SDK failed to load. Auth and sync features are disabled.');
}

let guestsRef = null;
let hostsRef = null;
let eventsRef = null;
let templatesRef = null;

// Collaboration: maps shared eventId -> ownerUid
let sharedEventOwners = {};
// All events including shared ones for rendering
let allEvents = [];
let sharedEventsLoaded = false;

// Data Storage Keys (for local backup)
const STORAGE_KEY_BASE = 'inviteeProGuests';
const HOSTS_STORAGE_KEY_BASE = 'inviteeProHosts';
const EVENT_STORAGE_KEY_BASE = 'inviteeProSelectedEvent';
const TEMPLATES_STORAGE_KEY = 'inviteeProTemplates';

// Global Variables
let guests = [];
let hosts = [];
let whatsappTemplates = [];
let deleteTargetId = null;
let isOnline = navigator.onLine;

let currentUser = null;
let currentUserId = null;
let currentEventId = null;
let currentEventName = null;
let currentEventMeta = null;

// ==================== AUTHENTICATION ====================

// Initialize Application
document.addEventListener('DOMContentLoaded', function() {
    setupEventListeners();
    setupOnlineStatusListeners();
    showSyncStatus();
    setupContactPicker();

    if (!auth) {
        showToast('Auth is unavailable. Check your connection or refresh.', 'error');
        return;
    }

    // Listen for auth state changes
    auth.onAuthStateChanged((user) => {
        if (user) {
            currentUser = user;
            currentUserId = user.uid;
            onUserSignedIn(user);
        } else {
            currentUser = null;
            currentUserId = null;
            onUserSignedOut();
        }
    });
});

function onUserSignedIn(user) {
    // Hide landing page, show dashboard
    const landingPage = document.getElementById('landingPage');
    const appDashboard = document.getElementById('appDashboard');
    const authModal = document.getElementById('authModal');

    if (landingPage) landingPage.style.display = 'none';
    if (appDashboard) appDashboard.style.display = 'flex';
    if (authModal) authModal.classList.remove('show');

    // Update user pill
    const userPill = document.getElementById('userPill');
    const userAvatar = document.getElementById('userAvatar');
    const userName = document.getElementById('userName');
    const addGuestBtn = document.getElementById('addGuestBtn');

    if (userPill) userPill.style.display = 'flex';
    if (addGuestBtn) addGuestBtn.style.display = 'flex';

    if (user.photoURL) {
        userAvatar.innerHTML = `<img src="${user.photoURL}" alt="" style="width:100%;height:100%;border-radius:50%;">`;
    } else {
        userAvatar.textContent = (user.displayName || user.email || 'U').charAt(0).toUpperCase();
    }
    userName.textContent = user.displayName || user.email?.split('@')[0] || 'User';

    // Initialize user-specific data
    initUserData();
}

function onUserSignedOut() {
    // Show landing page, hide dashboard
    const landingPage = document.getElementById('landingPage');
    const appDashboard = document.getElementById('appDashboard');

    if (landingPage) landingPage.style.display = 'block';
    if (appDashboard) appDashboard.style.display = 'none';

    // Hide user pill
    const userPill = document.getElementById('userPill');
    const addGuestBtn = document.getElementById('addGuestBtn');
    if (userPill) userPill.style.display = 'none';
    if (addGuestBtn) addGuestBtn.style.display = 'none';

    // Clear data
    guests = [];
    hosts = [];
    whatsappTemplates = [];
    currentEventId = null;
    currentEventMeta = null;

    renderGuestTable();
    renderHostDropdowns();
    updateDashboard();
    updateEventHeader(null);
}

// ==================== AUTH MODAL & LANDING PAGE ====================

function openAuthModal(mode) {
    const authModal = document.getElementById('authModal');
    if (authModal) {
        authModal.classList.add('show');
        if (mode === 'signup') {
            showSignupForm();
        } else {
            showLoginForm();
        }
    }
}

function closeAuthModal() {
    const authModal = document.getElementById('authModal');
    if (authModal) {
        authModal.classList.remove('show');
    }
}

function toggleMobileMenu() {
    const mobileMenu = document.getElementById('mobileMenu');
    if (mobileMenu) {
        mobileMenu.classList.toggle('show');
    }
}

// Friendly error messages for Firebase auth errors
function getAuthErrorMessage(error) {
    const code = error.code || '';
    switch (code) {
        case 'auth/user-not-found':
            return 'No account found with this email. Please sign up first.';
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
            return 'Incorrect password. Please try again or reset your password.';
        case 'auth/invalid-email':
            return 'Please enter a valid email address.';
        case 'auth/email-already-in-use':
            return 'An account with this email already exists. Please sign in instead.';
        case 'auth/weak-password':
            return 'Password is too weak. Use at least 6 characters with a mix of letters and numbers.';
        case 'auth/too-many-requests':
            return 'Too many failed attempts. Please wait a few minutes and try again.';
        case 'auth/network-request-failed':
            return 'Network error. Please check your internet connection and try again.';
        case 'auth/popup-closed-by-user':
            return 'Sign-in was cancelled. Please try again.';
        case 'auth/popup-blocked':
            return 'Sign-in popup was blocked. Please allow popups for this site.';
        case 'auth/account-exists-with-different-credential':
            return 'An account already exists with the same email but different sign-in method.';
        case 'auth/user-disabled':
            return 'This account has been disabled. Please contact support.';
        case 'auth/operation-not-allowed':
            return 'This sign-in method is not enabled. Please contact the app administrator.';
        default:
            console.warn('Unhandled auth error code:', code);
            return error.message || 'An unexpected error occurred. Please try again.';
    }
}

function signInWithGoogle() {
    if (!auth) {
        showToast('Auth is unavailable right now. Please refresh and try again.', 'error');
        return;
    }
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider)
        .then((result) => {
            showToast('Signed in successfully!', 'success');
        })
        .catch((error) => {
            console.error('Google sign-in error:', error);
            showToast(getAuthErrorMessage(error), 'error');
        });
}

function signInWithEmail() {
    if (!auth) {
        showToast('Auth is unavailable right now. Please refresh and try again.', 'error');
        return;
    }
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;

    if (!email || !password) {
        showToast('Please enter email and password', 'error');
        return;
    }

    auth.signInWithEmailAndPassword(email, password)
        .then((result) => {
            showToast('Signed in successfully!', 'success');
        })
        .catch((error) => {
            console.error('Email sign-in error:', error);
            showToast(getAuthErrorMessage(error), 'error');
        });
}

function signUpWithEmail() {
    if (!auth) {
        showToast('Auth is unavailable right now. Please refresh and try again.', 'error');
        return;
    }
    const name = document.getElementById('signupName').value.trim();
    const email = document.getElementById('signupEmail').value.trim();
    const password = document.getElementById('signupPassword').value;

    if (!name || !email || !password) {
        showToast('Please fill all fields', 'error');
        return;
    }

    if (password.length < 6) {
        showToast('Password must be at least 6 characters', 'error');
        return;
    }

    auth.createUserWithEmailAndPassword(email, password)
        .then((result) => {
            return result.user.updateProfile({ displayName: name });
        })
        .then(() => {
            showToast('Account created successfully!', 'success');
        })
        .catch((error) => {
            console.error('Sign-up error:', error);
            showToast(getAuthErrorMessage(error), 'error');
        });
}

function sendPasswordReset() {
    const email = document.getElementById('resetEmail').value.trim();
    if (!email) {
        showToast('Please enter your email address', 'error');
        return;
    }

    auth.sendPasswordResetEmail(email)
        .then(() => {
            showToast('Password reset link sent! Check your inbox.', 'success');
            showLoginForm();
        })
        .catch((error) => {
            console.error('Password reset error:', error);
            showToast(getAuthErrorMessage(error), 'error');
        });
}

function signOutUser() {
    if (!auth) {
        showToast('Auth is unavailable right now.', 'error');
        return;
    }
    if (confirm('Are you sure you want to sign out?')) {
        auth.signOut()
            .then(() => {
                showToast('Signed out successfully', 'success');
            })
            .catch((error) => {
                showToast('Sign-out failed. Please try again.', 'error');
            });
    }
}

function showSignupForm() {
    document.getElementById('loginForm').style.display = 'none';
    document.getElementById('signupForm').style.display = 'block';
    const forgotForm = document.getElementById('forgotPasswordForm');
    if (forgotForm) forgotForm.style.display = 'none';
}

function showForgotPasswordForm() {
    document.getElementById('loginForm').style.display = 'none';
    document.getElementById('signupForm').style.display = 'none';
    document.getElementById('forgotPasswordForm').style.display = 'block';
    document.getElementById('resetEmail').focus();
}

function showLoginForm() {
    document.getElementById('signupForm').style.display = 'none';
    document.getElementById('loginForm').style.display = 'block';
    const forgotForm = document.getElementById('forgotPasswordForm');
    if (forgotForm) forgotForm.style.display = 'none';
}

function initUserData() {
    if (!currentUserId) return;

    // Set up user-specific references
    eventsRef = database.ref(`users/${currentUserId}/events`);
    templatesRef = database.ref(`users/${currentUserId}/templates`);

    // Load events and templates
    loadEventsAndRestoreSelection();
    loadWhatsappTemplates();

    // Load events shared with this user
    loadSharedEvents();
}

function initEvents() {
    // This function is now called only after auth
    if (!currentUserId) {
        // Landing page is shown by default when not authenticated
        return;
    }
    eventsRef = database.ref(`users/${currentUserId}/events`);
    loadEventsAndRestoreSelection();
}

function setupEventListeners() {
    const searchInput = document.getElementById('searchInput');
    const filterRsvp = document.getElementById('filterRsvp');
    const filterFood = document.getElementById('filterFood');
    const filterHost = document.getElementById('filterHost');
    const eventSelect = document.getElementById('eventSelect');

    if (searchInput) searchInput.addEventListener('input', filterAndRenderTable);
    if (filterRsvp) filterRsvp.addEventListener('change', filterAndRenderTable);
    if (filterFood) filterFood.addEventListener('change', filterAndRenderTable);
    if (filterHost) filterHost.addEventListener('change', filterAndRenderTable);
    if (eventSelect) {
        eventSelect.addEventListener('change', (event) => {
            const val = event.target.value;
            if (!val) return;

            // Check if this is a shared event (format: shared_{ownerUid}_{eventId})
            if (val.startsWith('shared_')) {
                const parts = val.split('_');
                const ownerUid = parts[1];
                const eventId = parts.slice(2).join('_');
                selectSharedEvent(ownerUid, eventId);
            } else {
                selectEvent(val);
            }
        });
    }
}

function setupOnlineStatusListeners() {
    window.addEventListener('online', () => {
        isOnline = true;
        showSyncStatus();
    });
    window.addEventListener('offline', () => {
        isOnline = false;
        showSyncStatus();
    });
}

function showSyncStatus() {
    document.body.dataset.sync = isOnline ? 'online' : 'offline';
    if (!isOnline) {
        showToast('Offline mode: saving locally', 'error');
    }
}

function getGuestsStorageKey() {
    return `${STORAGE_KEY_BASE}_${currentEventId || 'default'}`;
}

function getHostsStorageKey() {
    return `${HOSTS_STORAGE_KEY_BASE}_${currentEventId || 'default'}`;
}

function getEventStorageKey() {
    return EVENT_STORAGE_KEY_BASE;
}

function loadGuestsFromLocal() {
    const stored = localStorage.getItem(getGuestsStorageKey());
    try {
        guests = stored ? JSON.parse(stored) : [];
    } catch (e) {
        guests = [];
    }
}

function loadHostsFromLocal() {
    const stored = localStorage.getItem(getHostsStorageKey());
    try {
        hosts = stored ? JSON.parse(stored) : [];
    } catch (e) {
        hosts = [];
    }
}

function renderEventOptions(ownEvents) {
    const eventSelect = document.getElementById('eventSelect');
    if (!eventSelect) return;
    eventSelect.innerHTML = '<option value="">Select Event</option>';

    // Combine own events + shared events
    allEvents = [];

    // Add own events
    ownEvents.forEach((event) => {
        allEvents.push({ ...event, isShared: false });
    });

    // Add shared events (avoid duplicates)
    Object.keys(sharedEventOwners).forEach((key) => {
        const shared = sharedEventOwners[key];
        const alreadyExists = allEvents.some(e => e.id === shared.eventId);
        if (!alreadyExists) {
            allEvents.push({
                id: shared.eventId,
                meta: { name: shared.eventName },
                isShared: true,
                ownerUid: shared.ownerUid,
                ownerName: shared.ownerName
            });
        }
    });

    // Render own events
    const ownGroup = ownEvents.length > 0;
    if (ownGroup && Object.keys(sharedEventOwners).length > 0) {
        const ownOptGroup = document.createElement('optgroup');
        ownOptGroup.label = 'My Events';
        ownEvents.forEach((event) => {
            const option = document.createElement('option');
            option.value = event.id;
            option.textContent = event.meta?.name || 'Untitled Event';
            ownOptGroup.appendChild(option);
        });
        eventSelect.appendChild(ownOptGroup);

        // Render shared events
        const sharedOptGroup = document.createElement('optgroup');
        sharedOptGroup.label = 'Shared With Me';
        Object.keys(sharedEventOwners).forEach((key) => {
            const shared = sharedEventOwners[key];
            const alreadyOwn = ownEvents.some(e => e.id === shared.eventId);
            if (!alreadyOwn) {
                const option = document.createElement('option');
                option.value = `shared_${shared.ownerUid}_${shared.eventId}`;
                option.textContent = `${shared.eventName} (by ${shared.ownerName})`;
                sharedOptGroup.appendChild(option);
            }
        });
        if (sharedOptGroup.children.length > 0) {
            eventSelect.appendChild(sharedOptGroup);
        }
    } else {
        ownEvents.forEach((event) => {
            const option = document.createElement('option');
            option.value = event.id;
            option.textContent = event.meta?.name || 'Untitled Event';
            eventSelect.appendChild(option);
        });
    }
}

function updateEventHeader(meta) {
    const titleEl = document.getElementById('eventTitle');
    const subtitleEl = document.getElementById('eventSubtitle');
    const currentEventNameEl = document.getElementById('currentEventName');

    if (!titleEl || !subtitleEl) return;
    if (!meta) {
        titleEl.innerHTML = '<img src="Invitee Pro Logo.svg" alt="InviteePro" style="height:36px;vertical-align:middle;">';
        subtitleEl.textContent = 'Create multiple events and manage invitees.';
        if (currentEventNameEl) currentEventNameEl.textContent = 'No event selected';
        return;
    }
    const date = meta.date ? new Date(meta.date).toLocaleDateString() : '';
    const venue = meta.venue || '';
    const sharedLabel = meta.isShared ? ' (Shared)' : '';
    const parts = [date, venue].filter(Boolean).join(' • ');
    titleEl.textContent = (meta.name || 'InviteePro') + sharedLabel;
    subtitleEl.textContent = parts || (meta.isShared ? 'Collaborating on this event' : 'Manage invitees for this event.');

    // Update current event name in settings sheet
    if (currentEventNameEl) {
        currentEventNameEl.textContent = (meta.name || 'No event selected') + sharedLabel;
    }

    // Update co-host activity bar
    updateCohostActivityBar();
    // Hide delete option for shared events
    updateDeleteEventVisibility();
}

function openEventModal() {
    const modal = document.getElementById('eventModal');
    const hint = document.getElementById('eventModalHint');
    const saveBtn = document.getElementById('eventSaveBtn');
    if (modal) {
        modal.dataset.mode = 'create';
        modal.dataset.eventId = '';
    }
    if (hint) hint.textContent = 'Create a new event or edit the selected event.';
    if (saveBtn) saveBtn.textContent = 'Create Event';
    document.getElementById('newEventName').value = '';
    document.getElementById('newEventDate').value = '';
    document.getElementById('newEventVenue').value = '';
    document.getElementById('newEventWhatsappTemplate').value = '';
    openModal('eventModal');
}

function openEditEventModal() {
    if (!currentEventId) {
        showToast('Please select an event to edit', 'error');
        return;
    }
    const modal = document.getElementById('eventModal');
    const hint = document.getElementById('eventModalHint');
    const saveBtn = document.getElementById('eventSaveBtn');
    if (modal) {
        modal.dataset.mode = 'edit';
        modal.dataset.eventId = currentEventId;
    }
    if (hint) hint.textContent = 'Update event details.';
    if (saveBtn) saveBtn.textContent = 'Save Event';
    document.getElementById('newEventName').value = currentEventMeta?.name || '';
    document.getElementById('newEventDate').value = currentEventMeta?.date || '';
    document.getElementById('newEventVenue').value = currentEventMeta?.venue || '';
    document.getElementById('newEventWhatsappTemplate').value = currentEventMeta?.whatsappTemplate || '';
    openModal('eventModal');
}

function saveEventMeta() {
    const name = document.getElementById('newEventName').value.trim();
    const date = document.getElementById('newEventDate').value;
    const venue = document.getElementById('newEventVenue').value.trim();
    const whatsappTemplate = document.getElementById('newEventWhatsappTemplate').value.trim();
    if (!name) {
        showToast('Please enter an event name', 'error');
        return;
    }

    const modal = document.getElementById('eventModal');
    const mode = modal?.dataset.mode || 'create';
    const eventId = mode === 'edit' ? modal?.dataset.eventId : null;
    const meta = {
        name,
        date: date || '',
        venue: venue || '',
        whatsappTemplate: whatsappTemplate || '',
        updatedAt: new Date().toISOString()
    };

    if (mode === 'edit' && eventId) {
        eventsRef.child(`${eventId}/meta`).update(meta)
            .then(() => {
                showToast('Event updated!', 'success');
                closeModal('eventModal');
            })
            .catch(() => {
                showToast('Failed to update event (offline?)', 'error');
            });
        return;
    }

    const newEventRef = eventsRef.push();
    newEventRef.child('meta').set({
        ...meta,
        createdAt: new Date().toISOString()
    }).then(() => {
        showToast('Event created!', 'success');
        closeModal('eventModal');
        selectEvent(newEventRef.key, meta);
    }).catch(() => {
        showToast('Failed to create event (offline?)', 'error');
    });
}

function deleteCurrentEvent() {
    if (!currentEventId || !currentUserId) {
        showToast('No event selected to delete', 'error');
        return;
    }

    // Co-hosts cannot delete shared events
    if (currentEventMeta?.isShared || (currentEventMeta?.ownerUid && currentEventMeta.ownerUid !== currentUserId)) {
        showToast('You cannot delete a shared event. Only the event owner can delete it.', 'error');
        return;
    }

    const eventName = currentEventMeta?.name || 'this event';
    if (!confirm(`Are you sure you want to delete "${eventName}"?\n\nThis will permanently remove the event, all guests, hosts, and shared access. This cannot be undone.`)) {
        return;
    }

    // Second confirmation for safety
    if (!confirm(`FINAL WARNING: All data for "${eventName}" will be lost forever. Continue?`)) {
        return;
    }

    const eventId = currentEventId;

    // Detach listeners
    if (guestsRef) { guestsRef.off(); guestsRef = null; }
    if (hostsRef) { hostsRef.off(); hostsRef = null; }

    // Remove shared-events entries for all collaborators
    database.ref(`users/${currentUserId}/events/${eventId}/collaborators`).once('value', (snap) => {
        if (snap.exists()) {
            snap.forEach((child) => {
                const emailKey = child.key;
                database.ref(`shared-events/${emailKey}/${currentUserId}_${eventId}`).remove().catch(() => {});
            });
        }
    });

    // Delete the entire event node
    eventsRef.child(eventId).remove()
        .then(() => {
            // Clear local state
            currentEventId = null;
            currentEventMeta = null;
            currentEventName = null;
            guests = [];
            hosts = [];
            localStorage.removeItem(getEventStorageKey());

            renderGuestTable();
            renderHostDropdowns();
            updateDashboard();
            updateEventHeader(null);

            showToast(`"${eventName}" has been deleted`, 'success');
        })
        .catch((error) => {
            console.error('Failed to delete event:', error);
            showToast('Failed to delete event', 'error');
        });
}

// Hide delete option for co-hosts viewing shared events
function updateDeleteEventVisibility() {
    const deleteItem = document.getElementById('deleteEventItem');
    const deleteBtn = document.getElementById('deleteEventBtn');
    const isShared = currentEventMeta?.isShared || (currentEventMeta?.ownerUid && currentEventMeta.ownerUid !== currentUserId);
    if (deleteItem) {
        deleteItem.style.display = isShared ? 'none' : '';
    }
    if (deleteBtn) {
        deleteBtn.style.display = (currentEventId && !isShared) ? '' : 'none';
    }
}

function loadEventsAndRestoreSelection() {
    eventsRef.on('value', (snap) => {
        // Read stored event ID inside the callback so it gets the latest value
        const storedSelection = localStorage.getItem(getEventStorageKey());

        const events = [];
        if (snap.exists()) {
            snap.forEach((child) => {
                events.push({
                    id: child.key,
                    meta: child.child('meta').val() || {}
                });
            });
        }

        renderEventOptions(events);

        // If we have a shared event selected, keep it
        if (currentEventMeta?.isShared && currentEventId) {
            return;
        }

        // Check if stored selection is a shared event
        if (storedSelection && storedSelection.startsWith('shared_') && events.length >= 0) {
            const parts = storedSelection.split('_');
            const ownerUid = parts[1];
            const eventId = parts.slice(2).join('_');
            if (!currentEventId || currentEventId !== eventId) {
                selectSharedEvent(ownerUid, eventId);
            }
            return;
        }

        if (events.length === 0 && Object.keys(sharedEventOwners).length === 0) {
            currentEventId = null;
            currentEventMeta = null;
            guests = [];
            hosts = [];
            renderGuestTable();
            renderHostDropdowns();
            updateDashboard();
            updateEventHeader(null);
            return;
        }

        if (events.length === 0) {
            // No own events but might have shared events - don't auto-select
            updateEventHeader(null);
            return;
        }

        // If we already have a current event selected, keep it (unless it no longer exists)
        const currentEventExists = events.find((ev) => ev.id === currentEventId);
        if (currentEventId && currentEventExists) {
            currentEventMeta = currentEventExists.meta;
            updateEventHeader(currentEventMeta);
            const eventSelect = document.getElementById('eventSelect');
            if (eventSelect) eventSelect.value = currentEventId;
            return;
        }

        // Otherwise, try to restore from localStorage or pick the first event
        const targetId = events.find((ev) => ev.id === storedSelection)?.id || events[0].id;
        const targetMeta = events.find((ev) => ev.id === targetId)?.meta || null;
        const eventSelect = document.getElementById('eventSelect');
        if (eventSelect) eventSelect.value = targetId;

        if (targetId !== currentEventId) {
            selectEvent(targetId, targetMeta);
        } else if (targetMeta) {
            currentEventMeta = targetMeta;
            updateEventHeader(targetMeta);
        }
    });
}

async function selectEvent(eventId, meta) {
    if (!eventId || !currentUserId) return;

    // Detach old listeners FIRST to prevent race conditions
    if (guestsRef) { guestsRef.off(); guestsRef = null; }
    if (hostsRef) { hostsRef.off(); hostsRef = null; }

    currentEventId = eventId;

    // Fetch meta if not provided
    if (!meta && eventsRef) {
        try {
            const snap = await eventsRef.child(`${eventId}/meta`).get();
            meta = snap.exists() ? snap.val() : null;
        } catch (e) {
            meta = null;
        }
    }
    currentEventMeta = meta || {};
    currentEventName = currentEventMeta?.name || null;

    // Save to localStorage immediately
    localStorage.setItem(getEventStorageKey(), eventId);

    // Update UI
    updateEventHeader(currentEventMeta);

    // Sync dropdown
    const eventSelect = document.getElementById('eventSelect');
    if (eventSelect) eventSelect.value = eventId;

    // Set up new event-specific Firebase references
    guestsRef = database.ref(`users/${currentUserId}/events/${eventId}/guests`);
    hostsRef = database.ref(`users/${currentUserId}/events/${eventId}/hosts`);

    // Reset filters and clear current data
    resetEventFilters();
    guests = [];
    hosts = [];
    renderGuestTable();
    renderHostDropdowns();
    renderHostList();
    updateDashboard();
    updateCohostActivityBar();

    // Attach new listeners for this event's data
    guestsRef.on('value', (snap) => {
        if (currentEventId !== eventId) return;
        const data = [];
        if (snap.exists()) {
            snap.forEach((child) => {
                data.push({ ...child.val(), firebaseKey: child.key });
            });
        }
        guests = data;
        saveGuests();
        renderGuestTable();
        updateDashboard();
    });

    hostsRef.on('value', (snap) => {
        if (currentEventId !== eventId) return;
        const data = [];
        if (snap.exists()) {
            snap.forEach((child) => {
                data.push({ ...child.val(), firebaseKey: child.key });
            });
        }
        hosts = data;
        localStorage.setItem(getHostsStorageKey(), JSON.stringify(hosts));
        renderHostDropdowns();
        renderHostList();
    });

    console.log('[App] Switched to event:', eventId, currentEventMeta?.name || '');
}

function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    };
    return String(text ?? '').replace(/[&<>"']/g, (m) => map[m]);
}

function sendWhatsappInvite(phone, name) {
    const template = currentEventMeta?.whatsappTemplate;
    const eventName = currentEventMeta?.name || 'our event';
    const date = currentEventMeta?.date ? new Date(currentEventMeta.date).toLocaleDateString() : 'soon';
    const venue = currentEventMeta?.venue || 'our venue';
    const message = template
        ? template
              .replace('{name}', name || 'Guest')
              .replace('{event}', eventName)
              .replace('{date}', date)
              .replace('{venue}', venue)
        : `Hi ${name || ''}, you are invited to ${eventName} on ${date} at ${venue}. Please confirm your RSVP.`;
    const encoded = encodeURIComponent(message.trim());
    const normalized = normalizePhone(phone);
    window.open(`https://wa.me/${normalized}?text=${encoded}`, '_blank');
}

function renderEventDashboard(events) {
    const container = document.getElementById('eventCards');
    const hint = document.getElementById('noEventsHint');
    if (!container) return;

    container.innerHTML = '';
    if (!events || events.length === 0) {
        if (hint) hint.style.display = 'block';
        return;
    }
    if (hint) hint.style.display = 'none';

    events.forEach(ev => {
        const meta = ev.meta || {};
        const stats = meta.stats || {};
        const dateStr = meta.date ? meta.date : '';
        const venueStr = meta.venue ? meta.venue : '';
        const sub = [dateStr, venueStr].filter(Boolean).join(' • ') || 'Tap to open';

        const card = document.createElement('div');
        card.className = 'event-card';
        card.onclick = () => {
            const eventSelect = document.getElementById('eventSelect');
            if (eventSelect) eventSelect.value = ev.id;
            selectEvent(ev.id);
            // Scroll to top for mobile
            window.scrollTo({ top: 0, behavior: 'smooth' });
        };

        card.innerHTML = `
            <div class="event-card-title">${escapeHtml(meta.name || 'Untitled Event')}</div>
            <div class="event-card-sub">${escapeHtml(sub)}</div>
            <div class="event-card-stats">
                <span class="event-pill">&#128101; Families: ${stats.totalFamilies || 0}</span>
                <span class="event-pill">&#127881; Guests: ${stats.totalGuests || 0}</span>
                <span class="event-pill">&#9989; Confirmed: ${stats.confirmed || 0}</span>
            </div>
        `;
        container.appendChild(card);
    });
}

async function updateEventMetaStats() {
    if (!currentEventId || !eventsRef || !currentUserId) return;
    const stats = {
        totalFamilies: guests.length,
        totalGuests: guests.reduce((sum, g) => sum + (parseInt(g.members) || 0), 0),
        confirmed: guests.filter(g => g.rsvpStatus === 'Confirmed').length,
        pending: guests.filter(g => g.rsvpStatus === 'Pending').length,
        declined: guests.filter(g => g.rsvpStatus === 'Declined').length
    };
    try {
        await database.ref(`users/${currentUserId}/events/${currentEventId}/meta`).update({
            updatedAt: new Date().toISOString(),
            stats
        });
    } catch (e) {
        // ignore when offline
    }
}

// ==================== EVENTS ==================== HOST MANAGEMENT ====================

function renderHostDropdowns() {
    const relativeOfSelect = document.getElementById('relativeOf');
    const filterHostSelect = document.getElementById('filterHost');

    // Update guest form dropdown
    if (relativeOfSelect) {
        const currentValue = relativeOfSelect.value;
        relativeOfSelect.innerHTML = '<option value="">Select Host</option>';
        hosts.forEach(host => {
            relativeOfSelect.innerHTML += `<option value="${host.name}">${host.name}</option>`;
        });
        if (currentValue) relativeOfSelect.value = currentValue;
    }

    // Update filter dropdown
    if (filterHostSelect) {
        const currentFilter = filterHostSelect.value;
        filterHostSelect.innerHTML = '<option value="">All Hosts</option>';
        hosts.forEach(host => {
            filterHostSelect.innerHTML += `<option value="${host.name}">${host.name}</option>`;
        });
        if (currentFilter) filterHostSelect.value = currentFilter;
    }
}

function renderHostList() {
    const hostListDiv = document.getElementById('hostList');
    if (!hostListDiv) return;

    if (hosts.length === 0) {
        hostListDiv.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 20px;">No hosts added yet. Add your first host above.</p>';
        return;
    }

    hostListDiv.innerHTML = hosts.map(host => {
        const guestCount = guests.filter(g => g.relativeOf === host.name).length;
        const emailBadge = host.email ? `<span class="host-email-badge" title="${escapeHtml(host.email)}">&#9993; ${escapeHtml(host.email)}</span>` : '';
        const mobileBadge = host.mobile ? `<span class="host-mobile-badge" title="${escapeHtml(host.mobile)}">&#128222; ${escapeHtml(host.mobile)}</span>` : '';
        const collabBadge = host.collaborate && host.email ? `<span class="host-collab-badge">&#128274; Collaborator</span>` : '';
        return `
            <div class="host-item">
                <div class="host-item-info">
                    <span class="host-item-name">${escapeHtml(host.name)}</span>
                    <div class="host-item-badges">
                        ${emailBadge}
                        ${mobileBadge}
                        ${collabBadge}
                    </div>
                    <span class="host-item-count">${guestCount} guest${guestCount !== 1 ? 's' : ''} linked</span>
                </div>
                <div class="host-item-actions">
                    <button class="btn btn-small btn-outline" onclick="openEditHostModal('${host.firebaseKey}')" title="Edit host">✏️</button>
                    <button class="btn btn-small btn-danger" onclick="deleteHost('${host.firebaseKey}', '${escapeHtml(host.name)}')">Delete</button>
                </div>
            </div>
        `;
    }).join('');
}

function openEditHostModal(firebaseKey) {
    const host = hosts.find(item => item.firebaseKey === firebaseKey);
    if (!host) return;
    const modal = document.getElementById('hostEditModal');
    if (!modal) return;
    modal.dataset.hostKey = firebaseKey;
    document.getElementById('editHostName').value = host.name || '';
    document.getElementById('editHostEmail').value = host.email || '';
    const shareToggle = document.getElementById('editHostShareToggle');
    if (shareToggle) shareToggle.checked = Boolean(host.shareEnabled);
    openModal('hostEditModal');
}

function saveHostEdits(event) {
    event.preventDefault();
    const modal = document.getElementById('hostEditModal');
    const firebaseKey = modal?.dataset.hostKey;
    if (!firebaseKey) return;

    const name = document.getElementById('editHostName').value.trim();
    const email = document.getElementById('editHostEmail').value.trim();
    const shareToggle = document.getElementById('editHostShareToggle');
    const shareEnabled = shareToggle ? shareToggle.checked : false;

    if (!name) {
        showToast('Please enter a host name', 'error');
        return;
    }

    const duplicate = hosts.find(host => host.firebaseKey !== firebaseKey && host.name.toLowerCase() === name.toLowerCase());
    if (duplicate) {
        showToast('Another host already uses this name', 'error');
        return;
    }

    const payload = {
        name,
        email: email || '',
        shareEnabled,
        updatedAt: new Date().toISOString()
    };

    hostsRef.child(firebaseKey).update(payload)
        .then(() => {
            showToast('Host updated successfully!', 'success');
            closeModal('hostEditModal');
        })
        .catch((error) => {
            console.error('Firebase host update error:', error);
            const index = hosts.findIndex(item => item.firebaseKey === firebaseKey);
            if (index !== -1) {
                hosts[index] = { ...hosts[index], ...payload };
                localStorage.setItem(getHostsStorageKey(), JSON.stringify(hosts));
                renderHostDropdowns();
                renderHostList();
            }
            showToast('Saved host changes locally', 'success');
            closeModal('hostEditModal');
        });
}

function openHostModal() {
    if (!currentEventId) {
        showToast('Please select or create an event first', 'error');
        return;
    }
    renderHostList();
    openModal('hostModal');
}

function addHost() {
    if (!currentEventId) {
        showToast('Please select or create an event first', 'error');
        return;
    }
    if (!hostsRef) {
        showToast('No event selected. Please select an event first.', 'error');
        return;
    }

    const nameInput = document.getElementById('newHostName');
    const emailInput = document.getElementById('newHostEmail');
    const mobileInput = document.getElementById('newHostMobile');
    const collaborateInput = document.getElementById('newHostCollaborate');
    const name = nameInput.value.trim();
    const email = emailInput ? emailInput.value.trim() : '';
    const mobile = mobileInput ? mobileInput.value.trim() : '';
    const collaborate = collaborateInput ? collaborateInput.checked : false;

    if (!name) {
        showToast('Please enter a host name', 'error');
        return;
    }

    // Check for duplicate
    if (hosts.some(h => h.name.toLowerCase() === name.toLowerCase())) {
        showToast('This host already exists', 'error');
        return;
    }

    // Validate email if collaboration is enabled
    if (collaborate && !email) {
        showToast('Email is required for collaboration access', 'error');
        return;
    }

    // Validate mobile if provided
    if (mobile && !/^\d{10}$/.test(mobile)) {
        showToast('Please enter a valid 10-digit mobile number', 'error');
        return;
    }

    const hostData = {
        name: name,
        email: email || '',
        mobile: mobile || '',
        collaborate: collaborate || false,
        createdAt: new Date().toISOString()
    };

    hostsRef.push(hostData)
        .then(() => {
            showToast('Host added successfully!', 'success');
            triggerHaptic();
            nameInput.value = '';
            if (emailInput) emailInput.value = '';
            if (mobileInput) mobileInput.value = '';
            if (collaborateInput) collaborateInput.checked = false;
            toggleCollaborateHint();

            // If collaboration enabled, share event and send email invite
            if (collaborate && email) {
                shareEventWithCoHost(email, name);
                sendCollaborationEmail(email, name);
            }
        })
        .catch((error) => {
            console.error('Firebase host add error:', error);
            hosts.push({ ...hostData, id: generateId() });
            localStorage.setItem(getHostsStorageKey(), JSON.stringify(hosts));
            renderHostDropdowns();
            renderHostList();
            showToast('Host added locally', 'success');
            nameInput.value = '';
            if (emailInput) emailInput.value = '';
            if (mobileInput) mobileInput.value = '';
            if (collaborateInput) collaborateInput.checked = false;
        });
}

function deleteHost(firebaseKey, hostName) {
    const guestCount = guests.filter(g => g.relativeOf === hostName).length;
    if (guestCount > 0) {
        showToast(`Cannot delete: ${guestCount} guests are linked to this host`, 'error');
        return;
    }

    if (!confirm(`Are you sure you want to delete "${hostName}"?`)) return;

    hostsRef.child(firebaseKey).remove()
        .then(() => {
            showToast('Host deleted successfully!', 'success');
        })
        .catch((error) => {
            console.error('Firebase host delete error:', error);
            showToast('Failed to delete host', 'error');
        });
}

function openAddHostInline() {
    openModal('addHostInlineModal');
    document.getElementById('inlineHostName').value = '';
    document.getElementById('inlineHostName').focus();
}

function addHostInline() {
    if (!currentEventId || !hostsRef) {
        showToast('Please select or create an event first', 'error');
        return;
    }

    const nameInput = document.getElementById('inlineHostName');
    const emailInput = document.getElementById('inlineHostEmail');
    const name = nameInput.value.trim();
    const email = emailInput ? emailInput.value.trim() : '';

    if (!name) {
        showToast('Please enter a host name', 'error');
        return;
    }

    if (hosts.some(h => h.name.toLowerCase() === name.toLowerCase())) {
        showToast('This host already exists', 'error');
        return;
    }

    const hostData = {
        name: name,
        email: email || '',
        collaborate: false,
        createdAt: new Date().toISOString()
    };

    hostsRef.push(hostData)
        .then(() => {
            showToast('Host added successfully!', 'success');
            triggerHaptic();
            closeModal('addHostInlineModal');
            // Set the newly added host as selected
            setTimeout(() => {
                document.getElementById('relativeOf').value = name;
            }, 500);
        })
        .catch((error) => {
            console.error('Firebase host add error:', error);
            hosts.push({ ...hostData, id: generateId() });
            localStorage.setItem(getHostsStorageKey(), JSON.stringify(hosts));
            renderHostDropdowns();
            closeModal('addHostInlineModal');
            setTimeout(() => {
                document.getElementById('relativeOf').value = name;
            }, 100);
            showToast('Host added locally', 'success');
        });
}

// ==================== HOST COLLABORATION ====================

function toggleCollaborateHint() {
    const checkbox = document.getElementById('newHostCollaborate');
    const hint = document.getElementById('collaborateHint');
    const emailInput = document.getElementById('newHostEmail');
    if (hint) {
        hint.style.display = checkbox && checkbox.checked ? 'block' : 'none';
    }
    if (emailInput && checkbox) {
        emailInput.required = checkbox.checked;
        if (checkbox.checked) {
            emailInput.placeholder = 'Email (required for collaboration)';
            emailInput.focus();
        } else {
            emailInput.placeholder = 'Email (for co-host collaboration)';
        }
    }
}

function emailToKey(email) {
    // Firebase keys can't contain . # $ [ ] /
    return email.toLowerCase().replace(/\./g, ',').replace(/[#$\[\]\/]/g, '_');
}

// Share an event with a co-host by email
function shareEventWithCoHost(email, hostName) {
    if (!email || !currentEventId || !currentUserId) return;

    const emailKey = emailToKey(email);

    // Determine the actual owner - if this is already a shared event, use the original owner
    const ownerUid = currentEventMeta?.ownerUid || currentUserId;

    const shareData = {
        eventId: currentEventId,
        eventName: currentEventMeta?.name?.replace(' (Shared)', '') || 'Untitled Event',
        ownerUid: ownerUid,
        ownerName: currentUser?.displayName || currentUser?.email || 'Unknown',
        hostName: hostName,
        sharedAt: new Date().toISOString(),
        email: email
    };

    // Write to shared-events/{emailKey} so the co-host can discover it on login
    database.ref(`shared-events/${emailKey}/${ownerUid}_${currentEventId}`).set(shareData)
        .then(() => {
            // Also record collaborators in the event itself
            database.ref(`users/${ownerUid}/events/${currentEventId}/collaborators/${emailKey}`).set({
                email: email,
                hostName: hostName,
                sharedAt: new Date().toISOString()
            });
            // Note: collaborators_uid will be populated when co-host logs in via registerCoHostUid()
            showToast(`Collaboration access granted to ${email}`, 'success');
        })
        .catch((error) => {
            console.error('Failed to share event:', error);
            showToast('Failed to grant collaboration access', 'error');
        });
}

// Load events shared with the current user (by their email)
function loadSharedEvents() {
    if (!currentUser || !currentUser.email) {
        sharedEventsLoaded = true;
        return;
    }

    const emailKey = emailToKey(currentUser.email);
    const sharedRef = database.ref(`shared-events/${emailKey}`);

    sharedRef.on('value', (snap) => {
        sharedEventOwners = {};

        if (snap.exists()) {
            snap.forEach((child) => {
                const data = child.val();
                // Don't list events the user owns themselves
                if (data.ownerUid !== currentUserId) {
                    const key = `${data.ownerUid}_${data.eventId}`;
                    sharedEventOwners[key] = data;
                }
            });
        }

        sharedEventsLoaded = true;

        // Re-render the event dropdown to include shared events
        if (eventsRef) {
            eventsRef.once('value').then((evSnap) => {
                const ownEvents = [];
                if (evSnap.exists()) {
                    evSnap.forEach((child) => {
                        ownEvents.push({
                            id: child.key,
                            meta: child.child('meta').val() || {}
                        });
                    });
                }
                renderEventOptions(ownEvents);

                // Sync dropdown to current selection
                const eventSelect = document.getElementById('eventSelect');
                if (eventSelect && currentEventId) {
                    if (currentEventMeta?.ownerUid && currentEventMeta.ownerUid !== currentUserId) {
                        eventSelect.value = `shared_${currentEventMeta.ownerUid}_${currentEventId}`;
                    } else {
                        eventSelect.value = currentEventId;
                    }
                }
            });
        }

        // Register co-host UID first, then show shared events
        registerCoHostUid().then(() => {
            renderSharedEventsBanner();
        });
    });
}

// Register the co-host's UID with the event owner's data so Firebase rules can authorize
async function registerCoHostUid() {
    if (!currentUserId || !currentUser?.email) return;

    const promises = [];
    Object.keys(sharedEventOwners).forEach((key) => {
        const shared = sharedEventOwners[key];
        const emailKey = emailToKey(currentUser.email);
        // Write to collaborators (existing path)
        promises.push(
            database.ref(`users/${shared.ownerUid}/events/${shared.eventId}/collaborators/${emailKey}/uid`)
                .set(currentUserId).catch(() => {})
        );
        // Write to collaborators_uid (used by security rules for fast lookup)
        promises.push(
            database.ref(`users/${shared.ownerUid}/events/${shared.eventId}/collaborators_uid/${currentUserId}`)
                .set(true).catch(() => {})
        );
    });
    // Wait for all UID registrations to complete before allowing event selection
    await Promise.allSettled(promises);
}

// Show a banner listing shared events
function renderSharedEventsBanner() {
    const keys = Object.keys(sharedEventOwners);
    let banner = document.getElementById('sharedEventsBanner');

    if (keys.length === 0) {
        if (banner) banner.style.display = 'none';
        return;
    }

    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'sharedEventsBanner';
        banner.className = 'shared-events-banner';
        const container = document.querySelector('.container');
        const dashboard = document.querySelector('.dashboard');
        if (container && dashboard) {
            container.insertBefore(banner, dashboard);
        }
    }

    banner.innerHTML = `
        <div class="shared-banner-header">
            <span class="shared-banner-icon">&#129309;</span>
            <strong>Shared With You</strong>
            <span class="shared-banner-count">${keys.length} event(s)</span>
        </div>
        <div class="shared-banner-list">
            ${keys.map(key => {
                const ev = sharedEventOwners[key];
                const isActive = currentEventId === ev.eventId && currentEventMeta?.ownerUid === ev.ownerUid;
                return `
                    <div class="shared-event-item ${isActive ? 'active' : ''}" onclick="selectSharedEvent('${escapeHtml(ev.ownerUid)}', '${escapeHtml(ev.eventId)}')">
                        <div class="shared-event-info">
                            <span class="shared-event-name">${escapeHtml(ev.eventName)}</span>
                            <span class="shared-event-owner">by ${escapeHtml(ev.ownerName)}</span>
                        </div>
                        <span class="shared-event-arrow">${isActive ? '&#10003;' : '&#8250;'}</span>
                    </div>
                `;
            }).join('')}
        </div>
    `;
    banner.style.display = 'block';
}

// Select a shared event - points refs to the OWNER's Firebase path for real-time sync
async function selectSharedEvent(ownerUid, eventId) {
    if (!ownerUid || !eventId || !currentUserId) return;

    // Detach old listeners first
    if (guestsRef) { guestsRef.off(); guestsRef = null; }
    if (hostsRef) { hostsRef.off(); hostsRef = null; }

    currentEventId = eventId;

    // Fetch the event meta from the owner's data
    let meta = null;
    try {
        const snap = await database.ref(`users/${ownerUid}/events/${eventId}/meta`).get();
        meta = snap.exists() ? snap.val() : null;
    } catch (e) {
        console.error('Failed to load shared event meta:', e);
    }

    currentEventMeta = meta || {};
    currentEventMeta.ownerUid = ownerUid; // Track that this is a shared event
    currentEventMeta.isShared = true;
    currentEventName = currentEventMeta?.name || 'Shared Event';

    // Save selection
    localStorage.setItem(getEventStorageKey(), `shared_${ownerUid}_${eventId}`);

    updateEventHeader(currentEventMeta);

    // Sync dropdown
    const eventSelect = document.getElementById('eventSelect');
    if (eventSelect) eventSelect.value = `shared_${ownerUid}_${eventId}`;

    // Point refs to the OWNER's event data - this is the key for real-time sync
    // Both the owner and co-host read/write to the same Firebase path
    guestsRef = database.ref(`users/${ownerUid}/events/${eventId}/guests`);
    hostsRef = database.ref(`users/${ownerUid}/events/${eventId}/hosts`);

    // Reset filters and clear data
    resetEventFilters();
    guests = [];
    hosts = [];
    renderGuestTable();
    renderHostDropdowns();
    updateDashboard();

    // Attach real-time listeners - same data as the owner sees
    guestsRef.on('value', (snap) => {
        if (currentEventId !== eventId) return;
        const data = [];
        if (snap.exists()) {
            snap.forEach((child) => {
                data.push({ ...child.val(), firebaseKey: child.key });
            });
        }
        guests = data;
        renderGuestTable();
        updateDashboard();
    });

    hostsRef.on('value', (snap) => {
        if (currentEventId !== eventId) return;
        const data = [];
        if (snap.exists()) {
            snap.forEach((child) => {
                data.push({ ...child.val(), firebaseKey: child.key });
            });
        }
        hosts = data;
        renderHostDropdowns();
        renderHostList();
    });

    // Update banner active state
    renderSharedEventsBanner();
    updateCohostActivityBar();

    triggerHaptic('medium');
    showToast(`Opened shared event: ${currentEventName}`, 'success');
    console.log('[App] Opened shared event:', eventId, 'Owner:', ownerUid);
}

// Check if co-host can actually read the shared data (test Firebase rules)
function verifySharedAccess(ownerUid, eventId) {
    return database.ref(`users/${ownerUid}/events/${eventId}/meta`).get()
        .then((snap) => {
            if (snap.exists()) {
                return true;
            }
            return false;
        })
        .catch((error) => {
            console.warn('[App] Cannot access shared event. Firebase rules may need updating.', error.code);
            showToast('Cannot access shared event. The event owner may need to update sharing permissions.', 'error');
            return false;
        });
}

// EmailJS Configuration - Free tier: 200 emails/month
// To set up: 1) Go to https://www.emailjs.com and create free account
//            2) Create an Email Service (Gmail, Outlook, etc.)
//            3) Create an Email Template with variables: to_email, to_name, from_name, event_name, app_url
//            4) Replace the IDs below with your own
const EMAILJS_PUBLIC_KEY = 'YOUR_EMAILJS_PUBLIC_KEY';  // Replace after setup
const EMAILJS_SERVICE_ID = 'YOUR_SERVICE_ID';          // Replace after setup
const EMAILJS_TEMPLATE_ID = 'YOUR_TEMPLATE_ID';        // Replace after setup

function sendCollaborationEmail(email, hostName) {
    if (!email) return;

    const eventName = currentEventMeta?.name || 'an event';
    const ownerName = currentUser?.displayName || currentUser?.email || 'Someone';
    const appUrl = window.location.href.split('?')[0];

    // Try EmailJS first (sends real email automatically)
    if (window.emailjs && EMAILJS_PUBLIC_KEY !== 'YOUR_EMAILJS_PUBLIC_KEY') {
        emailjs.init(EMAILJS_PUBLIC_KEY);
        emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
            to_email: email,
            to_name: hostName,
            from_name: ownerName,
            event_name: eventName,
            app_url: appUrl,
            message: `You have been invited to collaborate on the guest list for "${eventName}". ` +
                     `Sign in or create an account at ${appUrl} using this email (${email}). ` +
                     `The shared event will appear automatically in your dashboard.`
        }).then(() => {
            showToast(`Invitation email sent to ${email}!`, 'success');
        }).catch((err) => {
            console.error('EmailJS error:', err);
            // Fallback to mailto
            openMailtoFallback(email, hostName, eventName, ownerName, appUrl);
        });
    } else {
        // Fallback: open user's email client
        openMailtoFallback(email, hostName, eventName, ownerName, appUrl);
    }
}

function openMailtoFallback(email, hostName, eventName, ownerName, appUrl) {
    const subject = encodeURIComponent(`You're invited to collaborate on "${eventName}" - InviteePro`);
    const body = encodeURIComponent(
        `Hi ${hostName},\n\n` +
        `${ownerName} has invited you to collaborate on the guest list for "${eventName}" using InviteePro.\n\n` +
        `You can add, edit, and manage the guest list together as a family.\n\n` +
        `To get started:\n` +
        `1. Open InviteePro: ${appUrl}\n` +
        `2. Sign in or create an account using this email: ${email}\n` +
        `3. The shared event will appear automatically in your dashboard\n\n` +
        `Happy planning!\n${ownerName}`
    );
    window.open(`mailto:${email}?subject=${subject}&body=${body}`, '_blank');
    showToast(`Email client opened for ${email}`, 'success');
}

function grantCollabAccess(firebaseKey, email, hostName) {
    if (!email || !firebaseKey || !hostsRef) return;

    if (!confirm(`Grant collaboration access to ${email} for this event?`)) return;

    hostsRef.child(firebaseKey).update({ collaborate: true })
        .then(() => {
            shareEventWithCoHost(email, hostName);
        })
        .catch((error) => {
            console.error('Failed to update host:', error);
            showToast('Failed to grant access', 'error');
        });
}

// ==================== EDIT HOST ====================

function openEditHostModal(firebaseKey) {
    const host = hosts.find(h => h.firebaseKey === firebaseKey);
    if (!host) { showToast('Host not found', 'error'); return; }

    document.getElementById('editHostKey').value = firebaseKey;
    document.getElementById('editHostName').value = host.name || '';
    document.getElementById('editHostEmail').value = host.email || '';
    document.getElementById('editHostMobile').value = host.mobile || '';
    const collabCheckbox = document.getElementById('editHostCollaborate');
    collabCheckbox.checked = !!host.collaborate;
    toggleEditCollabHint();
    collabCheckbox.addEventListener('change', toggleEditCollabHint);
    openModal('editHostModal');
}

function toggleEditCollabHint() {
    const cb = document.getElementById('editHostCollaborate');
    const hint = document.getElementById('editCollabHint');
    if (hint) hint.style.display = cb && cb.checked ? 'block' : 'none';
}

function updateHost() {
    const firebaseKey = document.getElementById('editHostKey').value;
    if (!firebaseKey || !hostsRef) { showToast('Error: no host selected', 'error'); return; }

    const name = document.getElementById('editHostName').value.trim();
    const email = document.getElementById('editHostEmail').value.trim();
    const mobile = document.getElementById('editHostMobile').value.trim();
    const collaborate = document.getElementById('editHostCollaborate').checked;

    if (!name) { showToast('Host name is required', 'error'); return; }
    if (collaborate && !email) { showToast('Email is required for collaboration', 'error'); return; }
    if (mobile && !/^\d{10}$/.test(mobile)) { showToast('Enter a valid 10-digit mobile number', 'error'); return; }

    const oldHost = hosts.find(h => h.firebaseKey === firebaseKey);
    const oldName = oldHost ? oldHost.name : '';
    const wasCollaborating = oldHost ? !!oldHost.collaborate : false;

    const updatedData = { name, email: email || '', mobile: mobile || '', collaborate };

    hostsRef.child(firebaseKey).update(updatedData)
        .then(() => {
            // If host name changed, update all guests linked to old name
            if (oldName && oldName !== name) {
                guests.forEach(g => {
                    if (g.relativeOf === oldName && g.firebaseKey && guestsRef) {
                        guestsRef.child(g.firebaseKey).update({ relativeOf: name });
                    }
                });
            }

            // If collaboration was just enabled, share event and send email
            if (collaborate && email && !wasCollaborating) {
                shareEventWithCoHost(email, name);
                sendCollaborationEmail(email, name);
            }

            // If collaboration was disabled, revoke sharing
            if (!collaborate && wasCollaborating && oldHost?.email) {
                revokeSharing(oldHost.email);
            }

            showToast('Host updated successfully', 'success');
            closeModal('editHostModal');
        })
        .catch((error) => {
            console.error('Failed to update host:', error);
            showToast('Failed to update host', 'error');
        });
}

function revokeSharing(email) {
    if (!email || !currentEventId || !currentUserId) return;
    const emailKey = emailToKey(email);
    const ownerUid = currentEventMeta?.ownerUid || currentUserId;

    // Remove from shared-events
    database.ref(`shared-events/${emailKey}/${ownerUid}_${currentEventId}`).remove().catch(() => {});
    // Remove from collaborators
    database.ref(`users/${ownerUid}/events/${currentEventId}/collaborators/${emailKey}`).once('value', (snap) => {
        if (snap.exists()) {
            const uid = snap.val().uid;
            // Remove UID lookup used by security rules
            if (uid) {
                database.ref(`users/${ownerUid}/events/${currentEventId}/collaborators_uid/${uid}`).remove().catch(() => {});
            }
        }
        snap.ref.remove().catch(() => {});
    });
}

// ==================== CO-HOST ACTIVITY ====================

function updateCohostActivityBar() {
    const bar = document.getElementById('cohostActivityBar');
    const text = document.getElementById('cohostActivityText');
    const badge = document.getElementById('cohostActivityBadge');
    if (!bar) return;

    if (currentEventMeta?.isShared) {
        // This user is viewing a shared event
        const ownerName = currentEventMeta.ownerName || sharedEventOwners[`${currentEventMeta.ownerUid}_${currentEventId}`]?.ownerName || 'Owner';
        bar.style.display = 'flex';
        text.textContent = `Shared by ${ownerName}`;
        badge.textContent = 'Co-host';
        badge.className = 'cohost-activity-badge badge-cohost';
    } else if (currentEventId && currentUserId) {
        // Check if this event has collaborators
        const ownerUid = currentEventMeta?.ownerUid || currentUserId;
        database.ref(`users/${ownerUid}/events/${currentEventId}/collaborators`).once('value', (snap) => {
            if (snap.exists() && snap.numChildren() > 0) {
                const collabs = [];
                snap.forEach(c => { collabs.push(c.val().email || c.val().hostName || 'co-host'); });
                bar.style.display = 'flex';
                text.textContent = `Shared with ${collabs.length} co-host(s)`;
                badge.textContent = 'Owner';
                badge.className = 'cohost-activity-badge badge-owner';
            } else {
                bar.style.display = 'none';
            }
        });
        return;
    } else {
        bar.style.display = 'none';
    }
}

// ==================== GUEST MANAGEMENT ====================

function saveGuests() {
    localStorage.setItem(getGuestsStorageKey(), JSON.stringify(guests));
}

function saveGuestToFirebase(guestData) {
    if (guestData.firebaseKey) {
        return guestsRef.child(guestData.firebaseKey).set(guestData);
    } else {
        return guestsRef.push(guestData);
    }
}

function deleteGuestFromFirebase(firebaseKey) {
    return guestsRef.child(firebaseKey).remove();
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// Modal Operations
function openAddModal() {
    if (!currentEventId) {
        showToast('Please select or create an event first', 'error');
        return;
    }
    document.getElementById('modalTitle').textContent = 'Add New Guest';
    document.getElementById('guestForm').reset();
    document.getElementById('guestId').value = '';
    document.getElementById('giftDescGroup').style.display = 'none';
    // Reset food split to defaults
    document.getElementById('foodRegular').value = 1;
    document.getElementById('foodSwaminarayan').value = 0;
    document.getElementById('foodJain').value = 0;
    updateFoodSplitDisplay();
    renderHostDropdowns();
    renderStatusTimeline(null);
    openModal('guestModal');
}

function openEditModal(id) {
    const guest = guests.find(g => g.id === id);
    if (!guest) return;

    document.getElementById('modalTitle').textContent = 'Edit Guest';
    document.getElementById('guestId').value = guest.id;
    document.getElementById('firstName').value = guest.firstName;
    document.getElementById('surname').value = guest.surname;
    document.getElementById('relativeOf').value = guest.relativeOf || '';
    document.getElementById('members').value = guest.members;
    document.getElementById('whatsapp').value = guest.whatsapp;
    setFoodSplitFromGuest(guest);
    document.getElementById('rsvpStatus').value = guest.rsvpStatus;
    const callDoneEl = document.getElementById('callDone');
    if (callDoneEl) callDoneEl.checked = guest.callDone || false;
    document.getElementById('giftGiven').checked = guest.giftGiven;
    document.getElementById('giftDescription').value = guest.giftDescription || '';
    document.getElementById('notes').value = guest.notes || '';

    toggleGiftDescription();
    renderHostDropdowns();
    renderStatusTimeline(guest);
    openModal('guestModal');
}

function openExportModal() {
    openModal('exportModal');
}

function openBackupModal() {
    openModal('backupModal');
}

function openModal(modalId) {
    document.getElementById(modalId).classList.add('show');
    document.body.style.overflow = 'hidden';
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('show');
    document.body.style.overflow = '';
}

function toggleGiftDescription() {
    const giftGiven = document.getElementById('giftGiven').checked;
    document.getElementById('giftDescGroup').style.display = giftGiven ? 'block' : 'none';
}

// ==================== FOOD SPLIT ====================

function updateFoodSplit() {
    const members = parseInt(document.getElementById('members').value) || 1;
    const regular = parseInt(document.getElementById('foodRegular').value) || 0;
    const swaminarayan = parseInt(document.getElementById('foodSwaminarayan').value) || 0;
    const jain = parseInt(document.getElementById('foodJain').value) || 0;
    const total = regular + swaminarayan + jain;

    // If total doesn't match members, adjust Regular to fill the gap
    if (total !== members) {
        const diff = members - (swaminarayan + jain);
        document.getElementById('foodRegular').value = Math.max(0, diff);
    }

    updateFoodSplitDisplay();
}

function adjustFoodSplit(changedType) {
    const members = parseInt(document.getElementById('members').value) || 1;
    let regular = parseInt(document.getElementById('foodRegular').value) || 0;
    let swaminarayan = parseInt(document.getElementById('foodSwaminarayan').value) || 0;
    let jain = parseInt(document.getElementById('foodJain').value) || 0;

    const total = regular + swaminarayan + jain;

    if (total > members) {
        // Reduce other fields to fit
        if (changedType === 'Regular') {
            const remaining = members - regular;
            if (swaminarayan + jain > remaining) {
                const ratio = remaining / (swaminarayan + jain || 1);
                swaminarayan = Math.floor(swaminarayan * ratio);
                jain = remaining - swaminarayan;
            }
        } else if (changedType === 'Swaminarayan') {
            const remaining = members - swaminarayan;
            if (regular + jain > remaining) {
                jain = Math.min(jain, remaining);
                regular = remaining - jain;
            }
        } else if (changedType === 'Jain') {
            const remaining = members - jain;
            if (regular + swaminarayan > remaining) {
                swaminarayan = Math.min(swaminarayan, remaining);
                regular = remaining - swaminarayan;
            }
        }
        document.getElementById('foodRegular').value = Math.max(0, regular);
        document.getElementById('foodSwaminarayan').value = Math.max(0, swaminarayan);
        document.getElementById('foodJain').value = Math.max(0, jain);
    } else if (total < members) {
        // Auto-fill remaining into Regular
        regular = members - swaminarayan - jain;
        document.getElementById('foodRegular').value = Math.max(0, regular);
    }

    updateFoodSplitDisplay();
}

function updateFoodSplitDisplay() {
    const members = parseInt(document.getElementById('members').value) || 1;
    const regular = parseInt(document.getElementById('foodRegular').value) || 0;
    const swaminarayan = parseInt(document.getElementById('foodSwaminarayan').value) || 0;
    const jain = parseInt(document.getElementById('foodJain').value) || 0;
    const total = regular + swaminarayan + jain;

    document.getElementById('foodSplitSum').textContent = total;
    document.getElementById('foodSplitMembers').textContent = members;

    const totalEl = document.getElementById('foodSplitTotal');
    if (totalEl) {
        totalEl.classList.toggle('mismatch', total !== members);
        totalEl.classList.toggle('match', total === members);
    }
}

function getFoodSplitData() {
    return {
        regular: parseInt(document.getElementById('foodRegular').value) || 0,
        swaminarayan: parseInt(document.getElementById('foodSwaminarayan').value) || 0,
        jain: parseInt(document.getElementById('foodJain').value) || 0
    };
}

function setFoodSplitFromGuest(guest) {
    const members = guest.members || 1;
    if (guest.foodSplit) {
        document.getElementById('foodRegular').value = guest.foodSplit.regular || 0;
        document.getElementById('foodSwaminarayan').value = guest.foodSplit.swaminarayan || 0;
        document.getElementById('foodJain').value = guest.foodSplit.jain || 0;
    } else {
        // Backward compatibility: convert old single foodPref to split
        const pref = guest.foodPref || 'Regular';
        document.getElementById('foodRegular').value = pref === 'Regular' ? members : 0;
        document.getElementById('foodSwaminarayan').value = pref === 'Swaminarayan' ? members : 0;
        document.getElementById('foodJain').value = pref === 'Jain' ? members : 0;
    }
    updateFoodSplitDisplay();
}

function getFoodPrefLabel(guest) {
    if (guest.foodSplit) {
        const parts = [];
        if (guest.foodSplit.regular > 0) parts.push(`${guest.foodSplit.regular}R`);
        if (guest.foodSplit.swaminarayan > 0) parts.push(`${guest.foodSplit.swaminarayan}S`);
        if (guest.foodSplit.jain > 0) parts.push(`${guest.foodSplit.jain}J`);
        return parts.join(' + ') || 'Regular';
    }
    return guest.foodPref || 'Regular';
}

function getFoodPrefBadgeClass(guest) {
    if (guest.foodSplit) {
        const { regular, swaminarayan, jain } = guest.foodSplit;
        if (swaminarayan === 0 && jain === 0) return 'regular';
        if (regular === 0 && jain === 0) return 'swaminarayan';
        if (regular === 0 && swaminarayan === 0) return 'jain';
        return 'mixed';
    }
    return (guest.foodPref || 'Regular').toLowerCase();
}

function saveGuest(event) {
    event.preventDefault();

    const id = document.getElementById('guestId').value;
    const existingGuest = id ? guests.find(g => g.id === id) : null;

    const foodSplit = getFoodSplitData();
    // Determine primary food pref for backward compatibility and filtering
    let primaryFoodPref = 'Regular';
    if (foodSplit.swaminarayan > foodSplit.regular && foodSplit.swaminarayan >= foodSplit.jain) primaryFoodPref = 'Swaminarayan';
    else if (foodSplit.jain > foodSplit.regular && foodSplit.jain > foodSplit.swaminarayan) primaryFoodPref = 'Jain';
    if (foodSplit.regular > 0 && (foodSplit.swaminarayan > 0 || foodSplit.jain > 0)) primaryFoodPref = 'Mixed';

    const callDoneEl = document.getElementById('callDone');
    const guestData = {
        id: id || generateId(),
        firstName: document.getElementById('firstName').value.trim(),
        surname: document.getElementById('surname').value.trim(),
        relativeOf: document.getElementById('relativeOf').value,
        members: parseInt(document.getElementById('members').value) || 1,
        whatsapp: document.getElementById('whatsapp').value.trim(),
        foodPref: primaryFoodPref,
        foodSplit: foodSplit,
        rsvpStatus: document.getElementById('rsvpStatus').value,
        callDone: callDoneEl ? callDoneEl.checked : (existingGuest?.callDone || false),
        giftGiven: document.getElementById('giftGiven').checked,
        giftDescription: document.getElementById('giftDescription').value.trim(),
        notes: document.getElementById('notes').value.trim(),
        createdAt: existingGuest?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        statusHistory: (existingGuest && Array.isArray(existingGuest.statusHistory)) ? existingGuest.statusHistory : []
    };

    // Timeline: add entry when RSVP status changes
    if (existingGuest && existingGuest.rsvpStatus !== guestData.rsvpStatus) {
        guestData.statusHistory.push({
            from: existingGuest.rsvpStatus || 'Unknown',
            to: guestData.rsvpStatus || 'Unknown',
            at: new Date().toISOString()
        });
    } else if (!existingGuest && guestData.rsvpStatus) {
        guestData.statusHistory.push({
            from: null,
            to: guestData.rsvpStatus,
            at: new Date().toISOString()
        });
    }

    if (existingGuest?.firebaseKey) {
        guestData.firebaseKey = existingGuest.firebaseKey;
    }

    if (!/^\d{10}$/.test(guestData.whatsapp)) {
        showToast('Please enter a valid 10-digit mobile number', 'error');
        return;
    }

    if (!guestData.relativeOf) {
        showToast('Please select a host (Relative of whom)', 'error');
        return;
    }

    saveGuestToFirebase(guestData)
        .then(() => {
            showToast(id ? 'Guest updated successfully!' : 'Guest added successfully!', 'success');
            closeModal('guestModal');
        })
        .catch((error) => {
            console.error('Firebase save error:', error);
            if (id) {
                const index = guests.findIndex(g => g.id === id);
                if (index !== -1) guests[index] = guestData;
            } else {
                guests.push(guestData);
            }
            saveGuests();
            renderGuestTable();
            updateDashboard();
            showToast('Saved locally (offline mode)', 'success');
            closeModal('guestModal');
        });
}

function deleteGuest(id) {
    const guest = guests.find(g => g.id === id);
    if (!guest) return;

    deleteTargetId = id;
    document.getElementById('deleteGuestName').textContent = `${guest.firstName} ${guest.surname}`;
    openModal('deleteModal');
}

function confirmDelete() {
    if (!deleteTargetId) return;

    const guest = guests.find(g => g.id === deleteTargetId);
    if (!guest) return;

    if (guest.firebaseKey) {
        deleteGuestFromFirebase(guest.firebaseKey)
            .then(() => {
                showToast('Guest deleted successfully!', 'success');
                closeModal('deleteModal');
                deleteTargetId = null;
            })
            .catch((error) => {
                console.error('Firebase delete error:', error);
                guests = guests.filter(g => g.id !== deleteTargetId);
                saveGuests();
                renderGuestTable();
                updateDashboard();
                showToast('Deleted locally (offline mode)', 'success');
                closeModal('deleteModal');
                deleteTargetId = null;
            });
    } else {
        guests = guests.filter(g => g.id !== deleteTargetId);
        saveGuests();
        renderGuestTable();
        updateDashboard();
        showToast('Guest deleted successfully!', 'success');
        closeModal('deleteModal');
        deleteTargetId = null;
    }
}

// ==================== RENDER & FILTER ====================

function renderGuestTable() {
    const filteredGuests = getFilteredGuests();
    const tbody = document.getElementById('guestTableBody');
    const emptyState = document.getElementById('emptyState');
    const tableWrapper = document.querySelector('.table-wrapper');

    if (filteredGuests.length === 0) {
        tbody.innerHTML = '';
        tableWrapper.style.display = 'none';
        emptyState.classList.add('show');
        return;
    }

    tableWrapper.style.display = 'block';
    emptyState.classList.remove('show');

    tbody.innerHTML = filteredGuests.map((guest, index) => `
        <tr>
            <td>${index + 1}</td>
            <td><strong>${escapeHtml(guest.firstName)} ${escapeHtml(guest.surname)}</strong></td>
            <td><span class="relative-badge">${escapeHtml(guest.relativeOf) || '-'}</span></td>
            <td>${guest.members}</td>
            <td>
                <a href="javascript:void(0)" class="whatsapp-btn" onclick="sendWhatsappInvite('${guest.whatsapp}','${(guest.firstName||'').replace(/'/g,"\\'")} ${ (guest.surname||'').replace(/'/g,"\\'") }'.trim())">&#128172; WhatsApp</a>
            </td>
            <td><span class="badge badge-${getFoodPrefBadgeClass(guest)}">${getFoodPrefLabel(guest)}</span></td>
            <td><span class="badge badge-${guest.rsvpStatus.toLowerCase()}">${guest.rsvpStatus}</span></td>
            <td>
                <button class="call-toggle-btn ${guest.callDone ? 'done' : ''}" onclick="toggleCallDone('${guest.id}')" title="${guest.callDone ? 'Called' : 'Mark as called'}">
                    ${guest.callDone ? '&#9989;' : '&#128222;'}
                </button>
            </td>
            <td>
                ${guest.giftGiven ? `
                    <div class="gift-info">
                        <span>Yes</span>
                        ${guest.giftDescription ? `<span class="gift-desc">${escapeHtml(guest.giftDescription)}</span>` : ''}
                    </div>
                ` : 'No'}
            </td>
            <td>
                <div class="action-cell">
                    <button class="action-btn call" onclick="openWhatsApp('${guest.whatsapp}')" title="WhatsApp">&#128172;</button>
                    <button class="action-btn edit" onclick="openEditModal('${guest.id}')" title="Edit">&#9998;</button>
                    <button class="action-btn delete" onclick="deleteGuest('${guest.id}')" title="Delete">&#128465;</button>
                </div>
            </td>
        </tr>
    `).join('');
}

function formatPhone(phone) {
    if (phone.length !== 10) return phone;
    return `${phone.substring(0, 5)} ${phone.substring(5)}`;
}

function getFilteredGuests() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const rsvpFilter = document.getElementById('filterRsvp').value;
    const foodFilter = document.getElementById('filterFood').value;
    const hostFilter = document.getElementById('filterHost').value;

    return guests.filter(guest => {
        const matchesSearch = !searchTerm ||
            guest.firstName.toLowerCase().includes(searchTerm) ||
            guest.surname.toLowerCase().includes(searchTerm) ||
            guest.whatsapp.includes(searchTerm) ||
            (guest.relativeOf && guest.relativeOf.toLowerCase().includes(searchTerm)) ||
            (guest.notes && guest.notes.toLowerCase().includes(searchTerm));

        const matchesRsvp = !rsvpFilter || guest.rsvpStatus === rsvpFilter;
        const matchesFood = !foodFilter || guest.foodPref === foodFilter ||
            (guest.foodSplit && guest.foodSplit[foodFilter.toLowerCase()] > 0);
        const matchesHost = !hostFilter || guest.relativeOf === hostFilter;

        return matchesSearch && matchesRsvp && matchesFood && matchesHost;
    });
}

function filterAndRenderTable() {
    renderGuestTable();
}

function resetEventFilters() {
    const searchInput = document.getElementById('searchInput');
    const filterRsvp = document.getElementById('filterRsvp');
    const filterFood = document.getElementById('filterFood');
    const filterHost = document.getElementById('filterHost');

    if (searchInput) searchInput.value = '';
    if (filterRsvp) filterRsvp.value = '';
    if (filterFood) filterFood.value = '';
    if (filterHost) filterHost.value = '';
}

// ==================== DASHBOARD ====================

function updateDashboard() {
    const stats = {
        totalFamilies: guests.length,
        totalGuests: guests.reduce((sum, g) => sum + g.members, 0),
        confirmed: guests.filter(g => g.rsvpStatus === 'Confirmed').length,
        pending: guests.filter(g => g.rsvpStatus === 'Pending').length,
        declined: guests.filter(g => g.rsvpStatus === 'Declined').length,
        regular: guests.reduce((sum, g) => {
            if (g.foodSplit) return sum + (g.foodSplit.regular || 0);
            return sum + ((g.foodPref || 'Regular') === 'Regular' ? g.members : 0);
        }, 0),
        swaminarayan: guests.reduce((sum, g) => {
            if (g.foodSplit) return sum + (g.foodSplit.swaminarayan || 0);
            return sum + (g.foodPref === 'Swaminarayan' ? g.members : 0);
        }, 0),
        jain: guests.reduce((sum, g) => {
            if (g.foodSplit) return sum + (g.foodSplit.jain || 0);
            return sum + (g.foodPref === 'Jain' ? g.members : 0);
        }, 0),
        gifts: guests.filter(g => g.giftGiven).length,
        callsDone: guests.filter(g => g.callDone).length,
        callsPending: guests.filter(g => !g.callDone).length
    };

    document.getElementById('totalFamilies').textContent = stats.totalFamilies;
    document.getElementById('totalGuests').textContent = stats.totalGuests;
    document.getElementById('confirmedCount').textContent = stats.confirmed;
    document.getElementById('pendingCount').textContent = stats.pending;

    document.getElementById('regularCount').textContent = stats.regular;
    document.getElementById('swaminarayanCount').textContent = stats.swaminarayan;
    const jainCountEl = document.getElementById('jainCount');
    if (jainCountEl) jainCountEl.textContent = stats.jain;

    document.getElementById('statusConfirmed').textContent = stats.confirmed;
    document.getElementById('statusPending').textContent = stats.pending;
    document.getElementById('statusDeclined').textContent = stats.declined;

    document.getElementById('giftsCount').textContent = stats.gifts;

    // Call tracker stats
    const callsCountEl = document.getElementById('callsCount');
    const callsPendingEl = document.getElementById('callsPendingCount');
    if (callsCountEl) callsCountEl.textContent = stats.callsDone;
    if (callsPendingEl) callsPendingEl.textContent = stats.callsPending;

    // Persist quick stats for Event Dashboard
    updateEventMetaStats();
}

// ==================== WHATSAPP ====================

function openWhatsApp(phone) {
    const message = encodeURIComponent('Namaste! You are cordially invited to our Housewarming ceremony. We look forward to your presence.');
    window.open(`https://wa.me/91${phone}?text=${message}`, '_blank');
}

function copyAllWhatsappNumbers() {
    const numbers = guests.map(g => `+91${g.whatsapp}`).join('\n');
    if (!numbers) {
        showToast('No WhatsApp numbers to copy', 'error');
        return;
    }

    navigator.clipboard.writeText(numbers).then(() => {
        showToast(`${guests.length} WhatsApp numbers copied to clipboard!`, 'success');
    }).catch(() => {
        const textarea = document.createElement('textarea');
        textarea.value = numbers;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        showToast(`${guests.length} WhatsApp numbers copied to clipboard!`, 'success');
    });
}

// ==================== EXPORT ====================

function getSelectedColumns() {
    return {
        sno: document.getElementById('expSno').checked,
        name: document.getElementById('expName').checked,
        relativeOf: document.getElementById('expRelativeOf').checked,
        members: document.getElementById('expMembers').checked,
        whatsapp: document.getElementById('expWhatsapp').checked,
        food: document.getElementById('expFood').checked,
        rsvp: document.getElementById('expRsvp').checked,
        gift: document.getElementById('expGift').checked,
        notes: document.getElementById('expNotes').checked
    };
}

function exportToExcel() {
    if (guests.length === 0) {
        showToast('No data to export', 'error');
        return;
    }

    const columns = getSelectedColumns();
    const data = guests.map((guest, index) => {
        const row = {};
        if (columns.sno) row['S.No'] = index + 1;
        if (columns.name) row['Family Head Name'] = `${guest.firstName} ${guest.surname}`;
        if (columns.relativeOf) row['Relative Of'] = guest.relativeOf || '-';
        if (columns.members) row['Members'] = guest.members;
        if (columns.whatsapp) row['WhatsApp'] = `+91 ${formatPhone(guest.whatsapp)}`;
        if (columns.food) row['Food Preference'] = getFoodPrefLabel(guest);
        if (columns.rsvp) row['RSVP Status'] = guest.rsvpStatus;
        if (columns.gift) row['Gift'] = guest.giftGiven ? (guest.giftDescription || 'Yes') : 'No';
        if (columns.notes) row['Notes'] = guest.notes || '';
        return row;
    });

    const summaryRow = {};
    if (columns.sno) summaryRow['S.No'] = '';
    if (columns.name) summaryRow['Family Head Name'] = `Total: ${guests.length} Families`;
    if (columns.relativeOf) summaryRow['Relative Of'] = '';
    if (columns.members) summaryRow['Members'] = guests.reduce((sum, g) => sum + g.members, 0);
    if (columns.whatsapp) summaryRow['WhatsApp'] = '';
    if (columns.food) summaryRow['Food Preference'] = '';
    if (columns.rsvp) summaryRow['RSVP Status'] = '';
    if (columns.gift) summaryRow['Gift'] = '';
    if (columns.notes) summaryRow['Notes'] = '';
    data.push(summaryRow);

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Invitee List');

    const colWidths = Object.keys(data[0] || {}).map(key => ({
        wch: Math.max(key.length, ...data.map(row => String(row[key] || '').length)) + 2
    }));
    ws['!cols'] = colWidths;

    XLSX.writeFile(wb, `Housewarming_Invitees_${getDateString()}.xlsx`);
    showToast('Excel file downloaded!', 'success');
    closeModal('exportModal');
}

function exportToPDF() {
    if (guests.length === 0) {
        showToast('No data to export', 'error');
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('landscape');
    const columns = getSelectedColumns();

    doc.setFontSize(18);
    doc.setTextColor(124, 58, 237);
    doc.text('Housewarming Invitee List', 14, 22);

    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Generated on: ${new Date().toLocaleDateString('en-IN')}`, 14, 30);

    doc.setFontSize(11);
    doc.setTextColor(0);
    const totalGuests = guests.reduce((sum, g) => sum + g.members, 0);
    doc.text(`Total Families: ${guests.length} | Total Guests: ${totalGuests}`, 14, 38);

    const headers = [];
    if (columns.sno) headers.push('S.No');
    if (columns.name) headers.push('Family Head');
    if (columns.relativeOf) headers.push('Relative Of');
    if (columns.members) headers.push('Members');
    if (columns.whatsapp) headers.push('WhatsApp');
    if (columns.food) headers.push('Food');
    if (columns.rsvp) headers.push('RSVP');
    if (columns.gift) headers.push('Gift');
    if (columns.notes) headers.push('Notes');

    const tableData = guests.map((guest, index) => {
        const row = [];
        if (columns.sno) row.push(index + 1);
        if (columns.name) row.push(`${guest.firstName} ${guest.surname}`);
        if (columns.relativeOf) row.push(guest.relativeOf || '-');
        if (columns.members) row.push(guest.members);
        if (columns.whatsapp) row.push(`+91 ${guest.whatsapp}`);
        if (columns.food) row.push(getFoodPrefLabel(guest));
        if (columns.rsvp) row.push(guest.rsvpStatus);
        if (columns.gift) row.push(guest.giftGiven ? (guest.giftDescription || 'Yes') : 'No');
        if (columns.notes) row.push(guest.notes || '-');
        return row;
    });

    doc.autoTable({
        head: [headers],
        body: tableData,
        startY: 45,
        styles: { fontSize: 9, cellPadding: 3 },
        headStyles: { fillColor: [124, 58, 237], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 250, 252] }
    });

    doc.save(`Housewarming_Invitees_${getDateString()}.pdf`);
    showToast('PDF file downloaded!', 'success');
    closeModal('exportModal');
}

function exportStickerList() {
    if (guests.length === 0) {
        showToast('No data to export', 'error');
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    doc.setFontSize(16);
    doc.setTextColor(124, 58, 237);
    doc.text('Sticker List - Family Head Names', 14, 20);

    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Total: ${guests.length} stickers needed`, 14, 28);

    const stickerData = guests.map((guest, index) => [
        index + 1,
        `Shri ${guest.firstName} ${guest.surname}`,
        guest.members > 1 ? '& Family' : ''
    ]);

    doc.autoTable({
        head: [['S.No', 'Name for Sticker', '']],
        body: stickerData,
        startY: 35,
        styles: { fontSize: 11, cellPadding: 5 },
        headStyles: { fillColor: [124, 58, 237], textColor: 255, fontStyle: 'bold' },
        columnStyles: { 0: { cellWidth: 20 }, 1: { cellWidth: 100 }, 2: { cellWidth: 40 } }
    });

    doc.save(`Sticker_List_${getDateString()}.pdf`);
    showToast('Sticker list downloaded!', 'success');
    closeModal('exportModal');
}

// ==================== BACKUP & RESTORE ====================

function downloadBackup() {
    const scopeEl = document.getElementById('backupScope');
    const scope = scopeEl ? scopeEl.value : 'current';
    if (scope === 'all') { downloadAllEventsBackup(); return; }

    if (guests.length === 0 && hosts.length === 0) {
        showToast('No data to backup', 'error');
        return;
    }

    const backup = {
        version: '2.0',
        exportDate: new Date().toISOString(),
        guests: guests,
        hosts: hosts
    };

    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Invitee_Backup_${getDateString()}.json`;
    a.click();
    URL.revokeObjectURL(url);

    showToast('Backup downloaded successfully!', 'success');
    closeModal('backupModal');
}

function restoreBackup(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const backup = JSON.parse(e.target.result);

            // Support both old and new backup formats
            // New format: backup.events[]
            if (Array.isArray(backup.events)) {
                await restoreAllEventsBackup(backup.events);
                showToast(`Restored ${backup.events.length} event(s)!`, 'success');
                closeModal('backupModal');
                await loadEventsAndRestoreSelection();
                return;
            }

            const guestsData = backup.guests || backup.data || [];
            const hostsData = backup.hosts || [];


            if (!Array.isArray(guestsData)) {
                throw new Error('Invalid backup file format');
            }

            // Restore to Firebase
            Promise.all([
                guestsRef.remove(),
                hostsRef.remove()
            ]).then(() => {
                const guestPromises = guestsData.map(guest => {
                    delete guest.firebaseKey;
                    return guestsRef.push(guest);
                });
                const hostPromises = hostsData.map(host => {
                    delete host.firebaseKey;
                    return hostsRef.push(host);
                });

                return Promise.all([...guestPromises, ...hostPromises]);
            }).then(() => {
                showToast(`Restored ${guestsData.length} guests and ${hostsData.length} hosts!`, 'success');
                closeModal('backupModal');
            }).catch((error) => {
                console.error('Firebase restore error:', error);
                guests = guestsData;
                hosts = hostsData;
                saveGuests();
                localStorage.setItem(getHostsStorageKey(), JSON.stringify(hosts));
                renderGuestTable();
                renderHostDropdowns();
                updateDashboard();
                showToast('Restored locally!', 'success');
                closeModal('backupModal');
            });

        } catch (error) {
            showToast('Failed to restore: Invalid backup file', 'error');
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}

// ==================== UTILITIES ====================

function getDateString() {
    return new Date().toISOString().split('T')[0];
}

function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast ${type} show`;

    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}


function renderStatusTimeline(guest) {
    const box = document.getElementById('statusTimeline');
    if (!box) return;
    const history = guest && Array.isArray(guest.statusHistory) ? guest.statusHistory.slice().reverse() : [];
    if (!guest || history.length === 0) {
        box.innerHTML = '<div class="timeline-meta">No timeline yet.</div>';
        return;
    }
    box.innerHTML = history.map(item => {
        const dt = new Date(item.at);
        const when = isNaN(dt.getTime()) ? item.at : dt.toLocaleString();
        const text = item.from ? `RSVP changed: <strong>${escapeHtml(item.from)}</strong> → <strong>${escapeHtml(item.to)}</strong>` : `RSVP set to <strong>${escapeHtml(item.to)}</strong>`;
        return `<div class="timeline-item">
            <div class="timeline-dot"></div>
            <div>
              <div class="timeline-content">${text}</div>
              <div class="timeline-meta">${escapeHtml(when)}</div>
            </div>
        </div>`;
    }).join('');
}

function normalizePhone(phone) {
    const digits = String(phone || '').replace(/\D/g, '');
    // If 10 digits assume India +91
    if (digits.length === 10) return '91' + digits;
    // If already includes country code
    return digits;
}

async function downloadAllEventsBackup() {
    if (!currentUserId) {
        showToast('Please sign in first', 'error');
        return;
    }

    try {
        const snap = await eventsRef.get();
        const payload = { version: '3.0', exportDate: new Date().toISOString(), events: [] };

        if (snap.exists()) {
            const promises = [];
            snap.forEach(child => {
                const eventId = child.key;
                const meta = child.child('meta').val() || {};
                promises.push(
                    Promise.all([
                        database.ref(`users/${currentUserId}/events/${eventId}/guests`).get(),
                        database.ref(`users/${currentUserId}/events/${eventId}/hosts`).get()
                    ]).then(([gs, hs]) => {
                        const guestsArr = [];
                        const hostsArr = [];
                        if (gs.exists()) gs.forEach(x => guestsArr.push(x.val()));
                        if (hs.exists()) hs.forEach(x => hostsArr.push(x.val()));
                        payload.events.push({ id: eventId, meta, guests: guestsArr, hosts: hostsArr });
                    })
                );
            });
            await Promise.all(promises);
        }

        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Invitee_AllEvents_Backup_${getDateString()}.json`;
        a.click();
        URL.revokeObjectURL(url);

        showToast('All events backup downloaded!', 'success');
        closeModal('backupModal');
    } catch (e) {
        console.error(e);
        showToast('Backup failed (offline?)', 'error');
    }
}

async function restoreAllEventsBackup(eventsArr) {
    if (!Array.isArray(eventsArr) || !currentUserId) throw new Error('Invalid events backup');
    // Warning: This replaces ALL events
    await eventsRef.remove();

    // Recreate events and their data
    for (const ev of eventsArr) {
        const id = ev.id || eventsRef.push().key;
        await eventsRef.child(`${id}/meta`).set(ev.meta || { name: 'Restored Event' });
        const gRef = database.ref(`users/${currentUserId}/events/${id}/guests`);
        const hRef = database.ref(`users/${currentUserId}/events/${id}/hosts`);
        const guestsArr = Array.isArray(ev.guests) ? ev.guests : [];
        const hostsArr = Array.isArray(ev.hosts) ? ev.hosts : [];
        await gRef.remove(); await hRef.remove();
        for (const g of guestsArr) { const copy = { ...g }; delete copy.firebaseKey; await gRef.push(copy); }
        for (const h of hostsArr) { const copy = { ...h }; delete copy.firebaseKey; await hRef.push(copy); }
    }
}

// ==================== WHATSAPP TEMPLATES ====================

function loadWhatsappTemplates() {
    if (!templatesRef) return;

    templatesRef.on('value', (snap) => {
        whatsappTemplates = [];
        if (snap.exists()) {
            snap.forEach((child) => {
                whatsappTemplates.push({ ...child.val(), id: child.key });
            });
        }
        renderTemplateList();
        renderTemplateSelect();
    });
}

function renderTemplateList() {
    const container = document.getElementById('templateList');
    if (!container) return;

    if (whatsappTemplates.length === 0) {
        container.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 20px;">No templates yet. Add your first template below.</p>';
        return;
    }

    container.innerHTML = whatsappTemplates.map(template => {
        const hasImage = template.imageUrl ? `<span class="template-has-image" title="Has image attached">&#128247;</span>` : '';
        return `
            <div class="template-item">
                <div class="template-item-content">
                    <div class="template-item-name">${escapeHtml(template.name)} ${hasImage}</div>
                    <div class="template-item-preview">${escapeHtml(template.message)}</div>
                </div>
                <div class="template-item-actions">
                    <button class="btn btn-small btn-outline" onclick="useTemplate('${template.id}')" title="Use this template">Use</button>
                    <button class="btn btn-small btn-danger" onclick="deleteTemplate('${template.id}')" title="Delete">&#128465;</button>
                </div>
            </div>
        `;
    }).join('');
}

function renderTemplateSelect() {
    const select = document.getElementById('sendTemplateSelect');
    if (!select) return;

    select.innerHTML = '<option value="">Choose a template...</option>';
    whatsappTemplates.forEach(template => {
        select.innerHTML += `<option value="${template.id}">${escapeHtml(template.name)}</option>`;
    });

    // Add change listener for preview
    select.onchange = updateMessagePreview;
}

function updateMessagePreview() {
    const previewEl = document.getElementById('messagePreview');
    const templateId = document.getElementById('sendTemplateSelect').value;

    if (!templateId || !previewEl) {
        if (previewEl) previewEl.textContent = 'Select a template to see preview...';
        return;
    }

    const template = whatsappTemplates.find(t => t.id === templateId);
    if (!template) return;

    // Get first guest for preview
    const sampleGuest = guests[0] || {
        firstName: 'Guest',
        surname: 'Name',
        members: 2,
        relativeOf: 'Host'
    };

    const message = formatTemplateMessage(template.message, sampleGuest);
    previewEl.textContent = message;
}

function formatTemplateMessage(template, guest) {
    const eventName = currentEventMeta?.name || 'our event';
    const date = currentEventMeta?.date ? new Date(currentEventMeta.date).toLocaleDateString() : 'soon';
    const venue = currentEventMeta?.venue || 'our venue';

    return template
        .replace(/{name}/gi, `${guest.firstName || ''} ${guest.surname || ''}`.trim() || 'Guest')
        .replace(/{event}/gi, eventName)
        .replace(/{date}/gi, date)
        .replace(/{venue}/gi, venue)
        .replace(/{members}/gi, guest.members || 1)
        .replace(/{host}/gi, guest.relativeOf || '');
}

function openWhatsappTemplateModal() {
    renderTemplateList();
    renderTemplateSelect();
    openModal('whatsappTemplateModal');
}

function addWhatsappTemplate() {
    const name = document.getElementById('newTemplateName').value.trim();
    const message = document.getElementById('newTemplateMessage').value.trim();
    const imageInput = document.getElementById('newTemplateImage');
    const imageUrl = imageInput ? imageInput.value.trim() : '';

    if (!name || !message) {
        showToast('Please enter template name and message', 'error');
        return;
    }

    if (!templatesRef) {
        showToast('Please sign in first', 'error');
        return;
    }

    templatesRef.push({
        name,
        message,
        imageUrl: imageUrl || '',
        createdAt: new Date().toISOString()
    }).then(() => {
        showToast('Template added!', 'success');
        triggerHaptic();
        document.getElementById('newTemplateName').value = '';
        document.getElementById('newTemplateMessage').value = '';
        if (imageInput) imageInput.value = '';
    }).catch((error) => {
        showToast('Failed to add template', 'error');
    });
}

function deleteTemplate(templateId) {
    if (!confirm('Delete this template?')) return;

    templatesRef.child(templateId).remove()
        .then(() => showToast('Template deleted', 'success'))
        .catch(() => showToast('Failed to delete', 'error'));
}

function useTemplate(templateId) {
    const template = whatsappTemplates.find(t => t.id === templateId);
    if (!template) return;

    // Set as event's default template
    if (currentEventId && eventsRef) {
        eventsRef.child(`${currentEventId}/meta`).update({
            whatsappTemplate: template.message
        }).then(() => {
            showToast('Template set as default for this event!', 'success');
        });
    }
}

function openBulkWhatsApp() {
    const templateId = document.getElementById('sendTemplateSelect').value;
    const filterValue = document.getElementById('sendToFilter').value;

    if (!templateId) {
        showToast('Please select a template', 'error');
        return;
    }

    const template = whatsappTemplates.find(t => t.id === templateId);
    if (!template) return;

    // Filter guests based on selection
    let targetGuests = [...guests];
    if (filterValue === 'pending') {
        targetGuests = guests.filter(g => g.rsvpStatus === 'Pending');
    } else if (filterValue === 'confirmed') {
        targetGuests = guests.filter(g => g.rsvpStatus === 'Confirmed');
    } else if (filterValue === 'declined') {
        targetGuests = guests.filter(g => g.rsvpStatus === 'Declined');
    }

    if (targetGuests.length === 0) {
        showToast('No guests match the selected filter', 'error');
        return;
    }

    // Confirm before opening multiple tabs
    if (!confirm(`This will open WhatsApp for ${targetGuests.length} guest(s). Continue?`)) {
        return;
    }

    // Open WhatsApp for each guest with a small delay
    targetGuests.forEach((guest, index) => {
        setTimeout(() => {
            const message = formatTemplateMessage(template.message, guest);
            const phone = normalizePhone(guest.whatsapp);
            const encoded = encodeURIComponent(message);
            window.open(`https://wa.me/${phone}?text=${encoded}`, '_blank');
        }, index * 500); // 500ms delay between each
    });

    showToast(`Opening WhatsApp for ${targetGuests.length} guests...`, 'success');
    closeModal('whatsappTemplateModal');
}

// ==================== IMPORT GUESTS ====================

function openImportGuestsModal() {
    if (!currentEventId) {
        showToast('Please select an event first', 'error');
        return;
    }

    loadImportSourceEvents();
    document.getElementById('importPreview').style.display = 'none';
    document.getElementById('importGuestsBtn').disabled = true;
    openModal('importGuestsModal');
}

async function loadImportSourceEvents() {
    const select = document.getElementById('importSourceEvent');
    if (!select || !eventsRef) return;

    select.innerHTML = '<option value="">Select an event...</option>';

    try {
        const snap = await eventsRef.get();
        if (snap.exists()) {
            snap.forEach((child) => {
                // Don't show current event as source
                if (child.key !== currentEventId) {
                    const meta = child.child('meta').val() || {};
                    const dateStr = meta.date ? ` (${new Date(meta.date).toLocaleDateString()})` : '';
                    select.innerHTML += `<option value="${child.key}">${escapeHtml(meta.name || 'Untitled')}${dateStr}</option>`;
                }
            });
        }
    } catch (e) {
        console.error('Error loading events:', e);
    }

    // Add change listener
    select.onchange = onImportSourceChange;
}

async function onImportSourceChange() {
    const eventId = document.getElementById('importSourceEvent').value;
    const previewDiv = document.getElementById('importPreview');
    const importBtn = document.getElementById('importGuestsBtn');

    if (!eventId) {
        previewDiv.style.display = 'none';
        importBtn.disabled = true;
        return;
    }

    try {
        // Get guests and hosts count from source event
        const guestsSnap = await database.ref(`users/${currentUserId}/events/${eventId}/guests`).get();
        const hostsSnap = await database.ref(`users/${currentUserId}/events/${eventId}/hosts`).get();

        let familyCount = 0;
        let guestCount = 0;
        let hostCount = 0;

        if (guestsSnap.exists()) {
            guestsSnap.forEach((child) => {
                familyCount++;
                guestCount += parseInt(child.val().members) || 1;
            });
        }

        if (hostsSnap.exists()) {
            hostsSnap.forEach(() => hostCount++);
        }

        document.getElementById('importFamilyCount').textContent = familyCount;
        document.getElementById('importGuestCount').textContent = guestCount;
        document.getElementById('importHostCount').textContent = hostCount;

        previewDiv.style.display = 'block';
        importBtn.disabled = familyCount === 0;
    } catch (e) {
        console.error('Error loading source event:', e);
        showToast('Failed to load event data', 'error');
    }
}

async function importGuestsFromEvent() {
    const sourceEventId = document.getElementById('importSourceEvent').value;
    const importHosts = document.getElementById('importHostsToo').checked;
    const resetRsvp = document.getElementById('resetRsvpStatus').checked;

    if (!sourceEventId || !currentEventId || !currentUserId) {
        showToast('Please select a source event', 'error');
        return;
    }

    try {
        // Get source data
        const guestsSnap = await database.ref(`users/${currentUserId}/events/${sourceEventId}/guests`).get();
        const hostsSnap = await database.ref(`users/${currentUserId}/events/${sourceEventId}/hosts`).get();

        const importedGuests = [];
        const importedHosts = [];

        if (guestsSnap.exists()) {
            guestsSnap.forEach((child) => {
                const guest = { ...child.val() };
                delete guest.firebaseKey;
                guest.id = generateId();
                guest.createdAt = new Date().toISOString();
                guest.updatedAt = new Date().toISOString();

                if (resetRsvp) {
                    guest.rsvpStatus = 'Pending';
                    guest.statusHistory = [{
                        from: null,
                        to: 'Pending',
                        at: new Date().toISOString()
                    }];
                }

                // Reset gift status for new event
                guest.giftGiven = false;
                guest.giftDescription = '';

                importedGuests.push(guest);
            });
        }

        if (importHosts && hostsSnap.exists()) {
            hostsSnap.forEach((child) => {
                const host = { ...child.val() };
                delete host.firebaseKey;

                // Check if host already exists in target event
                const existingHost = hosts.find(h => h.name.toLowerCase() === host.name.toLowerCase());
                if (!existingHost) {
                    importedHosts.push(host);
                }
            });
        }

        // Import hosts first
        for (const host of importedHosts) {
            await hostsRef.push(host);
        }

        // Import guests
        for (const guest of importedGuests) {
            await guestsRef.push(guest);
        }

        showToast(`Imported ${importedGuests.length} guests and ${importedHosts.length} hosts!`, 'success');
        closeModal('importGuestsModal');
    } catch (e) {
        console.error('Import error:', e);
        showToast('Failed to import guests', 'error');
    }
}

// ==================== CONTACT PICKER ====================

function setupContactPicker() {
    // Check if Contact Picker API is supported
    if ('contacts' in navigator && 'ContactsManager' in window) {
        const btn = document.getElementById('contactPickerBtn');
        if (btn) btn.style.display = 'flex';
    }
}

async function pickContact() {
    if (!('contacts' in navigator)) {
        showToast('Contact picker not supported on this device', 'error');
        return;
    }

    try {
        const props = ['tel'];
        const opts = { multiple: false };

        const contacts = await navigator.contacts.select(props, opts);

        if (contacts.length > 0 && contacts[0].tel && contacts[0].tel.length > 0) {
            let phone = contacts[0].tel[0];

            // Clean the phone number - remove spaces, dashes, country code
            phone = phone.replace(/[\s\-\(\)]/g, '');

            // Remove country code if present
            if (phone.startsWith('+91')) {
                phone = phone.substring(3);
            } else if (phone.startsWith('91') && phone.length > 10) {
                phone = phone.substring(2);
            } else if (phone.startsWith('+')) {
                phone = phone.substring(1);
                if (phone.length > 10) {
                    phone = phone.substring(phone.length - 10);
                }
            }

            // Take last 10 digits
            if (phone.length > 10) {
                phone = phone.substring(phone.length - 10);
            }

            document.getElementById('whatsapp').value = phone;
            triggerHaptic();
            showToast('Contact selected!', 'success');
        }
    } catch (e) {
        if (e.name !== 'InvalidStateError') {
            console.error('Contact picker error:', e);
            showToast('Could not access contacts', 'error');
        }
    }
}

// ==================== TOGGLE CALL DONE ====================

function toggleCallDone(guestId) {
    const guest = guests.find(g => g.id === guestId);
    if (!guest) return;

    guest.callDone = !guest.callDone;
    guest.updatedAt = new Date().toISOString();

    triggerHaptic();

    if (guest.firebaseKey) {
        guestsRef.child(guest.firebaseKey).update({
            callDone: guest.callDone,
            updatedAt: guest.updatedAt
        }).then(() => {
            showToast(guest.callDone ? 'Marked as called!' : 'Call status cleared', 'success');
        }).catch((error) => {
            console.error('Failed to update call status:', error);
            saveGuests();
            renderGuestTable();
            updateDashboard();
        });
    } else {
        saveGuests();
        renderGuestTable();
        updateDashboard();
        showToast(guest.callDone ? 'Marked as called!' : 'Call status cleared', 'success');
    }
}

// ==================== HAPTIC FEEDBACK ====================

function triggerHaptic(type = 'light') {
    // Check for Vibration API (mobile browsers)
    if ('vibrate' in navigator) {
        switch (type) {
            case 'heavy':
                navigator.vibrate([30, 20, 30]);
                break;
            case 'medium':
                navigator.vibrate(20);
                break;
            case 'light':
            default:
                navigator.vibrate(10);
                break;
        }
    }

    // For iOS Safari - Haptic Feedback via AudioContext (workaround)
    if (window.webkit && window.webkit.messageHandlers) {
        try {
            // This is a placeholder for potential WKWebView haptic feedback
        } catch (e) {}
    }
}

// ==================== MOBILE ENHANCEMENTS ====================

// Add touch feedback to buttons on mobile
document.addEventListener('DOMContentLoaded', function() {
    // Enable active states on touch devices
    document.addEventListener('touchstart', function() {}, { passive: true });

    // Add ripple effect class on button clicks
    document.body.addEventListener('click', function(e) {
        const btn = e.target.closest('.btn, .action-btn, .quick-action-item, .nav-item');
        if (btn) {
            triggerHaptic('light');
        }
    });

    // Pull to refresh prevention on mobile (except for scrollable areas)
    document.body.style.overscrollBehavior = 'none';

    // Register Service Worker
    registerServiceWorker();

    // Setup offline indicator
    setupOfflineIndicator();

    // Setup swipe gestures for mobile
    setupSwipeGestures();

    // Check for install prompt
    setupInstallPrompt();
});

// ==================== SERVICE WORKER ====================

let swRegistration = null;

async function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        try {
            swRegistration = await navigator.serviceWorker.register('./sw.js');
            console.log('[App] Service Worker registered:', swRegistration.scope);

            // Listen for updates
            swRegistration.addEventListener('updatefound', () => {
                const newWorker = swRegistration.installing;
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        // New version available
                        showUpdateAvailable();
                    }
                });
            });

            // Listen for messages from SW
            navigator.serviceWorker.addEventListener('message', (event) => {
                if (event.data.type === 'SYNC_REQUESTED') {
                    // Re-sync data when back online
                    if (currentEventId) {
                        selectEvent(currentEventId);
                    }
                }
                if (event.data.type === 'UPDATE_AVAILABLE') {
                    showUpdateAvailable();
                }
            });
        } catch (error) {
            console.log('[App] Service Worker registration failed:', error);
        }
    }
}

function showUpdateAvailable() {
    const shouldUpdate = confirm('A new version of InviteePro is available. Update now?');
    if (shouldUpdate && swRegistration && swRegistration.waiting) {
        swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
        window.location.reload();
    }
}

// ==================== OFFLINE INDICATOR ====================

function setupOfflineIndicator() {
    updateOnlineStatus();

    window.addEventListener('online', () => {
        isOnline = true;
        updateOnlineStatus();
        showToast('You\'re back online!', 'success');
    });

    window.addEventListener('offline', () => {
        isOnline = false;
        updateOnlineStatus();
    });
}

function updateOnlineStatus() {
    const indicator = document.getElementById('offlineIndicator');
    if (indicator) {
        if (navigator.onLine) {
            indicator.classList.remove('show');
            document.body.classList.remove('offline');
        } else {
            indicator.classList.add('show');
            document.body.classList.add('offline');
        }
    }
}

// ==================== BOTTOM SHEET ====================

function openBottomSheet(sheetId) {
    const sheet = document.getElementById(sheetId);
    if (sheet) {
        sheet.classList.add('show');
        document.body.style.overflow = 'hidden';
        triggerHaptic('light');
    }
}

function closeBottomSheet(sheetId) {
    const sheet = document.getElementById(sheetId);
    if (sheet) {
        sheet.classList.remove('show');
        document.body.style.overflow = '';
    }
}

function openSettingsSheet() {
    // Update current event name in settings
    const currentEventNameEl = document.getElementById('currentEventName');
    if (currentEventNameEl) {
        currentEventNameEl.textContent = currentEventMeta?.name || 'No event selected';
    }
    openBottomSheet('settingsSheet');
}

// ==================== EVENT SELECTOR SHEET ====================

function openEventSelectorSheet() {
    renderEventListSheet();
    openBottomSheet('eventSelectorSheet');
}

function renderEventListSheet() {
    const container = document.getElementById('eventListSheet');
    const emptyState = document.getElementById('eventListEmpty');
    if (!container) return;

    if (!eventsRef) {
        container.innerHTML = '';
        if (emptyState) emptyState.style.display = 'block';
        return;
    }

    eventsRef.once('value').then((snap) => {
        const ownEvents = [];
        if (snap.exists()) {
            snap.forEach((child) => {
                ownEvents.push({
                    id: child.key,
                    meta: child.child('meta').val() || {}
                });
            });
        }

        const sharedKeys = Object.keys(sharedEventOwners);
        const hasEvents = ownEvents.length > 0 || sharedKeys.length > 0;

        if (!hasEvents) {
            container.innerHTML = '';
            if (emptyState) emptyState.style.display = 'block';
            return;
        }

        if (emptyState) emptyState.style.display = 'none';

        let html = '';

        // Own events
        if (ownEvents.length > 0) {
            if (sharedKeys.length > 0) {
                html += '<div style="padding:10px 20px;font-size:0.8rem;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px;">My Events</div>';
            }
            html += ownEvents.map(event => {
                const meta = event.meta;
                const isActive = event.id === currentEventId && !currentEventMeta?.isShared;
                const dateStr = meta.date ? new Date(meta.date).toLocaleDateString() : '';
                const venueStr = meta.venue || '';
                const metaStr = [dateStr, venueStr].filter(Boolean).join(' \u2022 ') || 'No date set';
                const stats = meta.stats || {};

                return `
                    <div class="event-list-item ${isActive ? 'active' : ''}" onclick="selectEventFromSheet('${event.id}')">
                        <div class="event-list-icon">&#127881;</div>
                        <div class="event-list-info">
                            <div class="event-list-name">${escapeHtml(meta.name || 'Untitled Event')}</div>
                            <div class="event-list-meta">${escapeHtml(metaStr)}</div>
                            <div class="event-list-stats">
                                <span class="event-list-stat">&#128101; ${stats.totalFamilies || 0} families</span>
                                <span class="event-list-stat">&#9989; ${stats.confirmed || 0} confirmed</span>
                            </div>
                        </div>
                        <span class="event-list-check">&#10003;</span>
                    </div>
                `;
            }).join('');
        }

        // Shared events
        if (sharedKeys.length > 0) {
            html += '<div style="padding:10px 20px;font-size:0.8rem;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px;">&#129309; Shared With Me</div>';
            html += sharedKeys.map(key => {
                const ev = sharedEventOwners[key];
                const isActive = currentEventId === ev.eventId && currentEventMeta?.ownerUid === ev.ownerUid;

                return `
                    <div class="event-list-item ${isActive ? 'active' : ''}" onclick="selectSharedEventFromSheet('${escapeHtml(ev.ownerUid)}', '${escapeHtml(ev.eventId)}')">
                        <div class="event-list-icon" style="background:linear-gradient(135deg,#10b981,#059669);">&#129309;</div>
                        <div class="event-list-info">
                            <div class="event-list-name">${escapeHtml(ev.eventName)}</div>
                            <div class="event-list-meta">Shared by ${escapeHtml(ev.ownerName)}</div>
                        </div>
                        <span class="event-list-check">&#10003;</span>
                    </div>
                `;
            }).join('');
        }

        container.innerHTML = html;
    });
}

function selectEventFromSheet(eventId) {
    if (!eventId) return;

    const eventSelect = document.getElementById('eventSelect');
    if (eventSelect) eventSelect.value = eventId;

    selectEvent(eventId);
    closeBottomSheet('eventSelectorSheet');

    // Haptic feedback
    triggerHaptic('medium');

    showToast('Event switched!', 'success');
}

function selectSharedEventFromSheet(ownerUid, eventId) {
    closeBottomSheet('eventSelectorSheet');
    selectSharedEvent(ownerUid, eventId);
}

// ==================== TAB NAVIGATION ====================

function switchTab(tabName) {
    // Update bottom nav active state
    document.querySelectorAll('.bottom-nav-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.tab === tabName) {
            item.classList.add('active');
        }
    });

    // Handle tab switching
    switch (tabName) {
        case 'home':
            // Scroll to top / dashboard
            window.scrollTo({ top: 0, behavior: 'smooth' });
            triggerHaptic('light');
            break;
        case 'guests':
            // Scroll to guest table
            const guestTable = document.getElementById('guestTable');
            if (guestTable) {
                guestTable.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
            triggerHaptic('light');
            break;
        case 'whatsapp':
            openWhatsappTemplateModal();
            break;
        case 'settings':
            openSettingsSheet();
            break;
    }
}

// ==================== SWIPE GESTURES ====================

let touchStartX = 0;
let touchStartY = 0;
let currentSwipeRow = null;
const SWIPE_THRESHOLD = 80;

function setupSwipeGestures() {
    // Only enable on mobile
    if (window.innerWidth > 768) return;

    const tableBody = document.getElementById('guestTableBody');
    if (!tableBody) return;

    tableBody.addEventListener('touchstart', handleTouchStart, { passive: true });
    tableBody.addEventListener('touchmove', handleTouchMove, { passive: false });
    tableBody.addEventListener('touchend', handleTouchEnd, { passive: true });
}

function handleTouchStart(e) {
    const row = e.target.closest('tr');
    if (!row) return;

    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    currentSwipeRow = row;
    row.classList.add('swiping');
}

function handleTouchMove(e) {
    if (!currentSwipeRow) return;

    const touchX = e.touches[0].clientX;
    const touchY = e.touches[0].clientY;
    const diffX = touchX - touchStartX;
    const diffY = touchY - touchStartY;

    // Only handle horizontal swipes
    if (Math.abs(diffX) < Math.abs(diffY)) {
        return;
    }

    // Prevent scroll during swipe
    e.preventDefault();

    // Limit the swipe distance
    const maxSwipe = 100;
    const clampedDiff = Math.max(-maxSwipe, Math.min(maxSwipe, diffX));

    currentSwipeRow.style.transform = `translateX(${clampedDiff}px)`;

    // Show swipe hints
    currentSwipeRow.classList.remove('swipe-left', 'swipe-right');
    if (diffX > SWIPE_THRESHOLD) {
        currentSwipeRow.classList.add('swipe-right');
    } else if (diffX < -SWIPE_THRESHOLD) {
        currentSwipeRow.classList.add('swipe-left');
    }
}

function handleTouchEnd(e) {
    if (!currentSwipeRow) return;

    const finalX = e.changedTouches[0].clientX;
    const diffX = finalX - touchStartX;

    // Reset transform
    currentSwipeRow.style.transform = '';
    currentSwipeRow.classList.remove('swiping', 'swipe-left', 'swipe-right');

    // Get guest ID from row
    const editBtn = currentSwipeRow.querySelector('.action-btn.edit');
    if (!editBtn) {
        currentSwipeRow = null;
        return;
    }

    const onclickAttr = editBtn.getAttribute('onclick');
    const match = onclickAttr.match(/openEditModal\('([^']+)'\)/);
    if (!match) {
        currentSwipeRow = null;
        return;
    }

    const guestId = match[1];
    const guest = guests.find(g => g.id === guestId);

    if (guest) {
        // Swipe right = Confirm
        if (diffX > SWIPE_THRESHOLD) {
            if (guest.rsvpStatus !== 'Confirmed') {
                updateGuestRsvpStatus(guestId, 'Confirmed');
                triggerHaptic('medium');
                showToast('Marked as Confirmed!', 'success');
            }
        }
        // Swipe left = Decline
        else if (diffX < -SWIPE_THRESHOLD) {
            if (guest.rsvpStatus !== 'Declined') {
                updateGuestRsvpStatus(guestId, 'Declined');
                triggerHaptic('medium');
                showToast('Marked as Declined', 'success');
            }
        }
    }

    currentSwipeRow = null;
}

function updateGuestRsvpStatus(guestId, newStatus) {
    const guest = guests.find(g => g.id === guestId);
    if (!guest) return;

    const oldStatus = guest.rsvpStatus;
    guest.rsvpStatus = newStatus;
    guest.updatedAt = new Date().toISOString();

    // Add to status history
    if (!Array.isArray(guest.statusHistory)) {
        guest.statusHistory = [];
    }
    guest.statusHistory.push({
        from: oldStatus,
        to: newStatus,
        at: new Date().toISOString()
    });

    if (guest.firebaseKey) {
        guestsRef.child(guest.firebaseKey).update({
            rsvpStatus: newStatus,
            statusHistory: guest.statusHistory,
            updatedAt: guest.updatedAt
        }).catch((error) => {
            console.error('Failed to update RSVP:', error);
            saveGuests();
            renderGuestTable();
            updateDashboard();
        });
    } else {
        saveGuests();
        renderGuestTable();
        updateDashboard();
    }
}

// ==================== INSTALL PROMPT ====================

let deferredPrompt = null;

function setupInstallPrompt() {
    window.addEventListener('beforeinstallprompt', (e) => {
        // Prevent the mini-infobar from appearing on mobile
        e.preventDefault();
        // Stash the event so it can be triggered later
        deferredPrompt = e;

        // Show install prompt after a delay
        setTimeout(() => {
            showInstallPrompt();
        }, 30000); // Show after 30 seconds
    });

    window.addEventListener('appinstalled', () => {
        deferredPrompt = null;
        hideInstallPrompt();
        showToast('InviteePro installed successfully!', 'success');
    });
}

function showInstallPrompt() {
    // Only show if we have a deferred prompt and on mobile
    if (!deferredPrompt || window.innerWidth > 768) return;

    const prompt = document.getElementById('installPrompt');
    if (prompt) {
        prompt.classList.add('show');
    }
}

function hideInstallPrompt() {
    const prompt = document.getElementById('installPrompt');
    if (prompt) {
        prompt.classList.remove('show');
    }
}

async function installApp() {
    if (!deferredPrompt) return;

    // Show the install prompt
    deferredPrompt.prompt();

    // Wait for the user to respond to the prompt
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === 'accepted') {
        console.log('[App] User accepted the install prompt');
    } else {
        console.log('[App] User dismissed the install prompt');
    }

    deferredPrompt = null;
    hideInstallPrompt();
}

function dismissInstallPrompt() {
    hideInstallPrompt();
    // Don't show again for this session
    deferredPrompt = null;
}

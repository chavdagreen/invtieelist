// Invitee List Application - Main JavaScript with Firebase Cloud Sync

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
firebase.initializeApp(firebaseConfig);
const database = firebase.database();
let guestsRef = null;
let hostsRef = null;
let eventsRef = null;
// Data Storage Keys (for local backup)
const STORAGE_KEY_BASE = 'inviteeProGuests';
const HOSTS_STORAGE_KEY_BASE = 'inviteeProHosts';
const EVENT_STORAGE_KEY_BASE = 'inviteeProSelectedEvent';

// Global Variables
let guests = [];
let hosts = [];
let deleteTargetId = null;
let isOnline = navigator.onLine;

let currentEventId = null;
let currentEventName = null;

// Initialize Application
document.addEventListener('DOMContentLoaded', function() {
    setupEventListeners();
    setupOnlineStatusListeners();
    showSyncStatus();
    initEvents();
});
// ==================== AUTH + EVENTS ====================

function getGuestsStorageKey() {
    const uid = "public";
    const eid = currentEventId || 'noevent';
    return `${STORAGE_KEY_BASE}_${eid}`;
}

function getHostsStorageKey() {
    const uid = "public";
    const eid = currentEventId || 'noevent';
    return `${HOSTS_STORAGE_KEY_BASE}_${eid}`;
}

function getSelectedEventKey() {
    const uid = "public";
    return `${EVENT_STORAGE_KEY_BASE}`;
}







// ==================== EVENTS (NO LOGIN) ====================

function initEvents() {
    eventsRef = database.ref('events');
    loadEventsAndRestoreSelection();
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
        const stats = (meta.stats || {});
        const sub = [meta.date || '', meta.venue || ''].filter(Boolean).join(' • ') || 'Tap to open';

        const card = document.createElement('div');
        card.className = 'event-card';
        card.onclick = () => {
            const eventSelect = document.getElementById('eventSelect');
            if (eventSelect) eventSelect.value = ev.id;
            selectEvent(ev.id);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        };

        card.innerHTML = `
            <div class="event-card-title">${escapeHtml(meta.name || 'Untitled Event')}</div>
            <div class="event-card-sub">${escapeHtml(sub)}</div>
            <div class="event-card-stats">
                <span class="event-pill">👥 Families: ${stats.totalFamilies || 0}</span>
                <span class="event-pill">🎉 Guests: ${stats.totalGuests || 0}</span>
                <span class="event-pill">✅ Confirmed: ${stats.confirmed || 0}</span>
            </div>
        `;
        container.appendChild(card);
    });
}

async function loadEventsAndRestoreSelection() {
        eventsRef = database.ref(`events`);

    // Populate dropdown
    const snapshot = await eventsRef.get().catch((e) => {
        console.error('Events load error:', e);
        showToast('Unable to load events', 'error');
        return null;
    });

    const eventSelect = document.getElementById('eventSelect');
    if (!eventSelect) return;

    eventSelect.innerHTML = '<option value="">Select Event</option>';

    if (snapshot && snapshot.exists()) {
        snapshot.forEach(child => {
            const meta = child.child('meta').val() || {};
            const name = meta.name || 'Untitled Event';
            eventSelect.innerHTML += `<option value="${child.key}">${name}</option>`;
        });
    }

    // Restore last selected event (per user)
    const savedEventId = localStorage.getItem(getSelectedEventKey());
    if (savedEventId) {
        eventSelect.value = savedEventId;
    }

    // If still empty but there are events, select the first event
    if (!eventSelect.value && snapshot && snapshot.exists()) {
        let firstKey = null;
        snapshot.forEach(child => {
            if (!firstKey) firstKey = child.key;
        });
        if (firstKey) eventSelect.value = firstKey;
    }

    // Trigger selection handling
    if (eventSelect.value) {
        await selectEvent(eventSelect.value);
    } else {
        updateEventUI(null, null);
        guests = [];
        hosts = [];
        renderGuestTable();
        updateDashboard();
        renderHostDropdowns();
        renderHostList();
        const addGuestBtn = document.getElementById('addGuestBtn');
        if (addGuestBtn) addGuestBtn.style.display = 'none';
    }

    // Build list for dashboard cards
    const eventsList = [];
    if (snapshot && snapshot.exists()) {
        snapshot.forEach(child => {
            eventsList.push({ id: child.key, meta: child.child('meta').val() || {} });
        });
    }
    renderEventDashboard(eventsList);

}

function updateEventUI(eventId, eventName) {
    const eventTitle = document.getElementById('eventTitle');
    const eventSubtitle = document.getElementById('eventSubtitle');
    if (eventTitle) eventTitle.textContent = eventName ? eventName : 'InviteePro';
    if (eventSubtitle) eventSubtitle.textContent = eventName ? 'Manage your invitees for this event.' : 'Create or select an event to start.';
}

function openEventModal() {
    openModal('eventModal');
    const input = document.getElementById('newEventName');
    if (input) {
        input.value = '';
        setTimeout(() => input.focus(), 50);
    }
}

async 
async function createEvent() {
    const nameEl = document.getElementById('newEventName');
    const dateEl = document.getElementById('newEventDate');
    const venueEl = document.getElementById('newEventVenue');
    const tplEl = document.getElementById('newEventWhatsappTemplate');

    const name = (nameEl ? nameEl.value : '').trim();
    const date = (dateEl ? dateEl.value : '').trim();
    const venue = (venueEl ? venueEl.value : '').trim();
    const whatsappTemplate = (tplEl ? tplEl.value : '').trim();

    if (!name) {
        showToast('Please enter an event name', 'error');
        return;
    }

    const newRef = eventsRef.push();
    const now = new Date().toISOString();

    await newRef.child('meta').set({
        name,
        date: date || null,
        venue: venue || null,
        whatsappTemplate: whatsappTemplate || null,
        createdAt: now,
        updatedAt: now,
        stats: { totalFamilies: 0, totalGuests: 0, confirmed: 0, pending: 0, declined: 0 }
    });

    if (nameEl) nameEl.value = '';
    if (dateEl) dateEl.value = '';
    if (venueEl) venueEl.value = '';
    if (tplEl) tplEl.value = '';

    closeModal('eventModal');
    showToast('Event created', 'success');
    await loadEventsAndRestoreSelection();

    const eventSelect = document.getElementById('eventSelect');
    if (eventSelect) eventSelect.value = newRef.key;
    await selectEvent(newRef.key);
}


async function selectEvent(eventId) {
    if (!currentUser || !eventId) return;

    currentEventId = eventId;

    const metaSnap = await database.ref(`users/${currentUser.uid}/events/${eventId}/meta`).get();
    const meta = metaSnap.exists() ? metaSnap.val() : {};
    currentEventName = meta.name || 'Event';

    localStorage.setItem(getSelectedEventKey(), eventId);
    updateEventUI(eventId, currentEventName);

    // Setup scoped refs
    guestsRef = database.ref(`events/${eventId}/guests`);
    hostsRef = database.ref(`events/${eventId}/hosts`);

    detachEventListeners();
    setupFirebaseListeners();

    const addGuestBtn = document.getElementById('addGuestBtn');
    if (addGuestBtn) addGuestBtn.style.display = 'inline-flex';
}



// Setup Firebase Real-time Listeners
function setupFirebaseListeners() {
    if (!guestsRef || !hostsRef) return;

    // Listen for guests data changes
    guestsRef.on('value', (snapshot) => {
        const data = snapshot.val();
        if (data) {
            guests = Object.keys(data).map(key => ({
                ...data[key],
                firebaseKey: key
            }));
        } else {
            guests = [];
        }
        localStorage.setItem(getGuestsStorageKey(), JSON.stringify(guests));
        renderGuestTable();
        updateDashboard();
    }, (error) => {
        console.error('Firebase guests read error:', error);
        loadGuestsFromLocalStorage();
    });

    // Listen for hosts data changes
    hostsRef.on('value', (snapshot) => {
        const data = snapshot.val();
        if (data) {
            hosts = Object.keys(data).map(key => ({
                ...data[key],
                firebaseKey: key
            }));
        } else {
            hosts = [];
        }
        localStorage.setItem(getHostsStorageKey(), JSON.stringify(hosts));
        renderHostDropdowns();
        renderHostList();
    }, (error) => {
        console.error('Firebase hosts read error:', error);
        loadHostsFromLocalStorage();
    });
}

// Load from localStorage (fallback)
function loadGuestsFromLocalStorage() {
    const stored = localStorage.getItem(getGuestsStorageKey());
    guests = stored ? JSON.parse(stored) : [];
    renderGuestTable();
    updateDashboard();
}

function loadHostsFromLocalStorage() {
    const stored = localStorage.getItem(getHostsStorageKey());
    hosts = stored ? JSON.parse(stored) : [];
    renderHostDropdowns();
    renderHostList();
}

// Setup Online/Offline Status
function setupOnlineStatusListeners() {
    window.addEventListener('online', () => {
        isOnline = true;
        showSyncStatus();
        showToast('Back online - syncing data...', 'success');
    });

    window.addEventListener('offline', () => {
        isOnline = false;
        showSyncStatus();
        showToast('You are offline - changes saved locally', 'error');
    });
}

// Show sync status in UI
function showSyncStatus() {
    const logo = document.querySelector('.sidebar-logo');
    if (logo) {
        logo.innerHTML = isOnline ?
            'InviteePro <span style="font-size:0.6em;opacity:0.7;">&#9679; Synced</span>' :
            'InviteePro <span style="font-size:0.6em;color:#ef4444;">&#9679; Offline</span>';
    }
}

// Setup Event Listeners
function setupEventListeners() {
    document.getElementById('searchInput').addEventListener('input', filterAndRenderTable);
    document.getElementById('filterRsvp').addEventListener('change', filterAndRenderTable);
    document.getElementById('filterFood').addEventListener('change', filterAndRenderTable);
    document.getElementById('filterHost').addEventListener('change', filterAndRenderTable);


    const eventSelect = document.getElementById('eventSelect');
    if (eventSelect) {
        eventSelect.addEventListener('change', async (e) => {
            const eventId = e.target.value;

            if (!eventId) {
                currentEventId = null;
                currentEventName = null;
                detachEventListeners();
                updateEventUI(null, null);
                guests = [];
                hosts = [];
                renderGuestTable();
                updateDashboard();
                renderHostDropdowns();
                renderHostList();

                const addGuestBtn = document.getElementById('addGuestBtn');
                if (addGuestBtn) addGuestBtn.style.display = 'none';
                return;
            }

            await selectEvent(eventId);
        });
    }


    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', function(e) {
            if (e.target === this) {
                closeModal(this.id);
            }
        });
    });

    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal.show').forEach(modal => {
                closeModal(modal.id);
            });
        }
    });
}

// ==================== HOST MANAGEMENT ====================

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
        return `
            <div class="host-item">
                <div>
                    <span class="host-item-name">${host.name}</span>
                    <span class="host-item-count">(${guestCount} guests)</span>
                </div>
                <div class="host-item-actions">
                    <button class="btn btn-small btn-danger" onclick="deleteHost('${host.firebaseKey}', '${host.name}')">Delete</button>
                </div>
            </div>
        `;
    }).join('');
}

function openHostModal() {
    renderHostList();
    openModal('hostModal');
}

function addHost() {
    const nameInput = document.getElementById('newHostName');
    const name = nameInput.value.trim();

    if (!name) {
        showToast('Please enter a host name', 'error');
        return;
    }

    // Check for duplicate
    if (hosts.some(h => h.name.toLowerCase() === name.toLowerCase())) {
        showToast('This host already exists', 'error');
        return;
    }

    const hostData = {
        name: name,
        createdAt: new Date().toISOString()
    };

    hostsRef.push(hostData)
        .then(() => {
            showToast('Host added successfully!', 'success');
            nameInput.value = '';
        })
        .catch((error) => {
            console.error('Firebase host add error:', error);
            // Fallback: save locally
            hosts.push({ ...hostData, id: generateId() });
            localStorage.setItem(getHostsStorageKey(), JSON.stringify(hosts));
            renderHostDropdowns();
            renderHostList();
            showToast('Host added locally', 'success');
            nameInput.value = '';
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
    const nameInput = document.getElementById('inlineHostName');
    const name = nameInput.value.trim();

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
        createdAt: new Date().toISOString()
    };

    hostsRef.push(hostData)
        .then(() => {
            showToast('Host added successfully!', 'success');
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
    document.getElementById('modalTitle').textContent = 'Add New Guest';
    document.getElementById('guestForm').reset();
    document.getElementById('guestId').value = '';
    document.getElementById('giftDescGroup').style.display = 'none';
    document.getElementById('foodPref').value = 'Regular'; // Default
    renderHostDropdowns();
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
    document.getElementById('foodPref').value = guest.foodPref || 'Regular';
    document.getElementById('rsvpStatus').value = guest.rsvpStatus;
    document.getElementById('giftGiven').checked = guest.giftGiven;
    document.getElementById('giftDescription').value = guest.giftDescription || '';
    document.getElementById('notes').value = guest.notes || '';

    toggleGiftDescription();
    renderHostDropdowns();
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

function saveGuest(event) {
    event.preventDefault();

    const id = document.getElementById('guestId').value;
    const existingGuest = id ? guests.find(g => g.id === id) : null;

    const guestData = {
        id: id || generateId(),
        firstName: document.getElementById('firstName').value.trim(),
        surname: document.getElementById('surname').value.trim(),
        relativeOf: document.getElementById('relativeOf').value,
        members: parseInt(document.getElementById('members').value) || 1,
        whatsapp: document.getElementById('whatsapp').value.trim(),
        foodPref: document.getElementById('foodPref').value || 'Regular',
        rsvpStatus: document.getElementById('rsvpStatus').value,
        giftGiven: document.getElementById('giftGiven').checked,
        giftDescription: document.getElementById('giftDescription').value.trim(),
        notes: document.getElementById('notes').value.trim(),
        createdAt: existingGuest?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

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
            <td><strong>${guest.firstName} ${guest.surname}</strong></td>
            <td><span class="relative-badge">${guest.relativeOf || '-'}</span></td>
            <td>${guest.members}</td>
            <td>
                <a href="https://wa.me/91${guest.whatsapp}" target="_blank" class="whatsapp-link">
                    +91 ${formatPhone(guest.whatsapp)}
                </a>
            </td>
            <td><span class="badge badge-${(guest.foodPref || 'Regular').toLowerCase()}">${guest.foodPref || 'Regular'}</span></td>
            <td><span class="badge badge-${guest.rsvpStatus.toLowerCase()}">${guest.rsvpStatus}</span></td>
            <td>
                ${guest.giftGiven ? `
                    <div class="gift-info">
                        <span>Yes</span>
                        ${guest.giftDescription ? `<span class="gift-desc">${guest.giftDescription}</span>` : ''}
                    </div>
                ` : 'No'}
            </td>
            <td>
                <div class="action-cell">
                    <button class="action-btn call" onclick="openWhatsApp('${guest.whatsapp}')" title="WhatsApp">&#128222;</button>
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
        const matchesFood = !foodFilter || guest.foodPref === foodFilter;
        const matchesHost = !hostFilter || guest.relativeOf === hostFilter;

        return matchesSearch && matchesRsvp && matchesFood && matchesHost;
    });
}

function filterAndRenderTable() {
    renderGuestTable();
}

// ==================== DASHBOARD ====================

function updateDashboard() {
    const stats = {
        totalFamilies: guests.length,
        totalGuests: guests.reduce((sum, g) => sum + g.members, 0),
        confirmed: guests.filter(g => g.rsvpStatus === 'Confirmed').length,
        pending: guests.filter(g => g.rsvpStatus === 'Pending').length,
        declined: guests.filter(g => g.rsvpStatus === 'Declined').length,
        regular: guests.filter(g => (g.foodPref || 'Regular') === 'Regular').reduce((sum, g) => sum + g.members, 0),
        swaminarayan: guests.filter(g => g.foodPref === 'Swaminarayan').reduce((sum, g) => sum + g.members, 0),
        gifts: guests.filter(g => g.giftGiven).length
    };

    document.getElementById('totalFamilies').textContent = stats.totalFamilies;
    document.getElementById('totalGuests').textContent = stats.totalGuests;
    document.getElementById('confirmedCount').textContent = stats.confirmed;
    document.getElementById('pendingCount').textContent = stats.pending;

    document.getElementById('regularCount').textContent = stats.regular;
    document.getElementById('swaminarayanCount').textContent = stats.swaminarayan;

    document.getElementById('statusConfirmed').textContent = stats.confirmed;
    document.getElementById('statusPending').textContent = stats.pending;
    document.getElementById('statusDeclined').textContent = stats.declined;

    document.getElementById('giftsCount').textContent = stats.gifts;
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
        if (columns.food) row['Food Preference'] = guest.foodPref || 'Regular';
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
        if (columns.food) row.push(guest.foodPref || 'Regular');
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
    reader.onload = function(e) {
        try {
            const backup = JSON.parse(e.target.result);

            // Support both old and new backup formats
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

async function updateEventMetaStats() {
    if (!currentEventId || !eventsRef) return;
    const stats = {
        totalFamilies: guests.length,
        totalGuests: guests.reduce((s,g)=> s + (parseInt(g.members)||0), 0),
        confirmed: guests.filter(g => g.rsvpStatus === 'Confirmed').length,
        pending: guests.filter(g => g.rsvpStatus === 'Pending').length,
        declined: guests.filter(g => g.rsvpStatus === 'Declined').length
    };
    try {
        await eventsRef.child(`${currentEventId}/meta`).update({ updatedAt: new Date().toISOString(), stats });
    } catch(e) {}
}

function normalizePhone(phone) {
    const digits = String(phone || '').replace(/\D/g, '');
    if (digits.length === 10) return '91' + digits;
    return digits;
}

function sendWhatsappInvite(phone, guestName) {
    if (!phone) return;
    const clean = normalizePhone(phone);
    const titleEl = document.getElementById('eventTitle');
    const date = titleEl ? (titleEl.dataset.eventDate || '') : '';
    const venue = titleEl ? (titleEl.dataset.eventVenue || '') : '';
    const template = titleEl ? (titleEl.dataset.eventWhatsappTemplate || '') : '';

    const defaultMsg = `Hi ${guestName || ''}! You are invited to ${currentEventName || 'our event'}${date ? ' on ' + date : ''}${venue ? ' at ' + venue : ''}. Please confirm your presence.`;
    const msg = (template || defaultMsg)
        .replaceAll('{name}', guestName || '')
        .replaceAll('{event}', currentEventName || 'our event')
        .replaceAll('{date}', date || '')
        .replaceAll('{venue}', venue || '');

    window.open(`https://wa.me/${clean}?text=${encodeURIComponent(msg)}`, '_blank');
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

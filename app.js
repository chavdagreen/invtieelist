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
let currentEventMeta = null;

// Initialize Application
document.addEventListener('DOMContentLoaded', function() {
    setupEventListeners();
    setupOnlineStatusListeners();
    showSyncStatus();
    initEvents();
});

function initEvents() {
    eventsRef = database.ref('events');
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
            const eventId = event.target.value;
            if (eventId) {
                selectEvent(eventId);
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

function renderEventOptions(events) {
    const eventSelect = document.getElementById('eventSelect');
    if (!eventSelect) return;
    eventSelect.innerHTML = '<option value="">Select Event</option>';
    events.forEach((event) => {
        const option = document.createElement('option');
        option.value = event.id;
        option.textContent = event.meta?.name || 'Untitled Event';
        eventSelect.appendChild(option);
    });
}

function updateEventHeader(meta) {
    const titleEl = document.getElementById('eventTitle');
    const subtitleEl = document.getElementById('eventSubtitle');
    if (!titleEl || !subtitleEl) return;
    if (!meta) {
        titleEl.textContent = 'InviteePro';
        subtitleEl.textContent = 'Create multiple events and manage invitees.';
        return;
    }
    const date = meta.date ? new Date(meta.date).toLocaleDateString() : '';
    const venue = meta.venue || '';
    const parts = [date, venue].filter(Boolean).join(' • ');
    titleEl.textContent = meta.name || 'InviteePro';
    subtitleEl.textContent = parts || 'Manage invitees for this event.';
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

function loadEventsAndRestoreSelection() {
    const storedEventId = localStorage.getItem(getEventStorageKey());
    eventsRef.on('value', (snap) => {
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

        if (events.length === 0) {
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

        const targetId = events.find((ev) => ev.id === storedEventId)?.id || events[0].id;
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
    if (!eventId) return;
    currentEventId = eventId;
    if (!meta && eventsRef) {
        try {
            const snap = await eventsRef.child(`${eventId}/meta`).get();
            meta = snap.exists() ? snap.val() : null;
        } catch (e) {
            meta = null;
        }
    }
    currentEventMeta = meta || currentEventMeta || {};
    currentEventName = currentEventMeta?.name || null;
    localStorage.setItem(getEventStorageKey(), eventId);
    updateEventHeader(currentEventMeta);

    guestsRef?.off();
    hostsRef?.off();
    guestsRef = database.ref(`events/${eventId}/guests`);
    hostsRef = database.ref(`events/${eventId}/hosts`);

    loadGuestsFromLocal();
    loadHostsFromLocal();
    renderGuestTable();
    renderHostDropdowns();
    updateDashboard();

    guestsRef.on('value', (snap) => {
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
    if (!currentEventId || !eventsRef) return;
    const stats = {
        totalFamilies: guests.length,
        totalGuests: guests.reduce((sum, g) => sum + (parseInt(g.members) || 0), 0),
        confirmed: guests.filter(g => g.rsvpStatus === 'Confirmed').length,
        pending: guests.filter(g => g.rsvpStatus === 'Pending').length,
        declined: guests.filter(g => g.rsvpStatus === 'Declined').length
    };
    try {
        await eventsRef.child(`${currentEventId}/meta`).update({
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
    document.getElementById('foodPref').value = guest.foodPref || 'Regular';
    document.getElementById('rsvpStatus').value = guest.rsvpStatus;
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
            <td><strong>${guest.firstName} ${guest.surname}</strong></td>
            <td><span class="relative-badge">${guest.relativeOf || '-'}</span></td>
            <td>${guest.members}</td>
            <td>
                <a href="javascript:void(0)" class="whatsapp-btn" onclick="sendWhatsappInvite('${guest.whatsapp}','${(guest.firstName||'').replace(/'/g,"\\'")} ${ (guest.surname||'').replace(/'/g,"\\'") }'.trim())">&#128172; WhatsApp</a>
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
                        database.ref(`events/${eventId}/guests`).get(),
                        database.ref(`events/${eventId}/hosts`).get()
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
    if (!Array.isArray(eventsArr)) throw new Error('Invalid events backup');
    // Warning: This replaces ALL events
    await eventsRef.remove();

    // Recreate events and their data
    for (const ev of eventsArr) {
        const id = ev.id || eventsRef.push().key;
        await eventsRef.child(`${id}/meta`).set(ev.meta || { name: 'Restored Event' });
        const gRef = database.ref(`events/${id}/guests`);
        const hRef = database.ref(`events/${id}/hosts`);
        const guestsArr = Array.isArray(ev.guests) ? ev.guests : [];
        const hostsArr = Array.isArray(ev.hosts) ? ev.hosts : [];
        await gRef.remove(); await hRef.remove();
        for (const g of guestsArr) { const copy = { ...g }; delete copy.firebaseKey; await gRef.push(copy); }
        for (const h of hostsArr) { const copy = { ...h }; delete copy.firebaseKey; await hRef.push(copy); }
    }
}

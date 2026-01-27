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
const guestsRef = database.ref('guests');

// Data Storage Key (for local backup)
const STORAGE_KEY = 'housewarmingInvitees';

// Global Variables
let guests = [];
let deleteTargetId = null;
let isOnline = navigator.onLine;

// Initialize Application
document.addEventListener('DOMContentLoaded', function() {
    setupFirebaseListeners();
    setupEventListeners();
    setupOnlineStatusListeners();
    showSyncStatus();
});

// Setup Firebase Real-time Listeners
function setupFirebaseListeners() {
    // Listen for data changes in real-time
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

        // Also save to localStorage as backup
        localStorage.setItem(STORAGE_KEY, JSON.stringify(guests));

        renderGuestTable();
        updateDashboard();
        showToast('Data synced from cloud', 'success');
    }, (error) => {
        console.error('Firebase read error:', error);
        // Fallback to localStorage
        loadGuestsFromLocalStorage();
        showToast('Offline mode - using local data', 'error');
    });
}

// Load from localStorage (fallback)
function loadGuestsFromLocalStorage() {
    const stored = localStorage.getItem(STORAGE_KEY);
    guests = stored ? JSON.parse(stored) : [];
    renderGuestTable();
    updateDashboard();
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
    // Update sidebar or header to show sync status
    const logo = document.querySelector('.sidebar-logo');
    if (logo) {
        logo.innerHTML = isOnline ?
            'InviteePro <span style="font-size:0.6em;opacity:0.7;">&#9679; Synced</span>' :
            'InviteePro <span style="font-size:0.6em;color:#ef4444;">&#9679; Offline</span>';
    }
}

// Setup Event Listeners
function setupEventListeners() {
    // Search functionality
    document.getElementById('searchInput').addEventListener('input', filterAndRenderTable);

    // Filter dropdowns
    document.getElementById('filterRsvp').addEventListener('change', filterAndRenderTable);
    document.getElementById('filterFood').addEventListener('change', filterAndRenderTable);

    // Close modal on outside click
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', function(e) {
            if (e.target === this) {
                closeModal(this.id);
            }
        });
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal.show').forEach(modal => {
                closeModal(modal.id);
            });
        }
    });
}

// Save to Firebase (and localStorage as backup)
function saveGuests() {
    // Save to localStorage as backup
    localStorage.setItem(STORAGE_KEY, JSON.stringify(guests));
}

// Save single guest to Firebase
function saveGuestToFirebase(guestData) {
    if (guestData.firebaseKey) {
        // Update existing
        return guestsRef.child(guestData.firebaseKey).set(guestData);
    } else {
        // Add new
        return guestsRef.push(guestData);
    }
}

// Delete guest from Firebase
function deleteGuestFromFirebase(firebaseKey) {
    return guestsRef.child(firebaseKey).remove();
}

// Generate Unique ID
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// Modal Operations
function openAddModal() {
    document.getElementById('modalTitle').textContent = 'Add New Guest';
    document.getElementById('guestForm').reset();
    document.getElementById('guestId').value = '';
    document.getElementById('giftDescGroup').style.display = 'none';
    openModal('guestModal');
}

function openEditModal(id) {
    const guest = guests.find(g => g.id === id);
    if (!guest) return;

    document.getElementById('modalTitle').textContent = 'Edit Guest';
    document.getElementById('guestId').value = guest.id;
    document.getElementById('firstName').value = guest.firstName;
    document.getElementById('surname').value = guest.surname;
    document.getElementById('members').value = guest.members;
    document.getElementById('whatsapp').value = guest.whatsapp;
    document.getElementById('foodPref').value = guest.foodPref;
    document.getElementById('rsvpStatus').value = guest.rsvpStatus;
    document.getElementById('giftGiven').checked = guest.giftGiven;
    document.getElementById('giftDescription').value = guest.giftDescription || '';
    document.getElementById('notes').value = guest.notes || '';

    toggleGiftDescription();
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

// Toggle Gift Description Field
function toggleGiftDescription() {
    const giftGiven = document.getElementById('giftGiven').checked;
    document.getElementById('giftDescGroup').style.display = giftGiven ? 'block' : 'none';
}

// Save Guest (Add or Update)
function saveGuest(event) {
    event.preventDefault();

    const id = document.getElementById('guestId').value;
    const existingGuest = id ? guests.find(g => g.id === id) : null;

    const guestData = {
        id: id || generateId(),
        firstName: document.getElementById('firstName').value.trim(),
        surname: document.getElementById('surname').value.trim(),
        members: parseInt(document.getElementById('members').value) || 1,
        whatsapp: document.getElementById('whatsapp').value.trim(),
        foodPref: document.getElementById('foodPref').value,
        rsvpStatus: document.getElementById('rsvpStatus').value,
        giftGiven: document.getElementById('giftGiven').checked,
        giftDescription: document.getElementById('giftDescription').value.trim(),
        notes: document.getElementById('notes').value.trim(),
        createdAt: existingGuest?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    // Keep firebase key if editing
    if (existingGuest?.firebaseKey) {
        guestData.firebaseKey = existingGuest.firebaseKey;
    }

    // Validate phone number
    if (!/^\d{10}$/.test(guestData.whatsapp)) {
        showToast('Please enter a valid 10-digit mobile number', 'error');
        return;
    }

    // Save to Firebase
    saveGuestToFirebase(guestData)
        .then(() => {
            showToast(id ? 'Guest updated successfully!' : 'Guest added successfully!', 'success');
            closeModal('guestModal');
        })
        .catch((error) => {
            console.error('Firebase save error:', error);
            // Fallback: save locally
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

// Delete Guest
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
        // Delete from Firebase
        deleteGuestFromFirebase(guest.firebaseKey)
            .then(() => {
                showToast('Guest deleted successfully!', 'success');
                closeModal('deleteModal');
                deleteTargetId = null;
            })
            .catch((error) => {
                console.error('Firebase delete error:', error);
                // Fallback: delete locally
                guests = guests.filter(g => g.id !== deleteTargetId);
                saveGuests();
                renderGuestTable();
                updateDashboard();
                showToast('Deleted locally (offline mode)', 'success');
                closeModal('deleteModal');
                deleteTargetId = null;
            });
    } else {
        // Delete locally only
        guests = guests.filter(g => g.id !== deleteTargetId);
        saveGuests();
        renderGuestTable();
        updateDashboard();
        showToast('Guest deleted successfully!', 'success');
        closeModal('deleteModal');
        deleteTargetId = null;
    }
}

// Render Guest Table
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
            <td>${guest.members}</td>
            <td>
                <a href="https://wa.me/91${guest.whatsapp}" target="_blank" class="whatsapp-link">
                    +91 ${formatPhone(guest.whatsapp)}
                </a>
            </td>
            <td><span class="badge badge-${guest.foodPref.toLowerCase().replace('-', '')}">${guest.foodPref}</span></td>
            <td><span class="badge badge-${guest.rsvpStatus.toLowerCase()}">${guest.rsvpStatus}</span></td>
            <td>
                ${guest.giftGiven ? `
                    <div class="gift-info">
                        <span>Yes</span>
                        ${guest.giftDescription ? `<span class="gift-desc">${guest.giftDescription}</span>` : ''}
                    </div>
                ` : 'No'}
            </td>
            <td>${guest.notes || '-'}</td>
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

// Format Phone Number for Display
function formatPhone(phone) {
    if (phone.length !== 10) return phone;
    return `${phone.substring(0, 5)} ${phone.substring(5)}`;
}

// Get Filtered Guests
function getFilteredGuests() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const rsvpFilter = document.getElementById('filterRsvp').value;
    const foodFilter = document.getElementById('filterFood').value;

    return guests.filter(guest => {
        const matchesSearch = !searchTerm ||
            guest.firstName.toLowerCase().includes(searchTerm) ||
            guest.surname.toLowerCase().includes(searchTerm) ||
            guest.whatsapp.includes(searchTerm) ||
            (guest.notes && guest.notes.toLowerCase().includes(searchTerm));

        const matchesRsvp = !rsvpFilter || guest.rsvpStatus === rsvpFilter;
        const matchesFood = !foodFilter || guest.foodPref === foodFilter;

        return matchesSearch && matchesRsvp && matchesFood;
    });
}

// Filter and Render Table
function filterAndRenderTable() {
    renderGuestTable();
}

// Update Dashboard Statistics
function updateDashboard() {
    const stats = {
        totalFamilies: guests.length,
        totalGuests: guests.reduce((sum, g) => sum + g.members, 0),
        confirmed: guests.filter(g => g.rsvpStatus === 'Confirmed').length,
        pending: guests.filter(g => g.rsvpStatus === 'Pending').length,
        declined: guests.filter(g => g.rsvpStatus === 'Declined').length,
        veg: guests.filter(g => g.foodPref === 'Veg').reduce((sum, g) => sum + g.members, 0),
        nonVeg: guests.filter(g => g.foodPref === 'Non-Veg').reduce((sum, g) => sum + g.members, 0),
        jain: guests.filter(g => g.foodPref === 'Jain').reduce((sum, g) => sum + g.members, 0),
        gifts: guests.filter(g => g.giftGiven).length
    };

    // Main dashboard cards
    document.getElementById('totalFamilies').textContent = stats.totalFamilies;
    document.getElementById('totalGuests').textContent = stats.totalGuests;
    document.getElementById('confirmedCount').textContent = stats.confirmed;
    document.getElementById('pendingCount').textContent = stats.pending;

    // Food preference counts
    document.getElementById('vegCount').textContent = stats.veg;
    document.getElementById('nonVegCount').textContent = stats.nonVeg;
    document.getElementById('jainCount').textContent = stats.jain;

    // RSVP status panel
    document.getElementById('statusConfirmed').textContent = stats.confirmed;
    document.getElementById('statusPending').textContent = stats.pending;
    document.getElementById('statusDeclined').textContent = stats.declined;

    // Gift tracker
    document.getElementById('giftsCount').textContent = stats.gifts;
}

// WhatsApp Operations
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
        // Fallback for older browsers
        const textarea = document.createElement('textarea');
        textarea.value = numbers;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        showToast(`${guests.length} WhatsApp numbers copied to clipboard!`, 'success');
    });
}

// Export Functions
function getSelectedColumns() {
    return {
        sno: document.getElementById('expSno').checked,
        name: document.getElementById('expName').checked,
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
        if (columns.members) row['Members'] = guest.members;
        if (columns.whatsapp) row['WhatsApp'] = `+91 ${formatPhone(guest.whatsapp)}`;
        if (columns.food) row['Food Preference'] = guest.foodPref;
        if (columns.rsvp) row['RSVP Status'] = guest.rsvpStatus;
        if (columns.gift) row['Gift'] = guest.giftGiven ? (guest.giftDescription || 'Yes') : 'No';
        if (columns.notes) row['Notes'] = guest.notes || '';
        return row;
    });

    // Add summary row
    const summaryRow = {};
    if (columns.sno) summaryRow['S.No'] = '';
    if (columns.name) summaryRow['Family Head Name'] = `Total: ${guests.length} Families`;
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

    // Auto-width columns
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
    const doc = new jsPDF();
    const columns = getSelectedColumns();

    // Title
    doc.setFontSize(18);
    doc.setTextColor(230, 81, 0);
    doc.text('Housewarming Invitee List', 14, 22);

    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Generated on: ${new Date().toLocaleDateString('en-IN')}`, 14, 30);

    // Summary
    doc.setFontSize(11);
    doc.setTextColor(0);
    const totalGuests = guests.reduce((sum, g) => sum + g.members, 0);
    doc.text(`Total Families: ${guests.length} | Total Guests: ${totalGuests}`, 14, 40);

    // Table headers and data
    const headers = [];
    const columnKeys = [];

    if (columns.sno) { headers.push('S.No'); columnKeys.push('sno'); }
    if (columns.name) { headers.push('Family Head'); columnKeys.push('name'); }
    if (columns.members) { headers.push('Members'); columnKeys.push('members'); }
    if (columns.whatsapp) { headers.push('WhatsApp'); columnKeys.push('whatsapp'); }
    if (columns.food) { headers.push('Food'); columnKeys.push('food'); }
    if (columns.rsvp) { headers.push('RSVP'); columnKeys.push('rsvp'); }
    if (columns.gift) { headers.push('Gift'); columnKeys.push('gift'); }
    if (columns.notes) { headers.push('Notes'); columnKeys.push('notes'); }

    const tableData = guests.map((guest, index) => {
        const row = [];
        if (columns.sno) row.push(index + 1);
        if (columns.name) row.push(`${guest.firstName} ${guest.surname}`);
        if (columns.members) row.push(guest.members);
        if (columns.whatsapp) row.push(`+91 ${guest.whatsapp}`);
        if (columns.food) row.push(guest.foodPref);
        if (columns.rsvp) row.push(guest.rsvpStatus);
        if (columns.gift) row.push(guest.giftGiven ? (guest.giftDescription || 'Yes') : 'No');
        if (columns.notes) row.push(guest.notes || '-');
        return row;
    });

    doc.autoTable({
        head: [headers],
        body: tableData,
        startY: 48,
        styles: {
            fontSize: 9,
            cellPadding: 3
        },
        headStyles: {
            fillColor: [230, 81, 0],
            textColor: 255,
            fontStyle: 'bold'
        },
        alternateRowStyles: {
            fillColor: [255, 248, 240]
        }
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
    doc.setTextColor(230, 81, 0);
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
        styles: {
            fontSize: 11,
            cellPadding: 5
        },
        headStyles: {
            fillColor: [230, 81, 0],
            textColor: 255,
            fontStyle: 'bold'
        },
        columnStyles: {
            0: { cellWidth: 20 },
            1: { cellWidth: 100 },
            2: { cellWidth: 40 }
        }
    });

    doc.save(`Sticker_List_${getDateString()}.pdf`);
    showToast('Sticker list downloaded!', 'success');
    closeModal('exportModal');
}

// Backup and Restore
function downloadBackup() {
    if (guests.length === 0) {
        showToast('No data to backup', 'error');
        return;
    }

    const backup = {
        version: '1.0',
        exportDate: new Date().toISOString(),
        data: guests
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

            if (!backup.data || !Array.isArray(backup.data)) {
                throw new Error('Invalid backup file format');
            }

            // Clear existing Firebase data and upload backup
            guestsRef.remove().then(() => {
                // Upload each guest to Firebase
                const promises = backup.data.map(guest => {
                    // Remove old firebase key if exists
                    delete guest.firebaseKey;
                    return guestsRef.push(guest);
                });

                return Promise.all(promises);
            }).then(() => {
                showToast(`Restored ${backup.data.length} guests to cloud!`, 'success');
                closeModal('backupModal');
            }).catch((error) => {
                console.error('Firebase restore error:', error);
                // Fallback: restore locally
                guests = backup.data;
                saveGuests();
                renderGuestTable();
                updateDashboard();
                showToast(`Restored ${guests.length} guests locally!`, 'success');
                closeModal('backupModal');
            });

        } catch (error) {
            showToast('Failed to restore: Invalid backup file', 'error');
        }
    };
    reader.readAsText(file);

    // Reset file input
    event.target.value = '';
}

// Utility Functions
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

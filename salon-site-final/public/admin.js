let bookings = [];
let staff = [];
let shifts = [];

const bookingsTableBody = document.querySelector('#bookingsTable tbody');
const staffList = document.getElementById('staffList');
const staffNameInput = document.getElementById('staffName');
const addStaffForm = document.getElementById('addStaffForm');
const shiftStaffSelect = document.getElementById('shiftStaff');
const shiftList = document.getElementById('shiftList');
const addShiftForm = document.getElementById('addShiftForm');

const prevMonthBtn = document.getElementById('prevMonth');
const nextMonthBtn = document.getElementById('nextMonth');
const calendarTitle = document.getElementById('calendarTitle');
const calendarGrid = document.getElementById('calendarGrid');
const selectedDateTitle = document.getElementById('selectedDateTitle');
const selectedBookingsList = document.getElementById('selectedBookings');

let currentMonth = new Date();

async function fetchAll() {
  const [bookingsRes, staffRes, shiftsRes] = await Promise.all([
    fetch('/api/bookings'),
    fetch('/api/staff'),
    fetch('/api/shifts'),
  ]);

  bookings = await bookingsRes.json();
  staff = await staffRes.json();
  shifts = await shiftsRes.json();

  renderBookingsTable();
  renderStaff();
  renderShifts();
  renderCalendar();
}

function renderBookingsTable() {
  bookingsTableBody.innerHTML = '';

  bookings
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
    .forEach(b => {
      const tr = document.createElement('tr');

      tr.innerHTML = `
        <td>${b.id}</td>
        <td>${b.name}<br/><span class="small muted">${b.email}</span></td>
        <td>${b.service}</td>
        <td>${b.staffName || 'Any'}</td>
        <td>${b.date}</td>
        <td>${b.time}</td>
        <td>
          <button class="btn-secondary small-btn" data-action="edit" data-id="${b.id}">Edit</button>
          <button class="btn-secondary small-btn" data-action="delete" data-id="${b.id}">Delete</button>
        </td>
      `;

      bookingsTableBody.appendChild(tr);
    });
}

// Edit/Delete bookings
bookingsTableBody.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;

  const id = Number(btn.dataset.id);
  const action = btn.dataset.action;

  if (action === 'delete') {
    if (!confirm('Delete this booking?')) return;
    await fetch(`/api/bookings/${id}`, { method: 'DELETE' });
    bookings = bookings.filter(b => b.id !== id);
    renderBookingsTable();
    renderCalendar();
  }

  if (action === 'edit') {
    const booking = bookings.find(b => b.id === id);
    if (!booking) return;

    const newDate = prompt('New date (YYYY-MM-DD):', booking.date) || booking.date;
    const newTime = prompt('New time (HH:MM):', booking.time) || booking.time;

    const res = await fetch(`/api/bookings/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: newDate, time: newTime }),
    });
    const updated = await res.json();
    bookings = bookings.map(b => (b.id === id ? updated : b));
    renderBookingsTable();
    renderCalendar();
  }
});

// Staff management
function renderStaff() {
  staffList.innerHTML = '';
  shiftStaffSelect.innerHTML = '';

  staff.forEach(member => {
    const li = document.createElement('li');
    li.innerHTML = `
      <span>${member.name}</span>
      <button class="btn-secondary small-btn" data-id="${member.id}">Remove</button>
    `;
    staffList.appendChild(li);

    const opt = document.createElement('option');
    opt.value = member.id;
    opt.textContent = member.name;
    shiftStaffSelect.appendChild(opt);
  });
}

addStaffForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = staffNameInput.value.trim();
  if (!name) return;

  const res = await fetch('/api/staff', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  const created = await res.json();
  staff.push(created);
  staffNameInput.value = '';
  renderStaff();
});

staffList.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-id]');
  if (!btn) return;
  const id = Number(btn.dataset.id);
  if (!confirm('Remove this staff member and their shifts?')) return;

  await fetch(`/api/staff/${id}`, { method: 'DELETE' });
  staff = staff.filter(s => s.id !== id);
  shifts = shifts.filter(sh => sh.staffId !== id);
  renderStaff();
  renderShifts();
});

// Shifts
function renderShifts() {
  shiftList.innerHTML = '';
  shifts
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .forEach(sh => {
      const staffMember = staff.find(s => s.id === sh.staffId);
      const li = document.createElement('li');
      li.innerHTML = `
        <span>${sh.date} • ${sh.startTime}–${sh.endTime}<br/>
        <span class="muted small">${staffMember ? staffMember.name : 'Unknown'}</span></span>
        <button class="btn-secondary small-btn" data-id="${sh.id}">Delete</button>
      `;
      shiftList.appendChild(li);
    });
}

addShiftForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    staffId: Number(shiftStaffSelect.value),
    date: document.getElementById('shiftDate').value,
    startTime: document.getElementById('shiftStart').value,
    endTime: document.getElementById('shiftEnd').value,
  };

  const res = await fetch('/api/shifts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const created = await res.json();
  shifts.push(created);
  renderShifts();
  addShiftForm.reset();
});

shiftList.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-id]');
  if (!btn) return;
  const id = Number(btn.dataset.id);
  if (!confirm('Delete this shift?')) return;

  await fetch(`/api/shifts/${id}`, { method: 'DELETE' });
  shifts = shifts.filter(sh => sh.id !== id);
  renderShifts();
});

// Calendar
function getMonthBookings(year, month) {
  return bookings.filter(b => {
    const [y, m, d] = b.date.split('-').map(Number);
    return y === year && m === month + 1;
  });
}

function renderCalendar() {
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  calendarTitle.textContent = currentMonth.toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });

  calendarGrid.innerHTML = '';

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startWeekday = firstDay.getDay(); // 0-6 (Sunday-Saturday)
  const daysInMonth = lastDay.getDate();

  // Map date -> count
  const monthBookings = getMonthBookings(year, month);
  const countByDay = {};
  monthBookings.forEach(b => {
    const day = Number(b.date.split('-')[2]);
    countByDay[day] = (countByDay[day] || 0) + 1;
  });

  // Fill grid
  for (let i = 0; i < startWeekday; i++) {
    const cell = document.createElement('div');
    cell.className = 'calendar-day disabled';
    calendarGrid.appendChild(cell);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const cell = document.createElement('div');
    const count = countByDay[day] || 0;
    cell.className = 'calendar-day';
    if (count > 0) cell.classList.add('has-bookings');

    cell.dataset.date = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    cell.innerHTML = `
      <div class="calendar-day-number">${day}</div>
      ${count > 0 ? `<div class="calendar-day-count">${count} booking${count > 1 ? 's' : ''}</div>` : ''}
    `;

    cell.addEventListener('click', () => showBookingsForDate(cell.dataset.date));
    calendarGrid.appendChild(cell);
  }
}

function showBookingsForDate(dateStr) {
  selectedDateTitle.textContent = `Bookings on ${dateStr}`;
  selectedBookingsList.innerHTML = '';
  const items = bookings.filter(b => b.date === dateStr);

  if (!items.length) {
    selectedBookingsList.innerHTML = '<li>No bookings.</li>';
    return;
  }

  items
    .slice()
    .sort((a, b) => a.time.localeCompare(b.time))
    .forEach(b => {
      const li = document.createElement('li');
      li.innerHTML = `
        <span>${b.time} – ${b.name}</span>
        <span class="muted small">${b.service}${b.staffName ? ' • ' + b.staffName : ''}</span>
      `;
      selectedBookingsList.appendChild(li);
    });
}

prevMonthBtn.addEventListener('click', () => {
  currentMonth.setMonth(currentMonth.getMonth() - 1);
  renderCalendar();
});

nextMonthBtn.addEventListener('click', () => {
  currentMonth.setMonth(currentMonth.getMonth() + 1);
  renderCalendar();
});

// Initial load
fetchAll().catch(err => console.error(err));

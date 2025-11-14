const staffSelect = document.getElementById('staff');
const bookingForm = document.getElementById('bookingForm');
const bookingStatus = document.getElementById('bookingStatus');
const yearSpan = document.getElementById('year');
const serviceCheckboxes = document.querySelectorAll('.service-checkbox');

if (yearSpan) {
  yearSpan.textContent = new Date().getFullYear();
}

async function loadStaff() {
  try {
    const res = await fetch('/api/staff');
    const staff = await res.json();
    staff.forEach(member => {
      const opt = document.createElement('option');
      opt.value = member.id;
      opt.textContent = member.name;
      staffSelect.appendChild(opt);
    });
  } catch (err) {
    console.error('Error loading staff', err);
  }
}

loadStaff();

bookingForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  bookingStatus.textContent = '';
  bookingStatus.className = 'status';

  const selectedServices = Array.from(serviceCheckboxes)
    .filter(cb => cb.checked)
    .map(cb => cb.value);

  const payload = {
    name: document.getElementById('name').value.trim(),
    email: document.getElementById('email').value.trim(),
    phone: document.getElementById('phone').value.trim(),
    services: selectedServices,
    date: document.getElementById('date').value,
    time: document.getElementById('time').value,
    notes: document.getElementById('notes').value.trim(),
  };

  const staffId = staffSelect.value;
  if (staffId) {
    payload.staffId = Number(staffId);
    payload.staffName = staffSelect.options[staffSelect.selectedIndex].textContent;
  }

  if (!payload.services.length) {
    bookingStatus.textContent = 'Please select at least one service.';
    bookingStatus.classList.add('error');
    return;
  }

  try {
    const res = await fetch('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Something went wrong.');
    }

    bookingForm.reset();
    bookingStatus.textContent = 'Booking saved! A confirmation email will be sent shortly.';
    bookingStatus.classList.add('ok');
  } catch (err) {
    console.error(err);
    bookingStatus.textContent = 'Could not save booking. Please try again.';
    bookingStatus.classList.add('error');
  }
});

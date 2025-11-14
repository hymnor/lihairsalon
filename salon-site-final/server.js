
const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const bodyParser = require('body-parser');
const cors = require('cors');
const { Resend } = require('resend');

const app = express();
const PORT = process.env.PORT || 3000;

const DATA_DIR = path.join(__dirname, 'data');
const BOOKINGS_PATH = path.join(DATA_DIR, 'bookings.json');
const STAFF_PATH = path.join(DATA_DIR, 'staff.json');
const SHIFTS_PATH = path.join(DATA_DIR, 'shifts.json');

const resend = new Resend(process.env.RESEND_API_KEY || '');

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Helpers
async function readJson(filePath, fallback) {
  try {
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data || 'null') ?? fallback;
  } catch (err) {
    return fallback;
  }
}

async function writeJson(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
}

// ===== Bookings API =====
app.get('/api/bookings', async (req, res) => {
  const bookings = await readJson(BOOKINGS_PATH, []);
  res.json(bookings);
});

app.post('/api/bookings', async (req, res) => {
  const bookings = await readJson(BOOKINGS_PATH, []);
  const nextId = bookings.length ? Math.max(...bookings.map(b => b.id)) + 1 : 1;

  const {
    name,
    email,
    phone,
    service,
    staffId,
    staffName,
    date,
    time,
    notes
  } = req.body;

  if (!name || !email || !service || !date || !time) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }

  const booking = {
    id: nextId,
    name,
    email,
    phone: phone || '',
    service,
    staffId: staffId ?? null,
    staffName: staffName || '',
    date,
    time,
    notes: notes || '',
    createdAt: new Date().toISOString()
  };

  bookings.push(booking);
  await writeJson(BOOKINGS_PATH, bookings);

  // Send email via Resend (best effort)
  const fromEmail = process.env.SALON_FROM_EMAIL;
  const adminEmail = process.env.SALON_TO_EMAIL;

  if (process.env.RESEND_API_KEY && fromEmail) {
    try {
      const toList = [email];
      if (adminEmail) toList.push(adminEmail);

      const html = `
        <h2>Booking Confirmation - Li Hair Salon</h2>
        <p>Hi ${name},</p>
        <p>Thank you for booking with Li Hair Salon. Here are your booking details:</p>
        <ul>
          <li><strong>Service:</strong> ${service}</li>
          <li><strong>Staff:</strong> ${staffName || 'Any available'}</li>
          <li><strong>Date:</strong> ${date}</li>
          <li><strong>Time:</strong> ${time}</li>
        </ul>
        <p>If you need to make changes, please contact the salon.</p>
        <p>See you soon!</p>
      `;

      await resend.emails.send({
        from: fromEmail,
        to: toList,
        subject: 'Your Li Hair Salon Booking',
        html
      });
    } catch (err) {
      console.error('Error sending email with Resend:', err.message || err);
      // do not fail booking if email fails
    }
  }

  res.status(201).json(booking);
});

app.put('/api/bookings/:id', async (req, res) => {
  const id = Number(req.params.id);
  const bookings = await readJson(BOOKINGS_PATH, []);
  const index = bookings.findIndex(b => b.id === id);
  if (index === -1) return res.status(404).json({ error: 'Booking not found' });

  bookings[index] = { ...bookings[index], ...req.body };
  await writeJson(BOOKINGS_PATH, bookings);
  res.json(bookings[index]);
});

app.delete('/api/bookings/:id', async (req, res) => {
  const id = Number(req.params.id);
  const bookings = await readJson(BOOKINGS_PATH, []);
  const index = bookings.findIndex(b => b.id === id);
  if (index === -1) return res.status(404).json({ error: 'Booking not found' });

  const deleted = bookings.splice(index, 1)[0];
  await writeJson(BOOKINGS_PATH, bookings);
  res.json(deleted);
});

// ===== Staff API =====
app.get('/api/staff', async (req, res) => {
  const staff = await readJson(STAFF_PATH, []);
  res.json(staff);
});

app.post('/api/staff', async (req, res) => {
  const staff = await readJson(STAFF_PATH, []);
  const nextId = staff.length ? Math.max(...staff.map(s => s.id)) + 1 : 1;
  const { name } = req.body;

  if (!name) return res.status(400).json({ error: 'Name is required' });

  const member = { id: nextId, name };
  staff.push(member);
  await writeJson(STAFF_PATH, staff);
  res.status(201).json(member);
});

app.put('/api/staff/:id', async (req, res) => {
  const id = Number(req.params.id);
  const staff = await readJson(STAFF_PATH, []);
  const index = staff.findIndex(s => s.id === id);
  if (index === -1) return res.status(404).json({ error: 'Staff not found' });

  staff[index] = { ...staff[index], ...req.body };
  await writeJson(STAFF_PATH, staff);
  res.json(staff[index]);
});

app.delete('/api/staff/:id', async (req, res) => {
  const id = Number(req.params.id);
  const staff = await readJson(STAFF_PATH, []);
  const index = staff.findIndex(s => s.id === id);
  if (index === -1) return res.status(404).json({ error: 'Staff not found' });

  const deleted = staff.splice(index, 1)[0];
  await writeJson(STAFF_PATH, staff);

  // Also remove shifts for this staff
  const shifts = await readJson(SHIFTS_PATH, []);
  const remainingShifts = shifts.filter(sh => sh.staffId !== id);
  await writeJson(SHIFTS_PATH, remainingShifts);

  res.json(deleted);
});

// ===== Shifts API =====
app.get('/api/shifts', async (req, res) => {
  const shifts = await readJson(SHIFTS_PATH, []);
  res.json(shifts);
});

app.post('/api/shifts', async (req, res) => {
  const shifts = await readJson(SHIFTS_PATH, []);
  const nextId = shifts.length ? Math.max(...shifts.map(s => s.id)) + 1 : 1;
  const { staffId, date, startTime, endTime } = req.body;

  if (!staffId || !date || !startTime || !endTime) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const shift = { id: nextId, staffId, date, startTime, endTime };
  shifts.push(shift);
  await writeJson(SHIFTS_PATH, shifts);
  res.status(201).json(shift);
});

app.put('/api/shifts/:id', async (req, res) => {
  const id = Number(req.params.id);
  const shifts = await readJson(SHIFTS_PATH, []);
  const index = shifts.findIndex(s => s.id === id);
  if (index === -1) return res.status(404).json({ error: 'Shift not found' });

  shifts[index] = { ...shifts[index], ...req.body };
  await writeJson(SHIFTS_PATH, shifts);
  res.json(shifts[index]);
});

app.delete('/api/shifts/:id', async (req, res) => {
  const id = Number(req.params.id);
  const shifts = await readJson(SHIFTS_PATH, []);
  const index = shifts.findIndex(s => s.id === id);
  if (index === -1) return res.status(404).json({ error: 'Shift not found' });

  const deleted = shifts.splice(index, 1)[0];
  await writeJson(SHIFTS_PATH, shifts);
  res.json(deleted);
});

// Fallback: send index.html for root (optional)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

const express = require("express");
const path = require("path");
const { Resend } = require("resend");

const app = express();
const PORT = process.env.PORT || 3000;

// Configure Resend
const resendApiKey = process.env.RESEND_API_KEY || "";
const resendFrom = process.env.RESEND_FROM || "";
const resend = resendApiKey ? new Resend(resendApiKey) : null;
console.log("RESEND_API_KEY exists:", !!process.env.RESEND_API_KEY);
console.log("RESEND_FROM:", process.env.RESEND_FROM);

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ----- CONFIG -----
const OPENING_HOUR = 10; // 10:00
const CLOSING_HOUR = 18; // 18:00
const SLOT_MINUTES = 30;

// Services with durations (in minutes)
const SERVICES = [
  { id: "haircut", name: "Haircut", duration: 60 },
  { id: "hair-colour", name: "Hair Colour", duration: 120 },
  { id: "blow-dry", name: "Blow Dry", duration: 30 },
];

// In-memory stores (reset when server restarts)
let bookings = [];
let staff = [
  { id: "s1", name: "Alice", role: "Stylist" },
  { id: "s2", name: "Bella", role: "Colorist" },
];
let shifts = [
  { id: "sh1", staffId: "s1", date: "2025-11-20", startTime: "10:00", endTime: "14:00" },
];

// ----- HELPERS -----
function timeStringToMinutes(timeStr) {
  const [h, m] = timeStr.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTimeString(totalMinutes) {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  const pad = (n) => (n < 10 ? "0" + n : "" + n);
  return `${pad(h)}:${pad(m)}`;
}

function rangesOverlap(startA, durationA, startB, durationB) {
  const endA = startA + durationA;
  const endB = startB + durationB;
  return startA < endB && startB < endA;
}

function getTotalDurationForServices(serviceIds) {
  return serviceIds.reduce((sum, id) => {
    const svc = SERVICES.find((s) => s.id === id);
    return svc ? sum + svc.duration : sum;
  }, 0);
}

// ----- EMAIL -----
async function sendBookingEmail(booking) {
  if (!resend || !resendFrom) {
    console.log("Resend not configured; skipping email.");
    return;
  }

  try {
    const servicesList = booking.services
      .map((id) => {
        const svc = SERVICES.find((s) => s.id === id);
        return svc ? svc.name : id;
      })
      .join(", ");

    const subject = `Your booking at Li Hair Salon on ${booking.date} at ${booking.time}`;
    const html = `
      <div style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
        <h2>Booking confirmed ✂️</h2>
        <p>Hi ${booking.name},</p>
        <p>Thank you for booking with <strong>Li Hair Salon</strong>.</p>
        <p>
          <strong>Date:</strong> ${booking.date}<br/>
          <strong>Time:</strong> ${booking.time}<br/>
          <strong>Services:</strong> ${servicesList}<br/>
          <strong>Total duration:</strong> ${booking.totalDuration} minutes
        </p>
        ${booking.staffId ? `<p><strong>Preferred staff:</strong> ${booking.staffName || ""}</p>` : ""}
        <p>If you need to make any changes, please contact the salon.</p>
        <p>See you soon! 💇‍♀️</p>
      </div>
    `;

    const { data, error } = await resend.emails.send({
      from: resendFrom,
      to: booking.email,
      subject,
      html,
    });

    if (error) {
      console.error("Resend error:", error);
    } else {
      console.log("Resend queued email:", data?.id, "to", booking.email);
    }
  } catch (err) {
    console.error("Error sending booking email:", err);
  }
}

// ----- BOOKINGS -----
// Create booking
app.post("/api/bookings", async (req, res) => {
  try {
    const { name, email, date, time, services, staffId } = req.body;

    if (!name || !email || !date || !time || !Array.isArray(services) || services.length === 0) {
      return res.status(400).json({ error: "Missing fields or no services selected." });
    }

    // Validate optional staffId
    let staffName = "";
    if (staffId) {
      const member = staff.find((s) => s.id === staffId);
      if (!member) {
        return res.status(400).json({ error: "Selected staff member does not exist." });
      }
      staffName = member.name;
    }

    // Validate time inside salon hours & 30-min slots
    const startMinutes = timeStringToMinutes(time);
    const openMinutes = OPENING_HOUR * 60;
    const closeMinutes = CLOSING_HOUR * 60;

    if (startMinutes < openMinutes || startMinutes >= closeMinutes) {
      return res.status(400).json({ error: "Selected time is outside salon hours." });
    }

    if ((startMinutes - openMinutes) % SLOT_MINUTES !== 0) {
      return res.status(400).json({ error: "Time must be in 30-minute intervals." });
    }

    const totalDuration = getTotalDurationForServices(services);
    if (totalDuration <= 0) {
      return res.status(400).json({ error: "Invalid services selected." });
    }

    // Check for conflicts on same date (single-resource salon)
    const bookingDay = date;
    const conflicts = bookings.some((b) => {
      if (b.date !== bookingDay) return false;
      const existingStart = timeStringToMinutes(b.time);
      return rangesOverlap(existingStart, b.totalDuration, startMinutes, totalDuration);
    });

    if (conflicts) {
      return res.status(400).json({
        error: "This time overlaps with an existing booking. Please choose another time.",
      });
    }

    const newBooking = {
      id: Date.now().toString(),
      name,
      email,
      date,
      time,
      services,
      staffId: staffId || null,
      staffName: staffName || null,
      totalDuration,
      createdAt: new Date().toISOString(),
    };

    bookings.push(newBooking);

    // Fire-and-forget email (we don't fail the booking if email fails)
    sendBookingEmail(newBooking);

    res.json({ success: true, booking: newBooking });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error creating booking." });
  }
});

// Get all bookings
app.get("/api/bookings", (req, res) => {
  res.json({ bookings, services: SERVICES, staff });
});

// Update booking
app.put("/api/bookings/:id", (req, res) => {
  try {
    const id = req.params.id;
    const booking = bookings.find((b) => b.id === id);
    if (!booking) return res.status(404).json({ error: "Booking not found." });

    const { name, email, date, time, services, staffId } = req.body;

    if (!name || !email || !date || !time || !Array.isArray(services) || services.length === 0) {
      return res.status(400).json({ error: "Missing fields or no services selected." });
    }

    let staffName = "";
    if (staffId) {
      const member = staff.find((s) => s.id === staffId);
      if (!member) return res.status(400).json({ error: "Selected staff member does not exist." });
      staffName = member.name;
    }

    const startMinutes = timeStringToMinutes(time);
    const openMinutes = OPENING_HOUR * 60;
    const closeMinutes = CLOSING_HOUR * 60;

    if (startMinutes < openMinutes || startMinutes >= closeMinutes) {
      return res.status(400).json({ error: "Selected time is outside salon hours." });
    }

    if ((startMinutes - openMinutes) % SLOT_MINUTES !== 0) {
      return res.status(400).json({ error: "Time must be in 30-minute intervals." });
    }

    const totalDuration = getTotalDurationForServices(services);
    if (totalDuration <= 0) {
      return res.status(400).json({ error: "Invalid services selected." });
    }

    // Conflict check excluding this booking itself
    const bookingDay = date;
    const conflicts = bookings.some((b) => {
      if (b.date !== bookingDay || b.id === id) return false;
      const existingStart = timeStringToMinutes(b.time);
      return rangesOverlap(existingStart, b.totalDuration, startMinutes, totalDuration);
    });

    if (conflicts) {
      return res.status(400).json({
        error: "This time overlaps with an existing booking. Please choose another time.",
      });
    }

    booking.name = name;
    booking.email = email;
    booking.date = date;
    booking.time = time;
    booking.services = services;
    booking.staffId = staffId || null;
    booking.staffName = staffName || null;
    booking.totalDuration = totalDuration;

    res.json({ success: true, booking });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error updating booking." });
  }
});

// Delete booking
app.delete("/api/bookings/:id", (req, res) => {
  const id = req.params.id;
  const idx = bookings.findIndex((b) => b.id === id);
  if (idx === -1) return res.status(404).json({ error: "Booking not found." });
  bookings.splice(idx, 1);
  res.json({ success: true });
});

// ----- STAFF -----
// Get staff
app.get("/api/staff", (req, res) => {
  res.json({ staff });
});

// Create staff
app.post("/api/staff", (req, res) => {
  const { name, role } = req.body;
  if (!name) return res.status(400).json({ error: "Name is required." });
  const newStaff = {
    id: Date.now().toString(),
    name,
    role: role || "",
  };
  staff.push(newStaff);
  res.json({ success: true, staff: newStaff });
});

// Update staff
app.put("/api/staff/:id", (req, res) => {
  const id = req.params.id;
  const member = staff.find((s) => s.id === id);
  if (!member) return res.status(404).json({ error: "Staff not found." });

  const { name, role } = req.body;
  if (!name) return res.status(400).json({ error: "Name is required." });

  member.name = name;
  member.role = role || "";
  res.json({ success: true, staff: member });
});

// Delete staff (also clears their shifts and removes from bookings)
app.delete("/api/staff/:id", (req, res) => {
  const id = req.params.id;
  const idx = staff.findIndex((s) => s.id === id);
  if (idx === -1) return res.status(404).json({ error: "Staff not found." });

  staff.splice(idx, 1);
  shifts = shifts.filter((sh) => sh.staffId !== id);
  bookings = bookings.map((b) => (b.staffId === id ? { ...b, staffId: null, staffName: null } : b));
  res.json({ success: true });
});

// ----- SHIFTS -----
// Get shifts
app.get("/api/shifts", (req, res) => {
  res.json({ shifts });
});

// Create shift
app.post("/api/shifts", (req, res) => {
  const { staffId, date, startTime, endTime } = req.body;
  if (!staffId || !date || !startTime || !endTime) {
    return res.status(400).json({ error: "All fields are required." });
  }
  const exists = staff.some((s) => s.id === staffId);
  if (!exists) return res.status(400).json({ error: "Staff member not found." });

  const start = timeStringToMinutes(startTime);
  const end = timeStringToMinutes(endTime);
  if (end <= start) {
    return res.status(400).json({ error: "Shift end time must be after start time." });
  }

  const newShift = {
    id: Date.now().toString(),
    staffId,
    date,
    startTime,
    endTime,
  };
  shifts.push(newShift);
  res.json({ success: true, shift: newShift });
});

// Update shift
app.put("/api/shifts/:id", (req, res) => {
  const id = req.params.id;
  const shift = shifts.find((sh) => sh.id === id);
  if (!shift) return res.status(404).json({ error: "Shift not found." });

  const { staffId, date, startTime, endTime } = req.body;
  if (!staffId || !date || !startTime || !endTime) {
    return res.status(400).json({ error: "All fields are required." });
  }
  const exists = staff.some((s) => s.id === staffId);
  if (!exists) return res.status(400).json({ error: "Staff member not found." });

  const start = timeStringToMinutes(startTime);
  const end = timeStringToMinutes(endTime);
  if (end <= start) {
    return res.status(400).json({ error: "Shift end time must be after start time." });
  }

  shift.staffId = staffId;
  shift.date = date;
  shift.startTime = startTime;
  shift.endTime = endTime;

  res.json({ success: true, shift });
});

// Delete shift
app.delete("/api/shifts/:id", (req, res) => {
  const id = req.params.id;
  const idx = shifts.findIndex((sh) => sh.id === id);
  if (idx === -1) return res.status(404).json({ error: "Shift not found." });
  shifts.splice(idx, 1);
  res.json({ success: true });
});

// ----- CONFIG -----
app.get("/api/config", (req, res) => {
  res.json({
    services: SERVICES,
    openingHour: OPENING_HOUR,
    closingHour: CLOSING_HOUR,
    slotMinutes: SLOT_MINUTES,
  });
});

// Fallback: serve main page
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Salon booking server running on port ${PORT}`);
});

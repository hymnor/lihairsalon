Li Hair Salon – Booking System (with Email)
===========================================

What this does
--------------
- Customer booking page (multiple services in one booking, 30-minute slots).
- Admin dashboard (calendar, bookings, staff, shifts) – same as before.
- When a client makes a booking, they receive a confirmation email via Resend.

Files
-----
/server.js          -> Express server + Resend email integration
/public/index.html  -> Client booking page (no change in API, just message text)
/public/admin.html  -> Admin dashboard (you can reuse your previous full version)
/package.json       -> Node project config (includes "resend" dependency)
/README.txt         -> This file

Env variables (important)
-------------------------
Set these in your local env or in Render:

- RESEND_API_KEY   = your Resend API key
- RESEND_FROM      = the "from" email (e.g. "Li Hair Salon <onboarding@resend.dev>")

If these are NOT set, the booking will still be created, but the email will be skipped.

How to run locally
------------------
1. Make sure you have Node.js installed.
2. In a terminal, go to the project folder:

   cd salon-site-email

3. Install dependencies:

   npm install

4. Set environment variables (example on Linux/macOS PowerShell style):

   On macOS / Linux:
     export RESEND_API_KEY=your_key_here
     export RESEND_FROM="Li Hair Salon <onboarding@resend.dev>"

   On Windows (PowerShell):
     setx RESEND_API_KEY "your_key_here"
     setx RESEND_FROM "Li Hair Salon <onboarding@resend.dev>"

   (Restart terminal after using setx on Windows.)

5. Start the server:

   npm start

6. Open in your browser:

   http://localhost:3000/

   - Booking page:  /
   - Admin page:    /admin.html  (once you place your full admin.html in /public)

Render deployment (quick)
-------------------------
1. Push this folder to a GitHub repo.
2. On Render:
   - New Web Service → connect repo.
   - Build command:  npm install
   - Start command:  npm start
3. In Render → Environment:
   - Add RESEND_API_KEY
   - Add RESEND_FROM
4. Deploy.
5. Test a booking on the live site and check the inbox of the email you used.

Notes
-----
- Data is stored in memory; restarting the server will clear bookings/staff/shifts.
- To change the email text, edit the sendBookingEmail() function in server.js.

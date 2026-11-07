TRACTOR ERP — COMPANY SERVER
============================

What this is
------------
A small server that gives the app multiple users, multiple devices and one
shared set of books. Each person signs in with their own username and
password; every device stays in step within a few seconds.

No internet is needed if everyone is in the same office. The server is one
Node.js file with no dependencies to install.

Requirements
------------
Node.js 14 or newer  —  https://nodejs.org  (free, Windows / Mac / Linux)

Starting it
-----------
  Windows : double-click  start-windows.bat
  Linux   : ./start-linux.sh
  Any     : node server.js

You will see:

    this computer : http://localhost:8080
    on the network: http://192.168.1.5:8080

Open that address in a browser — the app loads straight from the server.

First sign-in
-------------
  username: admin
  password: admin123

Change the password immediately (Sync & Backup -> Server -> Change my password).

Adding your staff
-----------------
Sync & Backup -> Server -> "Add / update a user". Give each person a username,
password and role:

  admin   — everything, including adding users
  manager — day-to-day work
  staff   — limited to the modules you list

The role and permissions travel to that person's device, so they only see
what they should.

Pointing the phone app at the server
------------------------------------
Android app -> Sync & Backup -> Server -> enter the address, username and
password -> Sign in. It then syncs every 10 seconds, and keeps working
offline when the phone is out of range.

Using it from outside the office
--------------------------------
Option 1 — office network only (simplest): nothing to do, just use the LAN
address shown when the server starts.

Option 2 — over the internet: forward port 8080 on your router to the server
machine, and use your static/public IP. Better: put the server behind a
reverse proxy (Caddy or nginx) with HTTPS and a domain name — the app accepts
https addresses too.

Your data
---------
Everything lives in the "data" folder next to server.js:

  users.json    accounts (passwords are scrypt-hashed, never stored in clear)
  devices.json  the latest copy of each device's books
  activity.log  sign-ins and user changes

Copy that folder somewhere safe every night — it is the whole company.

Security notes
--------------
* Change the admin password on day one.
* Keep the server on a UPS or at least let it shut down cleanly.
* If you expose it to the internet, use HTTPS. Passwords travel in the request
  body and must not cross an open network in clear.
* The server holds a copy of every device's books; each device also keeps its
  own offline copy and merges on reconnect, so a server outage stops syncing
  but never stops billing.

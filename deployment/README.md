# Deploy VMS at vms.time88.in

This deployment uses the existing landing page and application, served by the
Node/Express process on `127.0.0.1:5016`. Nginx is the only public web entry
point and proxies both `/api` and frontend routes to that process.

## Audit findings

- The existing landing page is `/`; its Login link goes to `/login`.
- Authenticated app routes are `/`, `/check-in`, `/visitors`, `/visitor-record/:id`,
  `/reports`, `/blacklist`, `/users`, `/notifications`, and `/settings`.
- A public visitor pass is served at `/visitor/:id`.
- Frontend: React + Vite + Wouter. Backend: Express + Drizzle + PostgreSQL.
- Browser API requests are relative paths such as `/api/...`; there is no
  production API hostname to configure.
- Auth is a bearer token in browser `localStorage`, sent in the
  `Authorization` header. The app does not use auth cookies or server sessions,
  so cookie `Secure`/`SameSite` settings do not apply.
- Express serves the Vite build and falls back to `index.html` for SPA routes.
- Build: `npm ci`, `npm run check`, `npm run build`. Production start:
  `node dist/index.js`.
- The existing listener used `0.0.0.0`; it now uses `HOST`, defaulting to
  `127.0.0.1`. Set `PORT=5016` and `HOST=127.0.0.1` for the private upstream.
- Same-origin deployment does not require CORS. The existing Express CORS
  middleware is retained to avoid changing other integrations.

## Tenant and authentication setup

The application now requires the organization/subscription migration before
serving authenticated routes. Existing records are assigned to a default
Business organization, and existing users must sign in again after deployment
because the token format is now signed and expires after seven days. Legacy
password hashes are upgraded to scrypt when the user next signs in.

The first super-admin is created from `SUPERADMIN_EMAIL` and
`SUPERADMIN_PASSWORD` at startup. The password must be at least 12 characters.
Changing those variables does not reset an already-created super-admin
password; manage that account through the normal account process.

Before deploying, back up PostgreSQL. For the existing VMS database, run
`npm run db:migrate` once before restarting the service. For a brand-new
database, first run `npm run db:push`, then `npm run db:migrate`. Do not run
`db:push:force` against the existing production database.

## Required production environment

Create `/etc/vms/vms.env` on the VPS with these variables:

```dotenv
NODE_ENV=production
HOST=127.0.0.1
PORT=5016
DATABASE_URL=postgresql://DB_USER:DB_PASSWORD@DB_HOST:5432/DB_NAME
SESSION_SECRET=REPLACE_WITH_A_UNIQUE_RANDOM_SECRET
SUPERADMIN_EMAIL=admin@example.com
SUPERADMIN_PASSWORD=REPLACE_WITH_A_UNIQUE_PASSWORD
SUPERADMIN_NAME=VMS Super Admin
APP_BASE_URL=https://vms.time88.in
MSG91_AUTH_KEY=
MSG91_SENDER_ID=
MSG91_TEMPLATE_REGISTRATION_LINK=
MSG91_TEMPLATE_SUBMISSION_CONFIRMATION=
MSG91_TEMPLATE_APPROVED=
MSG91_TEMPLATE_REJECTED=
MSG91_TEMPLATE_CANCELLED=
MSG91_TEMPLATE_RESCHEDULED=
MSG91_TEMPLATE_REMINDER=
MSG91_DLR_WEBHOOK_SECRET=
```

Use the real PostgreSQL connection details privately on the VPS. Generate a
secret with `openssl rand -hex 32`; do not commit it or paste it into chat.
Set a unique super-admin email and password in the VPS-only environment file.
There is no `VITE_API_URL` or frontend API URL variable: the browser uses the
same-origin `/api` path. Do not replace or copy over the project's existing
`.env` file.

Appointments and SMS are available on Business and Enterprise plans. Set
`APP_BASE_URL` to the public HTTPS origin. Configure the MSG91 auth key, Sender
ID, and the seven approved Flow template IDs above before sending SMS. Each
template must use the corresponding `var1`, `var2`, etc. fields sent by VMS and
must have the applicable India DLT registration. Set a random
`MSG91_DLR_WEBHOOK_SECRET` and configure MSG91's delivery-report callback to
`<APP_BASE_URL>/api/public/webhooks/msg91/dlr?secret=<that-secret>`. Provider
acceptance is shown as “sent”; only a delivery callback is shown as “delivered”.
Keep these credentials and the callback secret only in the server environment.
The supplied Nginx HTTPS configuration disables access logging for registration
and pass URLs (which contain bearer tokens) and the delivery callback (which
contains the webhook secret).

Template variables are positional: registration link (`visitor name`, appointment
number, registration URL); submission confirmation (`visitor name`, appointment
number); approval (`visitor name`, appointment number, pass URL, pass number,
appointment date/time); rejection and cancellation (`visitor name`, appointment
number, reason); rescheduling (`visitor name`, appointment number, new date/time,
pass URL, pass number); reminder (`visitor name`, appointment number, date/time,
pass number).

## DNS

At the DNS provider for `time88.in`, add only:

| Type | Name | Value | TTL |
|---|---|---|---|
| A | `vms` | `<HOSTINGER_VPS_PUBLIC_IP>` | Default |

Do not modify the apex `time88.in`, `www`, or any other existing records.
Wait for DNS propagation and verify `vms.time88.in` resolves to the VPS before
requesting the certificate.

## Hostinger VPS setup (Ubuntu)

Run commands as root or prefix them with `sudo`. Substitute your repository
URL and contact email; do not put credentials in the repository.

1. Install Nginx, Certbot, and Node.js 22 (Vite 7 requires a current Node 20 or
   22 release):

   ```sh
   apt update
   apt install -y ca-certificates curl gnupg nginx certbot python3-certbot-nginx
   install -d -m 0755 /etc/apt/keyrings
   curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
     | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
   chmod a+r /etc/apt/keyrings/nodesource.gpg
   echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" \
     > /etc/apt/sources.list.d/nodesource.list
   apt update
   apt install -y nodejs
   node --version
   npm --version
   ```

2. Create the service account and deploy the repository. If a target directory
   or Nginx site already exists, inspect it first; do not overwrite an existing
   application or site configuration:

   ```sh
   adduser --system --group --home /opt/vms --no-create-home vms
   install -d -o vms -g vms /opt/vms
   su -s /bin/sh vms -c 'git clone <YOUR_REPOSITORY_URL> /opt/vms'
   ```

   If deploying a source archive instead of Git, copy its contents into
   `/opt/vms` and set ownership with `chown -R vms:vms /opt/vms`.

3. Configure the environment and build:

   ```sh
   install -d -o root -g vms -m 0750 /etc/vms
   install -o root -g vms -m 0640 \
     /opt/vms/deployment/vms.env.example /etc/vms/vms.env
   nano /etc/vms/vms.env
   ```

   Replace the database placeholders and secret in the VPS-only environment
   file. Then build:

   ```sh
   su -s /bin/sh vms -c 'cd /opt/vms && npm ci && npm run check && npm run build'
   ```

   Use the database already provisioned for VMS. Back up the database, then
   apply the additive migration before the service starts:

   ```sh
   su -s /bin/sh vms -c 'cd /opt/vms && npm run db:migrate'
   ```

4. Install and start the systemd service:

   ```sh
   install -m 0644 /opt/vms/deployment/systemd/vms.service /etc/systemd/system/vms.service
   systemctl daemon-reload
   systemctl enable --now vms
   systemctl status vms --no-pager
   curl -i http://127.0.0.1:5016/
   ```

5. Add the temporary HTTP Nginx site. First verify that there is no existing
   site using this hostname. The commands below create a new uniquely named
   site and do not replace other sites:

   ```sh
   nginx -T 2>/dev/null | grep -n "server_name.*vms.time88.in" || true
   test ! -e /etc/nginx/sites-available/vms.time88.in
   install -m 0644 /opt/vms/deployment/nginx/vms.time88.in.http.conf \
     /etc/nginx/sites-available/vms.time88.in
   ln -s /etc/nginx/sites-available/vms.time88.in \
     /etc/nginx/sites-enabled/vms.time88.in
   nginx -t
   systemctl reload nginx
   ```

6. Request the Let's Encrypt certificate after DNS resolves correctly:

   ```sh
   certbot --nginx -d vms.time88.in --redirect --agree-tos -m <YOUR_EMAIL>
   certbot renew --dry-run
   ```

   Certbot installs and renews the certificate and sets up its renewal timer.
   The provided `vms.time88.in.https.conf` is the complete equivalent HTTPS
   configuration. After certificate issuance, it may be installed in place
   only if this hostname's site is the uniquely owned file above:

   ```sh
   install -m 0644 /opt/vms/deployment/nginx/vms.time88.in.https.conf \
     /etc/nginx/sites-available/vms.time88.in
   nginx -t
   systemctl reload nginx
   ```

7. In Hostinger's firewall (and UFW if enabled), allow inbound TCP ports 80 and
   443. Keep port 5016 closed to the internet; the service binds to loopback.
   Do not remove or change rules for SSH or other applications.

## Updating the deployment

After uploading a reviewed update:

```sh
su -s /bin/sh vms -c 'cd /opt/vms && npm ci && npm run check && npm run build'
su -s /bin/sh vms -c 'cd /opt/vms && npm run db:migrate'
systemctl restart vms
systemctl status vms --no-pager
journalctl -u vms -n 100 --no-pager
nginx -t && systemctl reload nginx
```

## Verification checklist

Run these checks only after DNS, Nginx, and the certificate are set up:

```sh
curl -I https://vms.time88.in/
curl -I https://vms.time88.in/login
curl -i https://vms.time88.in/api/auth/me
curl -I https://vms.time88.in/assets/
certbot renew --dry-run
```

The unauthenticated `/api/auth/me` request should return an authorization error
(normally HTTP 401), not an HTML page or 404. Use browser DevTools to verify
that JS/CSS assets load, the landing Login link opens `/login`, successful
login reaches `/`, refreshing a nested route works, and logout returns to `/`.
`/assets/` itself may return 404 because it is a directory; check the concrete
asset URLs referenced by the homepage instead.

DNS, VPS access, certificate issuance, public HTTPS, and browser behavior cannot
be verified from the development workspace. Do not treat the above commands as
evidence that deployment has occurred.

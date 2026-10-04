# Hosting Resource Scramble

Resource Scramble is a Node.js web server as well as a website. The server creates rooms, keeps the shared game state, and sends live updates to players. GitHub Pages can publish static files, but it cannot run this server, so Pages alone cannot host a playable multiplayer game. [GitHub Pages documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site)

## Recommended: one VPS with Nginx and Node.js

This setup serves the website and its API from one domain. The browser client already expects that arrangement, so no client URL changes are needed.

### 1. Prepare a server and domain

- Create a Linux VPS with a public IP address.
- Point your domain's `A` record (for example, `game.example.com`) to that IP address.
- Install Node.js 18 or newer and Nginx using your Linux distribution's package instructions.
- Allow inbound ports 80 and 443 through the VPS firewall. Keep port 3000 private; Nginx will connect to Node locally.

### 2. Put the project on the server

Clone this repository to a permanent location, such as `/srv/resource-scramble`. Use your repository URL in place of the placeholder:

```sh
sudo git clone <repository-url> /srv/resource-scramble
```

The app has no external npm packages to install. You can start it manually to check the deployment:

```sh
cd /srv/resource-scramble
npm start
```

The default port is `3000`. Visit `http://<server-ip>:3000` only for a temporary check; for normal access, use Nginx and HTTPS below. Stop the manual process before enabling the service.

### 3. Keep Node running with systemd

Create a dedicated service account and give it access to the project. Adjust ownership if you use a different account or directory:

```sh
sudo useradd --system --home /srv/resource-scramble --shell /usr/sbin/nologin scramble
sudo chown -R scramble:scramble /srv/resource-scramble
```

Create `/etc/systemd/system/resource-scramble.service`:

```ini
[Unit]
Description=Resource Scramble game server
After=network.target

[Service]
Type=simple
User=scramble
Group=scramble
WorkingDirectory=/srv/resource-scramble
Environment=PORT=3000
ExecStart=/usr/bin/node /srv/resource-scramble/server.js
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
```

Check that Node is at `/usr/bin/node` with `command -v node`; adjust `ExecStart` if it is elsewhere. Then enable and start the service:

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now resource-scramble
sudo systemctl status resource-scramble
```

### 4. Configure Nginx

Create an Nginx site configuration (often `/etc/nginx/sites-available/resource-scramble`) and replace `game.example.com` with your domain:

```nginx
server {
    listen 80;
    server_name game.example.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # The game uses Server-Sent Events for live room updates.
        proxy_buffering off;
        proxy_read_timeout 1h;
    }
}
```

Nginx buffers proxied responses by default. Turning buffering off lets the game's live event stream pass through as it arrives; the longer read timeout supports the open event connection. See the [Nginx proxy module documentation](https://nginx.org/en/docs/http/ngx_http_proxy_module.html).

Enable the site using the method for your distribution. On systems with `sites-available` and `sites-enabled`, for example:

```sh
sudo ln -s /etc/nginx/sites-available/resource-scramble /etc/nginx/sites-enabled/resource-scramble
sudo nginx -t
sudo systemctl reload nginx
```

### 5. Add HTTPS

After DNS points to the VPS and Nginx serves the domain over HTTP, follow [Certbot's Nginx instructions](https://certbot.eff.org/instructions?os=ubuntufocal&ws=nginx) for your operating system. Certbot can obtain a certificate and update the Nginx configuration to serve HTTPS. Test that the site opens at `https://game.example.com`.

## Using GitHub Pages for the front end

Pages can host static HTML, CSS, and JavaScript, but the Node API must still run on a separate server. To combine them, host the Node server on a VPS (optionally behind Nginx) and publish the front end from Pages. The client would need a configurable API origin for its `/api` requests and event stream, and the static asset paths need to work under the Pages URL. The API server's cross-origin settings would also need to allow the Pages origin. This requires code and deployment changes; it does not work by selecting this repository in Pages as-is.

## Room storage and uptime

Room state is currently held in server memory. A process restart clears active games, and this version should run as one Node process rather than behind multiple app instances. For longer-lived rooms or multiple server instances, add persistent shared storage before scaling out.

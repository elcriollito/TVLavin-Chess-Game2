# FICS Gateway Production Deployment Guide

Complete guide to deploy FICS WebSocket gateway with WSS (secure WebSocket) on a VPS.

## Overview

**Architecture:**
```
Browser (HTTPS) → wss://fics-gateway.caissa-chess.org (Nginx/TLS)
                → localhost:8081 (Gateway)
                → freechess.org:5000 (FICS)
```

**Requirements:**
- VPS with Ubuntu 20.04+ (or similar)
- Domain/subdomain: `fics-gateway.caissa-chess.org`
- Node.js 18+
- Nginx
- Let's Encrypt

---

## Part 1: VPS Setup

### Step 1: DNS Configuration

Create DNS A record pointing to your VPS:

```
Type: A
Host: fics-gateway
Value: YOUR_VPS_IP_ADDRESS
TTL: 3600 (or auto)
```

**Verify DNS propagation:**
```bash
# Wait 5-10 minutes, then test
dig fics-gateway.caissa-chess.org
nslookup fics-gateway.caissa-chess.org

# Should return your VPS IP
```

---

### Step 2: Connect to VPS

```bash
ssh root@YOUR_VPS_IP
# or
ssh your_user@YOUR_VPS_IP
```

---

### Step 3: Install Node.js

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18.x (LTS)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Verify installation
node --version  # Should show v18.x.x
npm --version   # Should show 9.x.x or higher
```

---

### Step 4: Install Nginx

```bash
sudo apt install -y nginx

# Verify installation
nginx -v

# Start and enable Nginx
sudo systemctl start nginx
sudo systemctl enable nginx

# Check status
sudo systemctl status nginx
```

---

### Step 5: Install Certbot (Let's Encrypt)

```bash
# Install Certbot and Nginx plugin
sudo apt install -y certbot python3-certbot-nginx

# Verify installation
certbot --version
```

---

### Step 6: Configure Firewall

```bash
# Allow SSH (if using UFW)
sudo ufw allow OpenSSH

# Allow HTTP and HTTPS
sudo ufw allow 'Nginx Full'

# Or manually:
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Enable firewall
sudo ufw enable

# Check status
sudo ufw status
```

---

## Part 2: Deploy Gateway Application

### Step 1: Create Application Directory

```bash
# Create app user (optional but recommended)
sudo useradd -m -s /bin/bash ficsgateway

# Or use your existing user
# Create app directory
sudo mkdir -p /opt/fics-gateway
sudo chown $USER:$USER /opt/fics-gateway
cd /opt/fics-gateway
```

---

### Step 2: Clone Repository (or Upload Files)

**Option A: Git clone (recommended)**
```bash
cd /opt/fics-gateway
git clone https://github.com/YOUR_USERNAME/TVLavin-Chess-Game2.git .
# Or just the gateway files:
# Copy gateway/fics-local-node/fics-gateway.cjs and package.json
```

**Option B: Manual upload**
```bash
# From your local machine:
scp gateway/fics-local-node/fics-gateway.cjs root@YOUR_VPS_IP:/opt/fics-gateway/
scp package.json root@YOUR_VPS_IP:/opt/fics-gateway/

# On VPS, create minimal package.json if needed:
cat > /opt/fics-gateway/package.json <<'EOF'
{
  "name": "fics-gateway",
  "version": "1.0.0",
  "type": "commonjs",
  "dependencies": {
    "ws": "^8.19.0"
  }
}
EOF
```

---

### Step 3: Install Dependencies

```bash
cd /opt/fics-gateway
npm install

# Verify ws is installed
ls -la node_modules/ws
```

---

### Step 4: Test Gateway Manually

```bash
# Test run (should start on port 8081)
node gateway/fics-local-node/fics-gateway.cjs

# You should see:
# [FICS Gateway] Starting...
# [FICS Gateway] WebSocket server listening on port 8081
# [FICS Gateway] Ready! Connect via ws://localhost:8081

# Press Ctrl+C to stop
```

---

## Part 3: Process Manager (PM2)

### Step 1: Install PM2 Globally

```bash
sudo npm install -g pm2

# Verify installation
pm2 --version
```

---

### Step 2: Create PM2 Ecosystem File

```bash
cat > /opt/fics-gateway/ecosystem.config.js <<'EOF'
module.exports = {
  apps: [{
    name: 'fics-gateway',
    script: './gateway/fics-local-node/fics-gateway.cjs',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '200M',
    env: {
      NODE_ENV: 'production',
      FICS_GATEWAY_PORT: 8081
    },
    error_file: '/var/log/fics-gateway/error.log',
    out_file: '/var/log/fics-gateway/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
  }]
};
EOF
```

---

### Step 3: Create Log Directory

```bash
sudo mkdir -p /var/log/fics-gateway
sudo chown $USER:$USER /var/log/fics-gateway
```

---

### Step 4: Start Gateway with PM2

```bash
cd /opt/fics-gateway

# Start the application
pm2 start ecosystem.config.js

# Check status
pm2 status

# View logs
pm2 logs fics-gateway

# Save PM2 process list
pm2 save

# Setup PM2 to start on boot
pm2 startup
# Follow the command it outputs (usually starts with sudo)
```

---

### Step 5: Verify Gateway is Running

```bash
# Check if port 8081 is listening
sudo netstat -tlnp | grep 8081
# or
sudo ss -tlnp | grep 8081

# Should show node process listening on 0.0.0.0:8081 or :::8081
```

---

## Part 4: Nginx Reverse Proxy Configuration

### Step 1: Create Nginx Configuration

```bash
sudo nano /etc/nginx/sites-available/fics-gateway
```

**Paste this configuration:**

```nginx
# FICS Gateway - WebSocket Reverse Proxy
# Domain: fics-gateway.caissa-chess.org

upstream fics_gateway {
    server 127.0.0.1:8081;
    keepalive 64;
}

# HTTP to HTTPS redirect
server {
    listen 80;
    listen [::]:80;
    server_name fics-gateway.caissa-chess.org;

    # Let's Encrypt ACME challenge
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    # Redirect all other HTTP to HTTPS
    location / {
        return 301 https://$server_name$request_uri;
    }
}

# HTTPS with WebSocket support
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name fics-gateway.caissa-chess.org;

    # SSL certificates (will be configured by Certbot)
    # ssl_certificate /etc/letsencrypt/live/fics-gateway.caissa-chess.org/fullchain.pem;
    # ssl_certificate_key /etc/letsencrypt/live/fics-gateway.caissa-chess.org/privkey.pem;

    # SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;

    # WebSocket proxy
    location / {
        proxy_pass http://fics_gateway;
        proxy_http_version 1.1;

        # WebSocket upgrade headers
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        # Standard proxy headers
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Timeouts for long-lived WebSocket connections
        proxy_connect_timeout 7d;
        proxy_send_timeout 7d;
        proxy_read_timeout 7d;

        # Buffering off for WebSocket
        proxy_buffering off;

        # Rate limiting (optional - uncomment to enable)
        # limit_req zone=fics_limit burst=10 nodelay;
    }

    # Health check endpoint (optional)
    location /health {
        access_log off;
        return 200 "FICS Gateway OK\n";
        add_header Content-Type text/plain;
    }
}

# Rate limiting zone (optional - uncomment to enable)
# limit_req_zone $binary_remote_addr zone=fics_limit:10m rate=30r/m;
```

---

### Step 2: Enable Site Configuration

```bash
# Create symlink to enable site
sudo ln -s /etc/nginx/sites-available/fics-gateway /etc/nginx/sites-enabled/

# Test Nginx configuration
sudo nginx -t

# Should output: "syntax is ok" and "test is successful"
```

---

### Step 3: Reload Nginx

```bash
sudo systemctl reload nginx

# Check status
sudo systemctl status nginx
```

---

## Part 5: SSL Certificate (Let's Encrypt)

### Step 1: Obtain Certificate

```bash
# Run Certbot for Nginx
sudo certbot --nginx -d fics-gateway.caissa-chess.org

# Follow the prompts:
# 1. Enter email address
# 2. Agree to Terms of Service
# 3. Choose whether to share email with EFF
# 4. Certbot will automatically configure SSL in Nginx
```

**Certbot will:**
- Obtain certificate from Let's Encrypt
- Update Nginx configuration with SSL directives
- Set up automatic renewal

---

### Step 2: Verify SSL Configuration

```bash
# Check Nginx config was updated
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx

# Test SSL certificate
openssl s_client -connect fics-gateway.caissa-chess.org:443 -servername fics-gateway.caissa-chess.org
```

---

### Step 3: Test Auto-Renewal

```bash
# Dry run renewal
sudo certbot renew --dry-run

# Should output: "Congratulations, all simulated renewals succeeded"

# Certbot automatically sets up cron job for renewal
# Check it's there:
sudo systemctl list-timers | grep certbot
```

---

## Part 6: Frontend Configuration

### Step 1: Update Gateway URL

**File: `js/fics-client.js` (line ~33)**

```javascript
// BEFORE (development)
gatewayUrl: 'ws://localhost:8081',

// AFTER (production)
gatewayUrl: 'wss://fics-gateway.caissa-chess.org',
```

**Or make it environment-aware:**

```javascript
gatewayUrl: window.location.hostname === 'localhost'
    ? 'ws://localhost:8081'
    : 'wss://fics-gateway.caissa-chess.org',
```

---

### Step 2: Update CSP (Content Security Policy)

**File: `index.html` (line ~7)**

**BEFORE:**
```html
connect-src 'self' ws://localhost:8081 ws://127.0.0.1:8081 https://...
```

**AFTER:**
```html
connect-src 'self' wss://fics-gateway.caissa-chess.org https://...
```

**Remove development URLs for production:**
- Remove `ws://localhost:8081`
- Remove `ws://127.0.0.1:8081`

**Final production CSP:**
```html
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-eval' https://code.jquery.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://*.clerk.accounts.dev https://challenges.cloudflare.com blob:; script-src-elem 'self' https://code.jquery.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://*.clerk.accounts.dev https://challenges.cloudflare.com blob:; style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://fonts.googleapis.com; img-src 'self' https://chessboardjs.com https://cdn.jsdelivr.net https://img.clerk.com https: data:; font-src 'self' https://cdnjs.cloudflare.com https://fonts.gstatic.com; worker-src 'self' blob:; connect-src 'self' wss://fics-gateway.caissa-chess.org https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://api.chess.com https://caissa-game-fetcher.elcriollito.workers.dev https://*.clerk.accounts.dev https://api.clerk.com https://api.stripe.com; frame-src 'self' https://*.clerk.accounts.dev https://challenges.cloudflare.com https://checkout.stripe.com https://js.stripe.com;">
```

---

### Step 3: Deploy Frontend Changes

```bash
# Commit and push changes
git add js/fics-client.js index.html
git commit -m "Update FICS gateway to production WSS endpoint"
git push origin main

# Vercel will auto-deploy
```

---

## Part 7: Verification & Testing

### Checklist

**1. DNS Resolution:**
```bash
dig fics-gateway.caissa-chess.org
# Should return your VPS IP
```

**2. Gateway Process Running:**
```bash
pm2 status
# fics-gateway should be "online"

pm2 logs fics-gateway --lines 50
# Should show gateway started successfully
```

**3. Port Listening:**
```bash
sudo netstat -tlnp | grep 8081
# Should show node listening on 8081
```

**4. Nginx Running:**
```bash
sudo systemctl status nginx
# Should be "active (running)"

curl -I https://fics-gateway.caissa-chess.org/health
# Should return 200 OK
```

**5. SSL Certificate:**
```bash
curl -I https://fics-gateway.caissa-chess.org/health
# Should show "HTTP/2 200"

# Check certificate expiry
echo | openssl s_client -connect fics-gateway.caissa-chess.org:443 2>/dev/null | openssl x509 -noout -dates
```

**6. WebSocket Connection:**
```bash
# Install wscat for testing
npm install -g wscat

# Test WebSocket connection
wscat -c wss://fics-gateway.caissa-chess.org

# Should connect and show:
# connected (press CTRL+C to quit)
```

**7. Browser Test:**
```
Open: https://caissa-chess.org
Navigate to: FICS section
Click: "Test Gateway"
Expected: "✅ Gateway is reachable!"
Click: "Connect"
Expected: "✅ Logged in as guest"
```

**8. Backend Logs:**
```bash
pm2 logs fics-gateway --lines 50

# Should show:
# [FICS Gateway] ✅ WS client connected: <IP>
# [FICS Gateway] 🔌 Initiating TCP connection to FICS...
# [FICS Gateway] ✅ TCP connected to FICS successfully
```

---

## Part 8: Monitoring & Maintenance

### PM2 Commands

```bash
# View status
pm2 status

# View logs (follow)
pm2 logs fics-gateway

# View last 100 lines
pm2 logs fics-gateway --lines 100

# Restart gateway
pm2 restart fics-gateway

# Stop gateway
pm2 stop fics-gateway

# Delete from PM2
pm2 delete fics-gateway

# View monitoring dashboard
pm2 monit
```

---

### Update Gateway Code

```bash
cd /opt/fics-gateway

# Pull latest changes
git pull origin main

# Install dependencies (if changed)
npm install

# Restart gateway
pm2 restart fics-gateway

# Check logs for errors
pm2 logs fics-gateway --lines 50
```

---

### Certificate Renewal

```bash
# Certificates auto-renew via systemd timer
# Manual renewal if needed:
sudo certbot renew

# Check renewal status
sudo certbot certificates
```

---

### Nginx Logs

```bash
# Access log
sudo tail -f /var/log/nginx/access.log

# Error log
sudo tail -f /var/log/nginx/error.log

# Gateway-specific logs
sudo grep fics-gateway /var/log/nginx/access.log
```

---

## Part 9: Security Enhancements (Optional)

### 1. Rate Limiting (Nginx)

Uncomment rate limiting in Nginx config:

```nginx
# At http level (top of file):
limit_req_zone $binary_remote_addr zone=fics_limit:10m rate=30r/m;

# In location block:
location / {
    limit_req zone=fics_limit burst=10 nodelay;
    # ... rest of proxy config
}
```

Reload Nginx:
```bash
sudo nginx -t && sudo systemctl reload nginx
```

---

### 2. IP Allowlist (Optional)

If you want to restrict access to specific IPs:

```nginx
# In server block, before location:
# Allow specific IPs
allow 1.2.3.4;  # Your office IP
allow 5.6.7.8;  # Your home IP
deny all;       # Block everyone else
```

---

### 3. Fail2Ban (Brute Force Protection)

```bash
sudo apt install -y fail2ban

# Create filter for repeated WebSocket connection failures
sudo nano /etc/fail2ban/filter.d/fics-gateway.conf
```

```ini
[Definition]
failregex = ^\[FICS Gateway\].*❌.*<HOST>
ignoreregex =
```

```bash
# Add jail configuration
sudo nano /etc/fail2ban/jail.local
```

```ini
[fics-gateway]
enabled = true
port = 443
filter = fics-gateway
logpath = /var/log/fics-gateway/out.log
maxretry = 10
findtime = 600
bantime = 3600
```

```bash
# Restart Fail2Ban
sudo systemctl restart fail2ban

# Check status
sudo fail2ban-client status fics-gateway
```

---

### 4. Firewall Rules (UFW)

```bash
# Limit SSH connections
sudo ufw limit OpenSSH

# Allow only necessary ports
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Deny all other incoming
sudo ufw default deny incoming
sudo ufw default allow outgoing

# Enable
sudo ufw enable
```

---

## Part 10: Troubleshooting

### Issue: Gateway won't start

```bash
# Check logs
pm2 logs fics-gateway

# Common causes:
# 1. Port 8081 already in use
sudo netstat -tlnp | grep 8081
# Kill process if needed

# 2. Missing dependencies
cd /opt/fics-gateway && npm install

# 3. Wrong Node version
node --version  # Should be 18+
```

---

### Issue: Can't connect to FICS

```bash
# Test FICS reachability from VPS
telnet freechess.org 5000

# Should connect and show FICS prompt
# If fails, check firewall outbound rules

# Check if VPS can resolve DNS
dig freechess.org
```

---

### Issue: SSL certificate error

```bash
# Re-run Certbot
sudo certbot --nginx -d fics-gateway.caissa-chess.org --force-renewal

# Check certificate
sudo certbot certificates

# Test SSL
curl -I https://fics-gateway.caissa-chess.org/health
```

---

### Issue: WebSocket upgrade fails

```bash
# Check Nginx error log
sudo tail -f /var/log/nginx/error.log

# Verify Nginx config
sudo nginx -t

# Common issue: Missing upgrade headers
# Make sure Nginx config has:
#   proxy_http_version 1.1;
#   proxy_set_header Upgrade $http_upgrade;
#   proxy_set_header Connection "upgrade";
```

---

### Issue: CORS or CSP errors

```bash
# Check browser console for CSP violations
# Verify CSP in index.html includes:
#   connect-src 'self' wss://fics-gateway.caissa-chess.org ...

# Test with curl
curl -H "Origin: https://caissa-chess.org" \
     -H "Upgrade: websocket" \
     -H "Connection: Upgrade" \
     -I https://fics-gateway.caissa-chess.org/
```

---

## Summary Commands

```bash
# Quick deployment from scratch:

# 1. DNS setup (external)
# 2. Connect to VPS
ssh root@YOUR_VPS_IP

# 3. Install everything
sudo apt update && sudo apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs nginx certbot python3-certbot-nginx
sudo npm install -g pm2

# 4. Setup firewall
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable

# 5. Deploy app
sudo mkdir -p /opt/fics-gateway
cd /opt/fics-gateway
# Upload files or git clone
npm install

# 6. Start with PM2
pm2 start gateway/fics-local-node/fics-gateway.cjs --name fics-gateway
pm2 save
pm2 startup

# 7. Configure Nginx
sudo nano /etc/nginx/sites-available/fics-gateway
# Paste config from Part 4
sudo ln -s /etc/nginx/sites-available/fics-gateway /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# 8. Get SSL certificate
sudo certbot --nginx -d fics-gateway.caissa-chess.org

# 9. Test
wscat -c wss://fics-gateway.caissa-chess.org

# 10. Update frontend (local machine)
# Edit js/fics-client.js and index.html
# git add, commit, push
```

---

## Cost Estimate

**VPS Requirements:**
- CPU: 1 core (sufficient)
- RAM: 512MB - 1GB
- Storage: 10GB
- Bandwidth: 1TB/month

**Estimated costs:**
- DigitalOcean Droplet: $6/month
- Linode Nanode: $5/month
- Vultr: $5/month
- Hetzner: €4.51/month

**Domain:** Already have caissa-chess.org

**SSL Certificate:** Free (Let's Encrypt)

---

## Alternative: Caddy Server (Simpler)

If you prefer automatic HTTPS without manual Certbot:

```bash
# Install Caddy
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install caddy

# Configure Caddy
sudo nano /etc/caddy/Caddyfile
```

**Caddyfile:**
```
fics-gateway.caissa-chess.org {
    reverse_proxy localhost:8081
}
```

```bash
# Reload Caddy
sudo systemctl reload caddy

# That's it! Caddy automatically gets SSL certificate
```

---

**Deployment complete!** 🚀

Your FICS gateway is now running at `wss://fics-gateway.caissa-chess.org` with automatic SSL and WebSocket support.

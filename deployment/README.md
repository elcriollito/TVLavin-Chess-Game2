# FICS Gateway Deployment Files

Production deployment configuration files for FICS WebSocket gateway.

## Files

### 1. `nginx-fics-gateway.conf`
Nginx reverse proxy configuration with:
- HTTP to HTTPS redirect
- WebSocket upgrade headers
- SSL/TLS configuration
- Security headers
- Health check endpoint

**Usage:**
```bash
sudo cp nginx-fics-gateway.conf /etc/nginx/sites-available/fics-gateway
sudo ln -s /etc/nginx/sites-available/fics-gateway /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### 2. `pm2-ecosystem.config.js`
PM2 process manager configuration with:
- Auto-restart on crash
- Log management
- Memory limits
- Environment variables

**Usage:**
```bash
pm2 start pm2-ecosystem.config.js
pm2 save
pm2 startup
```

### 3. `deploy.sh`
Automated deployment script that:
- Installs all dependencies (Node, Nginx, Certbot, PM2)
- Configures firewall
- Sets up application
- Obtains SSL certificate

**Usage:**
```bash
# On VPS as root:
sudo bash deploy.sh
```

**Before running, edit:**
- Line 11: Set your GitHub repo URL
- Line 101: Set your email for Let's Encrypt

## Quick Start

```bash
# 1. SSH to VPS
ssh root@YOUR_VPS_IP

# 2. Clone repo
git clone https://github.com/YOUR_USERNAME/TVLavin-Chess-Game2.git
cd TVLavin-Chess-Game2

# 3. Edit deploy.sh (repo URL and email)
nano deployment/deploy.sh

# 4. Run deployment
chmod +x deployment/deploy.sh
sudo ./deployment/deploy.sh

# 5. Verify
pm2 status
wscat -c wss://fics-gateway.caissa-chess.org
```

## Manual Steps (Alternative)

See [FICS-DEPLOYMENT.md](../FICS-DEPLOYMENT.md) for detailed step-by-step instructions.

## Production Checklist

- [ ] DNS A record created: `fics-gateway.caissa-chess.org → VPS_IP`
- [ ] VPS firewall allows ports 80, 443
- [ ] Gateway running: `pm2 status` shows "online"
- [ ] Nginx configured and running
- [ ] SSL certificate obtained: `sudo certbot certificates`
- [ ] WebSocket connection works: `wscat -c wss://fics-gateway.caissa-chess.org`
- [ ] Frontend updated: `gatewayUrl: 'wss://fics-gateway.caissa-chess.org'`
- [ ] Frontend CSP updated: `connect-src ... wss://fics-gateway.caissa-chess.org`
- [ ] Production ws:// URLs removed from CSP
- [ ] Test from browser: FICS section → Test Gateway → Connect

## Monitoring

```bash
# PM2 status
pm2 status

# View logs
pm2 logs fics-gateway

# Real-time monitoring
pm2 monit

# Nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log

# Gateway logs
sudo tail -f /var/log/fics-gateway/out.log
```

## Maintenance

```bash
# Update code
cd /opt/fics-gateway
git pull origin main
npm install
pm2 restart fics-gateway

# Renew SSL (automatic, but manual if needed)
sudo certbot renew

# Check certificate expiry
sudo certbot certificates
```

## Troubleshooting

**Gateway won't start:**
```bash
pm2 logs fics-gateway --lines 100
pm2 restart fics-gateway
```

**WebSocket connection fails:**
```bash
# Check Nginx
sudo nginx -t
sudo systemctl status nginx

# Check gateway is listening
sudo netstat -tlnp | grep 8081

# Test locally
wscat -c ws://localhost:8081
```

**SSL certificate issues:**
```bash
# Check certificate
sudo certbot certificates

# Renew manually
sudo certbot --nginx -d fics-gateway.caissa-chess.org --force-renewal
```

## Support

See [FICS-DEPLOYMENT.md](../FICS-DEPLOYMENT.md) for comprehensive troubleshooting and detailed instructions.

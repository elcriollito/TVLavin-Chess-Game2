#!/bin/bash
# FICS Gateway Deployment Script
# Run this on your VPS after initial setup

set -e  # Exit on error

echo "🚀 FICS Gateway Deployment Script"
echo "=================================="
echo ""

# Configuration
APP_DIR="/opt/fics-gateway"
DOMAIN="fics-gateway.caissa-chess.org"
REPO_URL="https://github.com/YOUR_USERNAME/TVLavin-Chess-Game2.git"  # UPDATE THIS

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Functions
print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
    exit 1
}

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    print_error "Please run as root (use sudo)"
fi

echo "Step 1: Installing dependencies..."
apt update
apt install -y curl git

# Install Node.js if not present
if ! command -v node &> /dev/null; then
    echo "Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
    apt install -y nodejs
    print_success "Node.js installed"
else
    print_success "Node.js already installed ($(node --version))"
fi

# Install Nginx if not present
if ! command -v nginx &> /dev/null; then
    echo "Installing Nginx..."
    apt install -y nginx
    systemctl enable nginx
    systemctl start nginx
    print_success "Nginx installed"
else
    print_success "Nginx already installed"
fi

# Install Certbot if not present
if ! command -v certbot &> /dev/null; then
    echo "Installing Certbot..."
    apt install -y certbot python3-certbot-nginx
    print_success "Certbot installed"
else
    print_success "Certbot already installed"
fi

# Install PM2 if not present
if ! command -v pm2 &> /dev/null; then
    echo "Installing PM2..."
    npm install -g pm2
    print_success "PM2 installed"
else
    print_success "PM2 already installed"
fi

echo ""
echo "Step 2: Creating application directory..."
mkdir -p $APP_DIR
cd $APP_DIR

echo ""
echo "Step 3: Cloning/updating repository..."
if [ -d ".git" ]; then
    print_warning "Repository already exists, pulling latest..."
    git pull origin main
else
    git clone $REPO_URL .
fi
print_success "Repository ready"

echo ""
echo "Step 4: Installing Node dependencies..."
npm install
print_success "Dependencies installed"

echo ""
echo "Step 5: Creating log directory..."
mkdir -p /var/log/fics-gateway
print_success "Log directory created"

echo ""
echo "Step 6: Starting application with PM2..."
if pm2 list | grep -q "fics-gateway"; then
    print_warning "Application already running, restarting..."
    pm2 restart fics-gateway
else
    pm2 start gateway/fics-local-node/fics-gateway.cjs --name fics-gateway
fi
pm2 save
print_success "Application started"

echo ""
echo "Step 7: Configuring PM2 startup..."
pm2 startup systemd -u root --hp /root
print_success "PM2 startup configured"

echo ""
echo "Step 8: Configuring firewall..."
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow OpenSSH
ufw --force enable
print_success "Firewall configured"

echo ""
echo "Step 9: Configuring Nginx..."
cp deployment/nginx-fics-gateway.conf /etc/nginx/sites-available/fics-gateway
ln -sf /etc/nginx/sites-available/fics-gateway /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default  # Remove default site
nginx -t
systemctl reload nginx
print_success "Nginx configured"

echo ""
echo "Step 10: Obtaining SSL certificate..."
echo ""
print_warning "About to run Certbot for $DOMAIN"
print_warning "Make sure DNS is configured and pointing to this server!"
echo ""
read -p "Continue with Certbot? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    certbot --nginx -d $DOMAIN --non-interactive --agree-tos --email YOUR_EMAIL@example.com || print_warning "Certbot failed - run manually: sudo certbot --nginx -d $DOMAIN"
    print_success "SSL certificate obtained"
else
    print_warning "Skipping Certbot - run manually later: sudo certbot --nginx -d $DOMAIN"
fi

echo ""
echo "=================================="
echo -e "${GREEN}🎉 Deployment complete!${NC}"
echo "=================================="
echo ""
echo "Next steps:"
echo "1. Check gateway status: pm2 status"
echo "2. View logs: pm2 logs fics-gateway"
echo "3. Test connection: wscat -c wss://$DOMAIN"
echo "4. Update frontend gatewayUrl to wss://$DOMAIN"
echo "5. Update frontend CSP to allow wss://$DOMAIN"
echo ""
echo "Monitoring:"
echo "  pm2 monit              - Real-time monitoring"
echo "  pm2 logs fics-gateway  - View logs"
echo "  nginx -t               - Test Nginx config"
echo ""

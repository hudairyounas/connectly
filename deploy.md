# Connectly — AWS EC2 Free Tier (6-Month Plan) Step-by-Step Deployment Guide

This guide walks you through deploying **Connectly** (React + Vite frontend, Node.js + Express + Socket.IO backend, and MongoDB) on a single **AWS EC2 Free Tier** instance running **Ubuntu 24.04 LTS** **without Docker**, using **PM2** and **Nginx**.

---

## Architecture on AWS EC2

```mermaid
flowchart LR
    User["Browser / Mobile Client"] -->|HTTP :80 / HTTPS :443| Nginx["Nginx Reverse Proxy"]
    Nginx -->|Static Files| ClientDist["/var/www/connectly/client/dist"]
    Nginx -->|/api/v1/*| Express["Node.js + Express (127.0.0.1:5000)"]
    Nginx -->|/socket.io/* (WebSocket Upgrade)| SocketIO["Socket.IO Gateway (127.0.0.1:5000)"]
    Express --> Mongo["MongoDB (127.0.0.1:27017 or Atlas Free M0)"]
    Express --> Uploads["/var/www/connectly/uploads_storage"]
```

---

## Phase 1: Launch Your AWS EC2 Instance (Free Tier Safe)

1. **Sign in to the AWS Console** and open the **EC2 Dashboard**.
2. Click **Launch instance** and configure the following settings:
   - **Name:** `connectly-production`
   - **Application and OS Images (AMI):** Select **Ubuntu Server 24.04 LTS (HVM), SSD Volume Type** (64-bit x86) — marked **Free tier eligible**.
   - **Instance Type:** Select **`t3.micro`** or **`t2.micro`** (1 vCPU, 1 GB RAM — Free tier eligible).
   - **Key Pair (login):**
     - Click **Create new key pair**.
     - Name: `connectly-key`
     - Key pair type: `RSA`
     - Private key file format: `.pem`
     - Save `connectly-key.pem` to a safe folder on your computer (e.g., `C:\Users\<YourName>\.ssh\connectly-key.pem`).
   - **Network Settings (Security Group):**
     Click **Edit** and configure these exact Inbound Rules:

     | Type | Protocol | Port Range | Source | Purpose |
     |---|---|---|---|---|
     | **SSH** | TCP | `22` | `0.0.0.0/0` (or EC2 Instance Connect) | Initial browser terminal access |
     | **Custom TCP** | TCP | `2222` | **My IP** (or `0.0.0.0/0`) | Custom SSH port (bypasses ISP port 22 block) |
     | **HTTP** | TCP | `80` | `0.0.0.0/0`, `::/0` | Web traffic & Let's Encrypt verification |
     | **HTTPS** | TCP | `443` | `0.0.0.0/0`, `::/0` | Secure HTTPS & WSS traffic |

     > [!IMPORTANT]
     > Do **NOT** open port `5000` (Node.js) or port `27017` (MongoDB) in your AWS Security Group. Nginx will proxy traffic internally to `127.0.0.1:5000`, keeping your backend and database completely hidden from direct public access.

   - **Configure Storage:**
     - Set size to **`20 GiB`** or **`25 GiB`** `gp3` (AWS Free Tier includes up to 30 GB of EBS storage).
3. Click **Launch instance**.

---

## Phase 2: Shift SSH from Port 22 to Port 2222 & Connect from PowerShell

Because your ISP blocks outbound Port `22`, you cannot initially connect from PowerShell on port `22`. Instead, you will use **AWS EC2 Instance Connect** (which runs inside your web browser over HTTPS port `443`) to switch SSH to port **`2222`**.

### Step 2.1: Open Port `2222` in Your AWS Security Group
1. Go to **EC2 Dashboard** → **Instances** → click your instance.
2. Click the **Security** tab at the bottom → click your **Security Group** link.
3. Click **Edit inbound rules** → **Add rule**:
   - **Type:** `Custom TCP`
   - **Port range:** `2222`
   - **Source:** `Anywhere-IPv4` (`0.0.0.0/0`) or `My IP`
4. Click **Save rules**.

### Step 2.2: Open the Browser Terminal via EC2 Instance Connect
1. Go back to **EC2 Dashboard** → select your instance → click **Connect** (top right).
2. Select the **EC2 Instance Connect** tab and click **Connect**.
   *(This opens a Linux terminal directly in your browser over HTTPS port 443, bypassing your ISP's port 22 block!)*

### Step 2.3: Change SSH to Listen on Port `2222` (Ubuntu 24.04 LTS & 22.04 LTS)
> [!WARNING]
> **Ubuntu 24.04 LTS Important Note:** Ubuntu 24.04 uses `systemd` socket activation (`ssh.socket`) by default. Editing `/etc/ssh/sshd_config` alone will **not** change the port on Ubuntu 24.04 unless you also update `ssh.socket`!

Run the following block of commands in the browser terminal to enable **both** Port `22` (so AWS Browser Connect still works) and Port `2222` (so your local PowerShell works):

```bash
# 1. Configure systemd ssh.socket (Ubuntu 22.10 / 24.04+) to listen on both 22 and 2222
sudo mkdir -p /etc/systemd/system/ssh.socket.d
cat << 'EOF' | sudo tee /etc/systemd/system/ssh.socket.d/listen.conf
[Socket]
ListenStream=
ListenStream=22
ListenStream=2222
EOF

# 2. Also add Port 22 and Port 2222 to /etc/ssh/sshd_config
sudo sed -i '/^#*Port /d' /etc/ssh/sshd_config
echo -e "Port 22\nPort 2222" | sudo tee -a /etc/ssh/sshd_config

# 3. If UFW firewall is enabled on Ubuntu, allow port 2222
sudo ufw allow 2222/tcp || true

# 4. Reload systemd and restart SSH
sudo systemctl daemon-reload
sudo systemctl restart ssh.socket || true
sudo systemctl restart ssh

# 5. Verify SSH is now listening on port 2222
sudo ss -tulpn | grep -E '22|2222'
```

You should see output showing `0.0.0.0:2222` and `[::]:2222` listening!

### Step 2.4: Connect from Windows PowerShell Using `-p 2222`
Now open **PowerShell** on your Windows PC and pass **`-p 2222`** to the `ssh` command:

```powershell
ssh -p 2222 -i "C:\path\to\connectly-key.pem" ubuntu@<YOUR_EC2_PUBLIC_IP>
```

Type `yes` when prompted to trust the host fingerprint.

*(Optional: You can also automate this at instance creation time by pasting the commands from Step 2.3 into **Advanced details → User data** when launching the EC2 instance!)*

---

## Phase 3: Add a 2 GB Swap File (Critical for 1 GB RAM Free Tier!)

Free Tier instances (`t2.micro` / `t3.micro`) only have **1 GB of RAM**. Compiling TypeScript and Vite (`npm run build`) alongside MongoDB can easily exceed 1 GB RAM and freeze the server unless you add swap space.

Run these commands on your EC2 Ubuntu terminal:

```bash
# 1. Allocate a 2 GB swap file
sudo fallocate -l 2G /swapfile

# 2. Secure permissions
sudo chmod 600 /swapfile

# 3. Format and enable swap
sudo mkswap /swapfile
sudo swapon /swapfile

# 4. Make swap permanent across reboots
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# 5. Verify swap is active (you should see 2.0Gi Swap)
free -h
```

---

## Phase 4: Install Node.js, Nginx, PM2, and MongoDB

### 4.1 Update Ubuntu & Install System Packages + Nginx
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git build-essential nginx ufw
```

### 4.2 Install Node.js 22 LTS & PM2
```bash
# Install Node.js 22.x via NodeSource
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# Verify versions
node -v
npm -v

# Install PM2 globally to keep the backend running 24/7
sudo npm install -g pm2
```

### 4.3 Set Up MongoDB (Choose Option A or Option B)

#### Option A (Recommended for 1 GB RAM EC2): Free MongoDB Atlas (M0 Cluster)
Using a free **MongoDB Atlas M0** cluster saves ~400 MB of RAM on your EC2 instance:
1. Create a free **M0** cluster at [mongodb.com/atlas](https://www.mongodb.com/atlas) in the **same AWS region** as your EC2 instance.
2. Under **Database Access**, create a database user and password.
3. Under **Network Access**, add your **EC2 Public IPv4 address** (`<YOUR_EC2_PUBLIC_IP>/32`).
4. Copy the connection string (`mongodb+srv://<user>:<password>@cluster0.xxxx.mongodb.net/connectly?retryWrites=true&w=majority`).

#### Option B: Install MongoDB 8.0 Community Edition Locally on EC2
If you prefer to run MongoDB directly on the EC2 instance:
```bash
curl -fsSL https://www.mongodb.org/static/pgp/server-8.0.asc | \
   sudo gpg -o /usr/share/keyrings/mongodb-server-8.0.gpg --dearmor

echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-8.0.gpg ] https://repo.mongodb.org/apt/ubuntu noble/mongodb-org/8.0 multiverse" | \
   sudo tee /etc/apt/sources.list.d/mongodb-org-8.0.list

sudo apt update
sudo apt install -y mongodb-org

# Start and enable MongoDB on boot (bound to 127.0.0.1 by default)
sudo systemctl enable --now mongod
sudo systemctl status mongod
```

---

## Phase 5: Clone, Configure, and Build Connectly

### 5.1 Push Your Code to GitHub & Clone onto EC2
First, push your local `f:\argon_chat` repository to a private GitHub repository. Then on your EC2 server:

```bash
sudo mkdir -p /var/www/connectly
sudo chown -R $USER:$USER /var/www/connectly

git clone https://github.com/<your-username>/<your-repo>.git /var/www/connectly
cd /var/www/connectly
```

### 5.2 Generate Cryptographic JWT Secrets
Run this command twice on EC2 to generate two strong 64-character random secrets:

```bash
node -e "console.log('ACCESS_TOKEN_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log('REFRESH_TOKEN_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"
```

### 5.3 Create `server/.env`
 Determine your domain or public URL:
- If you have a domain (or free DuckDNS / nip.io domain, see Phase 7): `https://your-domain.com`
- If testing via raw EC2 IP over HTTP first: `http://<YOUR_EC2_PUBLIC_IP>`

Create `/var/www/connectly/server/.env`:

```bash
nano /var/www/connectly/server/.env
```

Paste the following (replace placeholders with your values):

```env
NODE_ENV=production
PORT=5000
APP_NAME=Connectly
CLIENT_ORIGIN=http://<YOUR_EC2_PUBLIC_IP>
MONGODB_URI=mongodb://127.0.0.1:27017/connectly
ACCESS_TOKEN_SECRET=<PASTE_GENERATED_ACCESS_SECRET>
REFRESH_TOKEN_SECRET=<PASTE_GENERATED_REFRESH_SECRET>
ACCESS_TOKEN_TTL=15m
REFRESH_TOKEN_TTL=7d
COOKIE_DOMAIN=
STORAGE_PROVIDER=local
STORAGE_LOCAL_DIR=/var/www/connectly/uploads_storage
MAX_MESSAGE_LENGTH=4000
MAX_FILE_SIZE_BYTES=10485760
MAX_GROUP_MEMBERS=100
DEFAULT_PAGE_SIZE=30
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
SMTP_FROM=no-reply@connectly.local
```

> [!WARNING]
> **Important Note on `NODE_ENV=production` and HTTPS Cookies:**
> When `NODE_ENV=production` is set, the backend sets `Secure: true` on the `refreshToken` cookie, which browsers **only** send over `HTTPS`.
> - If you are accessing the site over `http://<YOUR_EC2_PUBLIC_IP>` **without HTTPS**, set `NODE_ENV=development` temporarily until you enable HTTPS in Phase 7.
> - Once HTTPS is active (Phase 7), set `NODE_ENV=production` and `CLIENT_ORIGIN=https://<YOUR_DOMAIN>`.

### 5.4 Create `client/.env`
```bash
cat << 'EOF' > /var/www/connectly/client/.env
VITE_APP_NAME=Connectly
VITE_API_BASE_URL=/api/v1
VITE_SOCKET_URL=
EOF
```

### 5.5 Install Dependencies & Build Both Applications
```bash
cd /var/www/connectly

# Install backend & frontend dependencies
npm --prefix server install
npm --prefix client install

# Create attachment storage directory outside the web root
mkdir -p /var/www/connectly/uploads_storage

# Compile TypeScript backend (server/dist) and Vite production bundle (client/dist)
npm run build
```

---

## Phase 6: Start Backend with PM2 & Configure Nginx

### 6.1 Start the Node.js Server with PM2
```bash
cd /var/www/connectly/server

# Start compiled server
pm2 start dist/server.js --name "connectly-api"

# Save PM2 process list and configure auto-start on EC2 reboot
pm2 save
pm2 startup
# (Copy and run the `sudo env PATH=...` command that PM2 prints out)
```

Verify the backend is healthy locally:
```bash
curl http://127.0.0.1:5000/api/v1/health
```
You should receive `{"success":true,"data":{"status":"ok","appName":"Connectly","database":"connected",...}}`.

### 6.2 Configure Nginx for React SPA, REST API, and Socket.IO WebSockets
Create the Nginx site configuration:

```bash
sudo nano /etc/nginx/sites-available/connectly
```

Paste this configuration (replace `<YOUR_EC2_PUBLIC_IP_OR_DOMAIN>` with your EC2 Public IP or domain name):

```nginx
server {
    listen 80;
    server_name <YOUR_EC2_PUBLIC_IP_OR_DOMAIN>;

    # Allow file uploads up to 12 MB (Connectly enforces 10 MB max in Multer)
    client_max_body_size 12M;

    # Serve compiled React + Vite frontend static files
    root /var/www/connectly/client/dist;
    index index.html;

    # Gzip compression for fast asset delivery
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;

    # 1. Proxy REST API requests to Node.js backend
    location /api/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # 2. Proxy Socket.IO (Polling + WebSocket Upgrade)
    location /socket.io/ {
        proxy_pass http://127.0.0.1:5000/socket.io/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }

    # 3. React Router SPA fallback (all other routes serve index.html)
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Enable the site and restart Nginx:

```bash
# Disable default Nginx placeholder site
sudo rm -f /etc/nginx/sites-enabled/default

# Enable Connectly site
sudo ln -s /etc/nginx/sites-available/connectly /etc/nginx/sites-enabled/

# Test Nginx syntax
sudo nginx -t

# Reload Nginx
sudo systemctl restart nginx
```

Now open `http://<YOUR_EC2_PUBLIC_IP>` in your browser — **Connectly is live!**

---

## Phase 7: Enable Free HTTPS with Let's Encrypt (Certbot)

To run with `NODE_ENV=production` (which enables `Secure` cookies) and encrypted WebSockets (`wss://`), enable HTTPS using **Certbot**.

> [!TIP]
> **Don't own a domain name?**
> You can register a free subdomain at [DuckDNS.org](https://www.duckdns.org) (e.g., `connectly-chat.duckdns.org`) and point it to your `<YOUR_EC2_PUBLIC_IP>` in 60 seconds!

1. **Update `server_name` in `/etc/nginx/sites-available/connectly`** to your domain (e.g., `server_name connectly-chat.duckdns.org;`) and run `sudo systemctl reload nginx`.
2. **Install Certbot and issue a free SSL certificate:**

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d <YOUR_DOMAIN>
```

3. **Update `/var/www/connectly/server/.env`** to use `https://`:
```env
NODE_ENV=production
CLIENT_ORIGIN=https://<YOUR_DOMAIN>
```

4. **Restart the backend:**
```bash
pm2 restart connectly-api
```

Certbot automatically configures SSL renewal (`sudo systemctl status certbot.timer`).

---

## Phase 8: How to Deploy Future Code Updates

Whenever you push new commits to GitHub, run these commands on your EC2 instance to update your live deployment with zero hassle:

```bash
cd /var/www/connectly
git pull origin main

npm --prefix server install
npm --prefix client install
npm run build

pm2 restart connectly-api
sudo systemctl reload nginx
```

---

## Phase 9: AWS Free Tier Cost Protection & Troubleshooting

### 1. Avoid Unexpected AWS Charges on the 6-Month Free Tier
- **Public IPv4 Address Note:** AWS includes 750 hours/month of free public IPv4 usage for running EC2 Free Tier instances, or uses your Free Tier credits on the new 6-month credit plan. Do **not** allocate extra unattached Elastic IPs.
- **Stop vs. Terminate:** If you no longer need the server after testing, **Terminate** the EC2 instance and delete its EBS volume so no storage charges accrue.
- **Set a Billing Alert:** In the AWS Console → **Billing and Cost Management** → **Budgets**, create a **Zero-Spend Budget** or **$1.00 Alert** with your email address.

### 2. Useful Diagnostic Commands on EC2

| Task | Command |
|---|---|
| Check PM2 process status & RAM usage | `pm2 status` |
| Stream live backend logs | `pm2 logs connectly-api --lines 100` |
| Check Nginx error logs | `sudo tail -f /var/log/nginx/error.log` |
| Check MongoDB service status | `sudo systemctl status mongod` |
| Check available RAM & Swap | `free -h` |
| Check disk space | `df -h` |

### 3. Common Troubleshooting Fixes
- **`502 Bad Gateway` from Nginx:**
  - The Node.js server on port `5000` is not running. Run `pm2 logs connectly-api` to inspect why it stopped (usually a missing variable in `server/.env` or MongoDB not running).
- **WebSocket connection fails on EC2:**
  - Verify your `/etc/nginx/sites-available/connectly` has the `location /socket.io/` block with `proxy_set_header Upgrade $http_upgrade;` and `proxy_set_header Connection "upgrade";`.
  - Ensure `CLIENT_ORIGIN` in `server/.env` matches the exact URL in your browser address bar (including `http://` vs `https://` and no trailing slash).
- **Session logs out immediately on page refresh:**
  - If you are visiting via `http://` (not `https://`), `NODE_ENV=production` sets `Secure: true` on the `refreshToken` cookie, causing the browser to reject the cookie over plain HTTP. Either enable HTTPS (Phase 7) or set `NODE_ENV=development` while testing on plain HTTP.

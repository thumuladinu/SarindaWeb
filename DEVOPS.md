# Server Setup & Deployment Guide

Follow these steps to deploy your application to the Hetzner VPS with your domain `is.bridgitalsolutions.com`.

## 1. Purchase & Connect to VPS
1.  **Buy the VPS**: Select **Ubuntu 22.04** or **24.04** as the OS.
2.  **Get IP & Password**: Note the IP address and root password (sent via email usually).
3.  **SSH into Server**:
    ```bash
    ssh root@<YOUR_SERVER_IP>
    ```

## 2. Domain & SSL Setup (Cloudflare)
1.  **Cloudflare DNS**:
    - Go to your Cloudflare Dashboard for `bridgitalsolutions.com`.
    - Add an **A Record**:
        - Name: `is`
        - Content: `<YOUR_VPS_IP_ADDRESS>`
        - Proxy status: **Proxied (Orange Cloud)** is recommended for free SSL and protection.

2.  **SSL Configuration (On Host)**:
    Since Cloudflare handles SSL at the edge, you can use the flexible mode or strictly set up a self-signed or Let's Encrypt certificate on the origin.
    *Easiest Method (Cloudflare Proxied)*: ensure Cloudflare SSL/TLS setting is **Flexible** or **Full**.
    
    *Recommended Method (Strict SSL)*:
    Run this on the server to get a real certificate (requires Port 80 open):
    ```bash
    apt install -y certbot python3-certbot-nginx
    # Run after Nginx is set up (step 3)
    ```

## 3. Initial Server Setup
Run the following commands on the server to set up the environment.

1.  **Clone your Repository**:
    ```bash
    # Create directory
    mkdir -p /var/www
    cd /var/www

    # Clone the repo (You may need to use HTTPS or setup an SSH key for GitHub)
    git clone https://github.com/<YOUR_USERNAME>/<YOUR_REPO_NAME>.git sarinda-pos
    ```

2.  **Run the Setup Script**:
    ```bash
    cd /var/www/sarinda-pos/devops
    chmod +x setup.sh
    ./setup.sh
    ```

3.  **Configure Nginx**:
    ```bash
    cp nginx.conf /etc/nginx/sites-available/sarinda
    ln -s /etc/nginx/sites-available/sarinda /etc/nginx/sites-enabled/
    rm /etc/nginx/sites-enabled/default
    nginx -t
    systemctl restart nginx
    ```
    
    **SSL Setup (Recommended)**:
    ```bash
    certbot --nginx -d is.bridgitalsolutions.com
    ```
    *Follow the prompts.*

## 4. Database & Backend Configuration
1.  **Setup Database**:
    Log in to MySQL:
    ```bash
    mysql -u root
    ```
    Inside MySQL shell:
    ```sql
    CREATE DATABASE chamika_rice_mill;
    EXIT;
    ```
    *Import your SQL dump if you have one.*

2.  **Configure Backend `.env`**:
    Create a `.env` file for the backend:
    ```bash
    nano /var/www/sarinda-pos/sarindaweb/backend/.env
    ```
    Paste your variables:
    ```
    DB_HOST=localhost
    DB_USER=root
    DB_PASSWORD=
    DB_NAME=chamika_rice_mill
    FRONTEND_URL=https://is.bridgitalsolutions.com
    ```
    Save with `Ctrl+O`, `Enter`, then `Ctrl+X`.

## 5. Configure GitHub Actions
Go to your GitHub Repository Settings -> Secrets and Variables -> Actions -> **New Repository Secret**.

Add these 3 secrets:
1.  `HOST`: Your VPS IP address
2.  `USERNAME`: `root`
3.  `KEY`: The private SSH key (Generate one locally and add the public key to `~/.ssh/authorized_keys` on the server).

## 6. Deploy
1.  Push your code changes to GitHub `main` branch.
2.  Go to the **Actions** tab in GitHub to watch the deployment proceed.

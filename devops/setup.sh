#!/bin/bash

# Exit on error
set -e

echo "Updating system..."
export DEBIAN_FRONTEND=noninteractive
sudo apt-get update && sudo apt-get upgrade -y

echo "Installing essential packages..."
sudo apt-get install -y curl git unzip build-essential fontconfig libfontconfig1 libjpeg-turbo8 libx11-6 libx11-xcb1 libxcb1

echo "Installing Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

echo "Installing Nginx..."
sudo apt-get install -y nginx

echo "Installing MySQL Server..."
sudo apt-get install -y mysql-server

echo "Installing PM2..."
sudo npm install -g pm2

# PhantomJS dependencies for html-pdf
echo "Installing PhantomJS dependencies..."
sudo apt-get install -y libfontconfig1 libfontconfig1-dev libjpeg-dev libico-dev libfreetype6 libfreetype6-dev libpng-dev

echo "Setup complete! MySQL and Nginx are installed."

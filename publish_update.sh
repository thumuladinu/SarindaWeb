#!/bin/bash

# Configuration
SERVER_IP="91.107.207.196"
SERVER_USER="root"
SSH_KEY="~/.ssh/id_ed25519"
DB_USER="root" # Using root for schema changes to ensure permissions
DB_NAME="chamika_rice_mill"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${YELLOW}===============================================${NC}"
echo -e "${YELLOW}   SarindaWeb - One-Click Deployment Script    ${NC}"
echo -e "${YELLOW}===============================================${NC}"

# ----------------------------
# 1. Database Migrations
# ----------------------------
echo -e "\n${YELLOW}[1/2] Checking for Database Structural Changes...${NC}"

# Check if there are any .sql files in db_updates (excluding the applied folder)
count=$(ls db_updates/*.sql 2>/dev/null | wc -l | xargs)

if [ "$count" != "0" ]; then
    echo -e "${YELLOW}Found $count new database migration file(s).${NC}"
    ls db_updates/*.sql
    echo ""
    read -p "Do you want to apply these changes to the PRODUCTION Database? (y/n): " confirm_db

    if [[ "$confirm_db" == "y" || "$confirm_db" == "Y" ]]; then
        for file in db_updates/*.sql; do
            filename=$(basename "$file")
            echo -e "Processing $filename ..."
            
            # Upload to server
            scp -o StrictHostKeyChecking=no -i $SSH_KEY "$file" $SERVER_USER@$SERVER_IP:/tmp/$filename
            
            # Execute on server
            ssh -o StrictHostKeyChecking=no -i $SSH_KEY $SERVER_USER@$SERVER_IP "mysql -u $DB_USER $DB_NAME < /tmp/$filename && rm /tmp/$filename"
            
            if [ $? -eq 0 ]; then
                echo -e "${GREEN}✔ Successfully applied $filename${NC}"
                mv "$file" "db_updates/applied/$filename"
            else
                echo -e "${RED}✘ FAILED to apply $filename. Stopping deployment.${NC}"
                exit 1
            fi
        done
        echo -e "${GREEN}All database changes applied successfully!${NC}"
    else
        echo "Skipping database updates."
    fi
else
    echo -e "${GREEN}No new database changes found in db_updates/.${NC}"
fi

# ----------------------------
# 2. Git & Code Deployment
# ----------------------------
echo -e "\n${YELLOW}[2/2] Publishing Code Changes...${NC}"

read -p "Enter commit message (default: 'chore: update app'): " commit_msg
commit_msg=${commit_msg:-"chore: update app"}

echo "Adding all files..."
git add .

echo "Committing..."
git commit -m "$commit_msg"

echo "Pushing to GitHub..."
git push origin main

if [ $? -eq 0 ]; then
    echo -e "\n${GREEN}===============================================${NC}"
    echo -e "${GREEN}   Deployment Triggered Successfully! 🚀       ${NC}"
    echo -e "${GREEN}===============================================${NC}"
    echo "GitHub Actions is now building and deploying your code."
    echo "Check progress here: https://github.com/thumuladinu/SarindaWeb/actions"
else
    echo -e "${RED}Git Push failed. Please check errors above.${NC}"
    exit 1
fi

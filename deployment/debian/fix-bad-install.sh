#!/usr/bin/env bash


echo "Fixing a broken installation of SEO Cromom"
echo -e "\n"


osVersionDetails=$(hostnamectl)
debianVersion=''
RED='\033[0;31m'
GREEN='\033[0;32m'
NoColor='\033[0m' # No Color

echo "Checking OS version..."
if [[ "$osVersionDetails" =~ Debian[[:space:]]*GNU\/Linux[[:space:]]*10 ]]; then
  echo -e "${GREEN}Ok : OS - Debian GNU/Linux 10 (Buster)${NoColor}"
  debianVersion='10'
elif [[ "$osVersionDetails" =~ Debian[[:space:]]*GNU\/Linux[[:space:]]*9 ]]; then
  echo -e "${GREEN}Ok : OS - Debian GNU/Linux 9 (Stretch)${NoColor}"
  debianVersion='9'
else
  echo -e "${RED}Error: Can only be installed on either Debian 9 or 10${NoColor}"
  exit 1
fi

apt --fix-broken install


echo "Installing SEO Cromom Dependencies"
cwd=$(pwd)
rootFolder=${cwd//\/deployment\/debian/ }
echo "Opening the root folder: $rootFolder"
cd $rootFolder
npm install
echo -e "\n"

echo "deb [signed-by=/usr/share/keyrings/nginx-archive-keyring.gpg] \
http://nginx.org/packages/mainline/debian `lsb_release -cs` nginx" \
    | sudo tee /etc/apt/sources.list.d/nginx.list

echo -e "Package: *\nPin: origin nginx.org\nPin: release o=nginx\nPin-Priority: 900\n" \
    | sudo tee /etc/apt/preferences.d/99nginx

echo "Intalling Nginx"
sudo apt merge
sudo apt install nginx

echo -e "Starting nginx as a service\n"
systemctl start nginx.service
service nginx start


echo "Installing MongoDB"

if [[ "$debianVersion" == "10" ]]; then
    wget -qO - https://www.mongodb.org/static/pgp/server-6.0.asc | apt-key add -
    sudo apt-get install gnupg
    echo "deb http://repo.mongodb.org/apt/debian buster/mongodb-org/6.0 main" | tee /etc/apt/sources.list.d/mongodb-org-6.0.list
    apt-get update
    apt-get install -y mongodb-org
    echo -e "\n"
else
    wget -qO - https://www.mongodb.org/static/pgp/server-5.0.asc | sudo apt-key add -
    sudo apt-get install gnupg
    wget -qO - https://www.mongodb.org/static/pgp/server-5.0.asc | sudo apt-key add -
    echo "deb http://repo.mongodb.org/apt/debian stretch/mongodb-org/5.0 main" | sudo tee /etc/apt/sources.list.d/mongodb-org-5.0.list
    sudo apt-get update
    sudo apt-get install -y mongodb-org
    echo -e "\n"
fi

echo -e "Starting mongodb as a service\n"
sudo systemctl daemon-reload
sudo systemctl unmask mongod
sudo systemctl enable mongod
sudo systemctl start mongod
service mongod start


{ time ( echo -e "Waiting 15 seconds  for mongod to start \n" ; sleep 15s;  echo -e "Resumed execution \n" ; ) } 2>&1

echo -e "Creating db seo_cromom_db\n"

echo -e "Deleting existing user"
mongosh seo_cromom_db --eval "db.dropUser('seo_cromom_user', {w: 'majority', wtimeout: 5000});";
echo -e "\n"

echo -e "Creating new user"
mongosh seo_cromom_db --eval "db.createUser({user:'seo_cromom_user',pwd:'SOh3TbYhx8ypJPxmt1oOfLUjkoipuy88999978Gty',roles: [{role:'readWrite',db:'seo_cromom_db'}]});";


echo "Installing seocromom as a service"
forever-service install seocromomd --script index.js
echo -e "\n"

echo "Starting seocromomd service"
sudo service seocromomd start
echo -e "\n"

exit 1








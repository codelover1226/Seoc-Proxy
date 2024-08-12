#!/usr/bin/env bash


echo "Welcome to the installation of SEO Cromom"
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

{ time ( echo -e "Waiting 5 seconds \n" ; sleep 5s;  echo -e "Resumed execution \n" ; ) } 2>&1

echo "Updating system"
apt merge && sudo apt upgrade
echo -e "\n"

echo "Intalling curl"
apt install curl
echo -e "\n"

echo "Installing Chromium dependencies"
apt-get update && \
apt-get install -yq gconf-service libasound2 libatk1.0-0 libc6 libcairo2 libcups2 libdbus-1-3 \
libexpat1 libfontconfig1 libgcc1 libgconf-2-4 libgdk-pixbuf2.0-0 libglib2.0-0 libgtk-3-0 libnspr4 \
libpango-1.0-0 libpangocairo-1.0-0 libstdc++6 libx11-6 libx11-xcb1 libxcb1 libxcomposite1 \
libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 libxtst6 libgbm1 \
ca-certificates fonts-liberation libappindicator1 libnss3 lsb-release xdg-utils wget
echo -e "\n"

echo "Intalling nodeJs 14"
curl -sL https://deb.nodesource.com/setup_14.x | bash -
apt-get install -y nodejs
echo -e "\n";

echo "Installing forever nodejs package"
npm install forever -g
echo -e "\n"

echo "Installing forever-service nodejs package"
npm install -g forever-service
echo -e "\n"


echo "Installing SEO Cromom Dependencies"
cwd=$(pwd)
rootFolder=${cwd//\/deployment\/debian/ }
echo "Opening the root folder: $rootFolder"
cd $rootFolder
npm install
echo -e "\n"


echo "Intalling Nginx"
sudo apt update
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



cwd=$(pwd)
rootFolder=${cwd//\/deployment\/debian//}
echo "Opening the root folder: $rootFolder"
cd $rootFolder

if [[ -f "$rootFolder/routes/logs" ]]
then
    echo "Removing logs folder"
    rmdir "$rootFolder/routes/logs"
    echo -e "\n"
fi


echo "Setting the timezone to Europe/Madrid"
timedatectl set-timezone Europe/Madrid

echo "Installing seocromom as a service"
forever-service install seocromomd --script index.js
echo -e "\n"

echo "Starting seocromomd service"
sudo service seocromomd start
echo -e "\n"

exit 1








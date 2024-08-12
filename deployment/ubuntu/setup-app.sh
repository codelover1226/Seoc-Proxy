#!/usr/bin/env bash


echo "Welcome to the installation of SEO Cromom"
echo -e "\n"

echo "Updating system"
apt merge && sudo apt upgrade
echo -e "\n"

echo "Intalling curl"
apt install curl
echo -e "\n"

echo "Installing Chromium dependencies"
sudo apt-get update
sudo apt-get install -y libappindicator1 fonts-liberation
echo -e "\n"

echo "Intalling nodeJs 18"
curl -fsSL https://deb.nodesource.com/setup_16.x | sudo -E bash -
sudo apt-get install -y nodejs

echo "Installing forever nodejs pkg"
npm install forever -g
echo -e "\n"


echo "Installing SEO Cromom Dependencies"
cwd=$(pwd)
rootFolder=${cwd//\/deployment\/debian/ }
echo "Opening the root folder: $rootFolder"
cd $rootFolder
npm install
echo -e "\n"

echo "Intalling Nginx"
sudo apt install nginx

echo -e "Starting nginx as a service\n"
systemctl start nginx.service
service nginx start


echo "Installing MongoDB"
sudo apt-get install gnupg
wget -qO - https://www.mongodb.org/static/pgp/server-4.4.asc | sudo apt-key add -
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu focal/mongodb-org/4.4 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-4.4.list
sudo apt-get update
sudo apt-get install -y mongodb-org=4.4.15 mongodb-org-server=4.4.15 mongodb-org-shell=4.4.15 mongodb-org-mongos=4.4.15 mongodb-org-tools=4.4.15
echo -e "\n"

echo -e "Starting mongodb as a service\n"
sudo systemctl daemon-reload
sudo systemctl enable mongod
sudo systemctl start mongod
service mongod start


{ time ( echo -e "Waiting 15 seconds  for mongod to start \n" ; sleep 15s;  echo -e "Resumed execution \n" ; ) } 2>&1

echo -e "Creating db seo_cromom_db\n"

echo -e "Deleting existing user"
mongo seo_cromom_db --eval "db.dropUser('seo_cromom_user', {w: 'majority', wtimeout: 5000});";
echo -e "\n"

echo -e "Creating new user"
mongo seo_cromom_db --eval "db.createUser({user:'seo_cromom_user',pwd:'SOh3TbYhx8ypJPxmt1oOfLUjkoipuy88999978Gty',roles: [{role:'readWrite',db:'seo_cromom_db'}]});";



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

echo "Starting Cromom Proxy Server"
forever start index.js
echo -e "\n"

exit 1








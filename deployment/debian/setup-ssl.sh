#!/usr/bin/env bash

cwd=$(pwd)
rootFolder=${cwd//\/deployment\/debian//}

echo "Integrating subdomains to nginx..."
node nginx/ssl-integration.js
echo -e "\n"

echo "Installing snap..."
apt install snapd
snap install core
snap install core
snap refresh core
echo -e "\n"

echo "Deleting any lock file"
find / -type f -name ".certbot.lock" -print -delete 2>/dev/null;
echo -e "\n"

echo "Install Certbot"
snap install --classic certbot
echo -e "\n"

if [ ! -f /usr/bin/certbot ]
then
    echo "Prepare the Certbot command"
    ln -s /snap/bin/certbot /usr/bin/certbot
    echo -e "\n"
fi

echo "Get and install your certificates in nginx..."
sudo certbot --nginx
echo -e "\n"

echo "Reloading nginx configuration..."
nginx -s reload
echo -e "\n"

cd $rootFolder

echo "Restarting seocromom"
outcome=$(forever restart index.js)
if [[ "$outcome" == *"error"* ]]; then
  forever start index.js
fi


exit 1
sudo service seocromomd stop
forever-service delete seocromomd
forever-service install seocromomd --script ./../../index.js
sudo service seocromomd start

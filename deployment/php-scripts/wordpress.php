<?php
    if (is_user_logged_in()) {
        $serviceName = "SERVICE_NAME_PLACEHOLDER";
        $key = "KEY_PLACEHOLDER";
        $host = "https://SERVICE_DOMAIN/";
        $nonce = wp_create_nonce('wp_rest');
        $cookies = LOGGED_IN_COOKIE . "=" . (isset($_COOKIE[LOGGED_IN_COOKIE]) ? htmlspecialchars($_COOKIE[LOGGED_IN_COOKIE]) : "");
        $useragent = $_SERVER['HTTP_USER_AGENT'];
        $time = time();
        $data = json_encode(["".get_current_user_id(),$cookies,$nonce,0,'SITE_PLACEHOLDER']);

        if (current_user_can('administrator'))
            $data = json_encode(["".get_current_user_id(),$cookies,$nonce,1,'SITE_PLACEHOLDER']);

        $signature = base64_encode(hash_hmac("sha1", $useragent . "\n" . $time . $data, $key, false));
        $str = $signature."#".base64_encode($time)."#".base64_encode($data);
        $serviceStr = base64_encode(hash_hmac("sha1", $serviceName, $key, false));

        $connectText = 'Connect to ' . ucfirst($serviceName);

        echo "<form method=\"POST\" action=\"".$host."seoc/connect.htm\" target=\"_blank\">";
        echo "<input type=\"hidden\" name=\"token\" value=\"".$str."\">";
        echo "<input type=\"hidden\" name=\"service\" value=\"".$serviceStr."\">";
        echo "<input type=\"submit\" value=\"{$connectText}\">";
        echo "</form>";
    }
?>
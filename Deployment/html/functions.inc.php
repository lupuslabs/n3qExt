<?php

$redis = fsockopen('127.0.0.1', 6379);

function setCache($key, $value) {
    global $redis;
    fputs($redis, 'SET ' . $key . ' ' . base64_encode($value) . "\r\n");
    fgets($redis, 255);
    fputs($redis, 'EXPIRE ' . $key . " 300\n");
    fgets($redis, 255);
}

function getCache($key) {
    global $redis;
    fputs($redis, 'GET ' . $key . "\n");
    $s = fgets($redis, 255);

    $l = intval(preg_replace('/^\$/', '', $s));
    if ($l === -1) {
        return false;
    }
    $val = base64_decode(fread($redis, $l));
    return $val;
}

function getHtmlHead($body) {
    $head = [];

    if (preg_match('/<title.*?>(.*?)</si', $body, $m)) {
        $head[] = '<title>' . $m[1] . '</title>';
    };

    preg_match_all('/<meta(.*?)>/si', $body, $m);
    foreach ($m[1] as $k => $v) {
        if ((strpos($v, 'property="og:') !== false)
            || (strpos($v, 'name="twitter:') !== false)) {
            $head[] = $m[0][$k];
        }
    }

    if (preg_match('/(<link[^>]*?shortcut icon[^>]*?href="(.*?)"[^>]*?>)/si', $body, $m)) {
        $head[] = $m[1];
    }
    return $head;
}

function getPage($url, $ignoreSsl = false) {
    $return = [
        'header' => [],
        'body' => '',
        'errors' => [],
        'redirects' => [],
    ];
    do {
        $redirect = false;
        $return['header'] = [];
        $return['body'] = '';

        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 5);
        curl_setopt($ch, CURLOPT_TIMEOUT, 5); //timeout in seconds
        curl_setopt($ch, CURLOPT_FOLLOWLOCATION, 0);
        curl_setopt($ch, CURLOPT_HEADER, true);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);
        //curl_setopt($ch, CURLOPT_USERAGENT, 'weblin');

        if ($ignoreSsl) {
            curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
            curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        }
        if (!($response = curl_exec($ch))) {
            $return['errors'][] = '' . curl_error($ch);
            return $return;
        }

        if (!preg_match('/^HTTP/i', $response)) {
            $return['errors'][] = 'Not a http response (' . substr(trim(explode("\n", $response)[0]), 0, 50) . ')';
        }

        $tmp = explode("\r\n\r\n", $response);

        $header = parseHttpHeader(array_shift($tmp));

        $return['header'] = $header;
        $return['body'] = implode("\r\n\r\n", $tmp);

        if ($header['xhttp_code'] == 301 || ($header['xhttp_code'] == 302) || ($header['xhttp_code'] == 307) || ($header['xhttp_code'] == 308)) {
            $return['redirects'][] = $header['location'];
            $url = $header['location'];
            $redirect = true;
        } elseif ($header['xhttp_code'] != 200) {
            $return['errors'][] = 'Server response: ' . $header['xhttp_code'] . ' ' . $header['xhttp_status'];
        }
    } while ($redirect !== false && count($return['redirects']) < 5);

    if ($redirect) {
        $return['errors'][] = 'Too many redirects.';
    }
    return $return;
}

function parseHttpHeader($header) {
    $return = array();
    $lines = explode("\n", $header);
    $first = array_shift($lines);
    $tmp = explode(' ', $first, 3);

    $return['xhttp_version'] = $tmp[0];
    $return['xhttp_code'] = $tmp[1];
    $return['xhttp_status'] = $tmp[2];
    foreach ($lines as $line) {
        $tmp = explode(':', $line, 2);
        $return[strtolower(trim($tmp[0]))] = trim($tmp[1]);
    }
    return $return;
}
<?php

//ini_set('display_errors', 1);
include(dirname(__FILE__) . '/functions.inc.php');
$isDenied = false;
$url = substr($_SERVER['REQUEST_URI'], 1);

if (preg_match('/^http:\/\//si', $url)) {
    $isDenied = true;
    $isDeniedReason = 'https required';
} elseif (!preg_match('/^https:\/\//si', $url)) {
    $url = 'https://' . $url;
}

$cacheKey = md5($url);
if ($page = getCache($cacheKey)) {
    echo $page;
    exit();
}

$r = getPage($url, 1);

if (count($r['errors']) > 0) {
    $isDenied = true;
    $isDeniedReason = implode(', ', $r['errors']);
} elseif ($r['header']['xhttp_code'] != 200) {
    header($r['header']['xhttp_code'] . ' ' . $r['header']['xhttp_status'], true, $r['header']['xhttp_code']);
    $isDenied = true;
    $isDeniedReason = $r['header']['xhttp_code'] . ' ' . $r['header']['xhttp_status'];
} elseif (isset($r['header']['content-security-policy']) && preg_match('/frame-ancestors/si', $r['header']['content-security-policy'])) {
    $isDenied = true;
    $isDeniedReason = 'iframe denied (1)';
} elseif (isset($r['header']['x-frame-options']) && strtoupper($r['header']['x-frame-options']) == 'DENY') {
    $isDenied = true;
    $isDeniedReason = 'iframe denied (2)';
}

$htmlHead = getHtmlHead($r['body']);

ob_start();
?><!DOCTYPE html>
<html>
<head>
    <?= implode("\n    ", $htmlHead) ?>
    <style type="text/css">
        body {
            margin: 0;
        }

        iframe {
            display: block;
            border: none;
            height: 100vh;
            width: 100vw;
        }

        .error {
            margin: auto;
            width: 50%;
            border: 3px solid red;
            padding: 10px;
            margin-top: 200px;
        }
    </style>
    <link href="/v1/embedded.css" rel="stylesheet">
</head>
<body>
<?php if ($isDenied) { ?>
<div class="error">weblin is not available on this page (<?=htmlspecialchars($isDeniedReason)?>)</div>
<?php } else { ?>
<iframe id="iframe" src=""></iframe>
<?php } ?>
<script>
    let url = new URL('<?=$url?>');
    document.getElementById('iframe').src = url.href;

    var n3q = {
        apiVersion: '1',
        pageUrl: url.href
    };
</script>
<script src="/v1/embedded.js"></script>
</body>
</html>
<?php
$content = ob_get_contents();
ob_end_clean();
echo $content;
setCache($cacheKey, $content);
<?php
/**
 * PHP proxy → Node.js (port 3000)
 * Auto-starts Node.js if not running (requires exec/shell_exec on hosting)
 */

define('NODE_URL',  'http://127.0.0.1:3000');
define('APP_DIR',   '/home/i/infogkmeta/lenta-stalnaja/public_html');
define('LOG_FILE',  '/home/i/infogkmeta/node_app.log');
define('PID_FILE',  '/home/i/infogkmeta/node_app.pid');
define('HOME_DIR',  '/home/i/infogkmeta');

// ── 1. Check if Node.js is running ───────────────────────────────────────────
function isNodeRunning(): bool {
    if (file_exists(PID_FILE)) {
        $pid = (int) trim(file_get_contents(PID_FILE));
        if ($pid > 0 && file_exists("/proc/$pid")) return true;
    }
    exec('pgrep -f "node.*app.js"', $out);
    return !empty($out);
}

// ── 2. Start Node.js ─────────────────────────────────────────────────────────
function startNode(): void {
    // Install deps if missing
    if (!is_dir(APP_DIR . '/node_modules')) {
        // Set HOME so npm uses writable cache, not /root/.npm
        exec('cd ' . APP_DIR . ' && HOME=' . HOME_DIR . ' npm ci --omit=dev --cache ' . HOME_DIR . '/.npm-cache >> ' . LOG_FILE . ' 2>&1');
    }
    // Init DB if missing
    if (!file_exists(APP_DIR . '/data/app.db')) {
        exec('cd ' . APP_DIR . ' && HOME=' . HOME_DIR . ' node src/db/migrations.js >> ' . LOG_FILE . ' 2>&1');
    }
    // Launch
    $cmd = 'cd ' . APP_DIR . ' && HOME=' . HOME_DIR . ' nohup node src/app.js >> ' . LOG_FILE . ' 2>&1 & echo $!';
    $pid = trim((string) shell_exec($cmd));
    if ($pid) file_put_contents(PID_FILE, $pid);
    sleep(4);
}

// ── 3. Try to ensure Node.js is running ──────────────────────────────────────
$canExec = function_exists('shell_exec') && function_exists('exec')
           && !in_array('shell_exec', array_map('trim', explode(',', ini_get('disable_functions'))));

if ($canExec && !isNodeRunning()) {
    startNode();
}

// ── 4. Proxy request via cURL ─────────────────────────────────────────────────
$uri    = $_SERVER['REQUEST_URI'];
$method = $_SERVER['REQUEST_METHOD'];
$target = NODE_URL . $uri;

$ch = curl_init($target);
curl_setopt_array($ch, [
    CURLOPT_CUSTOMREQUEST  => $method,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HEADER         => true,
    CURLOPT_FOLLOWLOCATION => false,
    CURLOPT_TIMEOUT        => 30,
    CURLOPT_CONNECTTIMEOUT => 5,
]);

// Forward request body (POST / PUT / PATCH)
if (in_array($method, ['POST', 'PUT', 'PATCH'])) {
    curl_setopt($ch, CURLOPT_POSTFIELDS, file_get_contents('php://input'));
}

// Forward request headers
$reqHeaders = [];
if (function_exists('getallheaders')) {
    foreach (getallheaders() as $k => $v) {
        $l = strtolower($k);
        if (in_array($l, ['host', 'connection', 'content-length'])) continue;
        $reqHeaders[] = "$k: $v";
    }
}
curl_setopt($ch, CURLOPT_HTTPHEADER, $reqHeaders);

$response  = curl_exec($ch);
$errno     = curl_errno($ch);
$httpCode  = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$hdrSize   = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
curl_close($ch);

// ── 5. Handle connection error ────────────────────────────────────────────────
if ($response === false || $errno || $httpCode === 0) {
    http_response_code(503);
    header('Content-Type: text/html; charset=UTF-8');
    $log = file_exists(LOG_FILE) ? nl2br(htmlspecialchars(file_get_contents(LOG_FILE))) : '(лог пуст)';
    $exec_status = $canExec ? 'exec/shell_exec <b>доступны</b>' : 'exec/shell_exec <b>ОТКЛЮЧЕНЫ</b> — запустите Node.js вручную через SSH';
    echo <<<HTML
<!DOCTYPE html><html><head><meta charset="UTF-8"><title>503</title></head><body>
<h2>503 — Node.js недоступен</h2>
<p>Статус: $exec_status</p>
<p>Обновите страницу через 10 секунд. Если не помогает — проверьте лог ниже.</p>
<pre style="background:#f4f4f4;padding:10px;font-size:12px">$log</pre>
</body></html>
HTML;
    exit;
}

// ── 6. Send response to browser ───────────────────────────────────────────────
$respHeaders = substr($response, 0, $hdrSize);
$respBody    = substr($response, $hdrSize);

http_response_code($httpCode);

$skip = ['transfer-encoding', 'connection', 'keep-alive', 'content-length'];
foreach (explode("\r\n", $respHeaders) as $line) {
    if (empty($line) || stripos($line, 'HTTP/') === 0) continue;
    $parts = explode(':', $line, 2);
    if (count($parts) < 2) continue;
    if (in_array(strtolower(trim($parts[0])), $skip)) continue;
    header($line, false);
}

echo $respBody;

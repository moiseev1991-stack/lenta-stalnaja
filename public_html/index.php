<?php
/**
 * PHP proxy → Node.js (port 3000)
 * Auto-starts Node.js if not running (requires exec/shell_exec on hosting)
 */

// Keep running even if browser disconnects (npm install can take 2-3 min)
ignore_user_abort(true);
set_time_limit(300);

define('NODE_URL',  'http://127.0.0.1:3000');
define('APP_DIR',   '/home/i/infogkmeta/lenta-stalnaja/public_html');
define('LOG_FILE',  '/home/i/infogkmeta/node_app.log');
define('PID_FILE',  '/home/i/infogkmeta/node_app.pid');
define('HOME_DIR',  '/home/i/infogkmeta');
define('LOCK_FILE', '/home/i/infogkmeta/npm_install.lock');
define('NPM_CACHE', HOME_DIR . '/.npm-cache');

// ── 1. Check if Node.js is running ───────────────────────────────────────────
function isNodeRunning(): bool {
    if (file_exists(PID_FILE)) {
        $pid = (int) trim(file_get_contents(PID_FILE));
        if ($pid > 0 && file_exists("/proc/$pid")) return true;
    }
    exec('pgrep -f "node.*app.js"', $out);
    return !empty($out);
}

// ── 2. Install npm deps (with file lock to prevent concurrent installs) ───────
function installDeps(): void {
    $lockFh = fopen(LOCK_FILE, 'c');
    if (!$lockFh) return;

    // Non-blocking: if another process is already installing, skip
    if (!flock($lockFh, LOCK_EX | LOCK_NB)) {
        fclose($lockFh);
        return;
    }

    // Double-check: maybe the other process just finished
    if (file_exists(APP_DIR . '/node_modules/mysql2/index.js')) {
        flock($lockFh, LOCK_UN);
        fclose($lockFh);
        return;
    }

    // Write .npmrc to override root-owned cache (/root/.npm) with a writable path
    file_put_contents(APP_DIR . '/.npmrc', 'cache=' . NPM_CACHE . "\n");

    // Remove corrupted/partial node_modules before clean install
    if (is_dir(APP_DIR . '/node_modules')) {
        exec('rm -rf ' . escapeshellarg(APP_DIR . '/node_modules') . ' >> ' . LOG_FILE . ' 2>&1');
    }

    $env = 'HOME=' . HOME_DIR
         . ' npm_config_cache=' . NPM_CACHE
         . ' npm_config_userconfig=' . APP_DIR . '/.npmrc';
    $cmd = 'cd ' . APP_DIR
         . ' && ' . $env
         . ' npm install --omit=dev --no-optional'
         . ' >> ' . LOG_FILE . ' 2>&1';
    exec($cmd);

    flock($lockFh, LOCK_UN);
    fclose($lockFh);
}

// ── 3. Start Node.js ─────────────────────────────────────────────────────────
function startNode(): void {
    $ts = date('Y-m-d H:i:s');
    file_put_contents(LOG_FILE, "\n[$ts] === NODE START ===\n", FILE_APPEND);

    // Install deps if node_modules is missing OR mysql2/bcryptjs is missing
    // (after replacing bcrypt→bcryptjs: force reinstall to get pure-JS bcryptjs)
    if (!file_exists(APP_DIR . '/node_modules/express/index.js')
        || !file_exists(APP_DIR . '/node_modules/mysql2/index.js')
        || !file_exists(APP_DIR . '/node_modules/bcryptjs/bCrypt.js')) {
        file_put_contents(LOG_FILE, "[$ts] Running npm install...\n", FILE_APPEND);
        installDeps();
    }

    // Run MySQL migrations (idempotent — safe every time)
    $env = 'HOME=' . HOME_DIR . ' npm_config_cache=' . NPM_CACHE;
    file_put_contents(LOG_FILE, "[" . date('Y-m-d H:i:s') . "] Running migrations...\n", FILE_APPEND);
    exec('cd ' . APP_DIR . ' && ' . $env . ' node src/db/migrations.js >> ' . LOG_FILE . ' 2>&1');

    // Launch
    file_put_contents(LOG_FILE, "[" . date('Y-m-d H:i:s') . "] Launching node src/app.js...\n", FILE_APPEND);
    $cmd = 'cd ' . APP_DIR
         . ' && HOME=' . HOME_DIR
         . ' nohup node src/app.js >> ' . LOG_FILE . ' 2>&1 & echo $!';
    $pid = trim((string) shell_exec($cmd));
    if ($pid) file_put_contents(PID_FILE, $pid);
    sleep(6);
}

// ── 4. Try to ensure Node.js is running ──────────────────────────────────────
$canExec = function_exists('shell_exec') && function_exists('exec')
           && !in_array('shell_exec', array_map('trim', explode(',', ini_get('disable_functions'))));

if ($canExec && !isNodeRunning()) {
    startNode();
}

// ── 5. Proxy request via cURL ─────────────────────────────────────────────────
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

// ── 6. Handle connection error ────────────────────────────────────────────────
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

// ── 7. Send response to browser ───────────────────────────────────────────────
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

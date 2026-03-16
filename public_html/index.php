<?php
/**
 * PHP proxy → Node.js (port 3000)
 * Auto-starts Node.js if not running (requires exec/shell_exec on hosting)
 */

// Keep running even if browser disconnects (npm install can take 2-3 min)
ignore_user_abort(true);
set_time_limit(300);

define('NODE_URL',  'http://127.0.0.1:3000');
define('APP_DIR',   '/home/i/infogkmeta/lenta-stalnaja');
define('LOG_FILE',  '/home/i/infogkmeta/node_app.log');
define('PID_FILE',  '/home/i/infogkmeta/node_app.pid');
define('HOME_DIR',  '/home/i/infogkmeta');
define('LOCK_FILE', '/home/i/infogkmeta/npm_install.lock');
define('NPM_CACHE', HOME_DIR . '/.npm-cache');

// #region agent log — debug endpoint (returns JSON state + node crash test)
if (($_SERVER['REQUEST_URI'] ?? '') === '/__debug__') {
    $dbgPidRaw   = file_exists(PID_FILE) ? trim(file_get_contents(PID_FILE)) : '';
    $dbgPid      = (int) $dbgPidRaw;
    $dbgPidAlive = ($dbgPid > 0 && file_exists("/proc/$dbgPid"));
    $dbgSock     = @fsockopen('127.0.0.1', 3000, $dbgSockErr, $dbgSockMsg, 2);
    $dbgPort     = (bool) $dbgSock;
    if ($dbgSock) fclose($dbgSock);
    $dbgPgrep    = trim((string) shell_exec('pgrep -f "node" 2>/dev/null'));
    // Filter out [DIAG] lines, get last 30 real log lines
    $dbgAllLines = file_exists(LOG_FILE) ? file(LOG_FILE) : [];
    $dbgRealLines = array_values(array_filter($dbgAllLines, function($l) { return strpos($l, '[DIAG]') === false; }));
    $dbgLogLines  = array_slice($dbgRealLines, -30);
    // Run node synchronously to capture crash output (timeout 8s)
    $dbgNodeTest = shell_exec(
        'cd ' . escapeshellarg(APP_DIR)
        . ' && HOME=' . escapeshellarg(HOME_DIR)
        . ' timeout 8 node src/app.js 2>&1'
    );
    header('Content-Type: application/json');
    header('Cache-Control: no-store');
    echo json_encode([
        'ts'           => date('Y-m-d H:i:s'),
        'app_dir'      => APP_DIR,
        'appjs'        => file_exists(APP_DIR.'/src/app.js'),
        'env'          => file_exists(APP_DIR.'/.env'),
        'nm_express'   => file_exists(APP_DIR.'/node_modules/express/index.js'),
        'nm_mysql2'    => file_exists(APP_DIR.'/node_modules/mysql2/index.js'),
        'nm_bcryptjs'  => file_exists(APP_DIR.'/node_modules/bcryptjs/package.json'),
        'pid'          => $dbgPidRaw,
        'pid_alive'    => $dbgPidAlive,
        'port_3000'    => $dbgPort,
        'port_err'     => $dbgSockErr . ': ' . $dbgSockMsg,
        'node_pids'    => $dbgPgrep,
        'node_test'    => $dbgNodeTest,
        'last_log'     => $dbgLogLines,
    ], JSON_PRETTY_PRINT);
    exit;
}
// #endregion

// ── 1. Check if Node.js is running ───────────────────────────────────────────
function isNodeRunning(): bool {
    if (file_exists(PID_FILE)) {
        $pid = (int) trim(file_get_contents(PID_FILE));
        if ($pid > 0 && file_exists("/proc/$pid")) return true;
    }
    exec('pgrep -f "node.*app.js"', $out);
    return !empty($out);
}

// ── 2. Write correct package.json (no native modules) ────────────────────────
// This runs every time to ensure the correct package.json is always in place,
// bypassing any FTP deploy inconsistencies with this critical file.
function writePackageJson(): void {
    $pkg = [
        'name'         => 'lebta-catalog',
        'version'      => '1.0.0',
        'description'  => 'SSR catalog site + admin for metal products',
        'main'         => 'src/app.js',
        'scripts'      => ['start' => 'node src/app.js'],
        'engines'      => ['node' => '>=18'],
        'dependencies' => [
            'bcryptjs'        => '^2.4.3',
            'cookie-parser'   => '^1.4.6',
            'dotenv'          => '^16.4.5',
            'express'         => '^4.21.1',
            'express-session' => '^1.18.0',
            'multer'          => '^1.4.5-lts.1',
            'mysql2'          => '^3.18.2',
            'nunjucks'        => '^3.2.4',
        ],
    ];
    file_put_contents(APP_DIR . '/package.json',
        json_encode($pkg, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n");
}

// ── 3. Write stub migrations.js (real migrations run inside app.js) ───────────
function writeMigrationsStub(): void {
    $stub = "// Legacy stub — migrations run automatically in app.js on startup\n" .
            "console.log('Migrations handled by app.js startup.');\n" .
            "process.exit(0);\n";
    $dir = APP_DIR . '/src/db';
    if (!is_dir($dir)) mkdir($dir, 0755, true);
    file_put_contents($dir . '/migrations.js', $stub);
}

// ── 4. Install npm deps ───────────────────────────────────────────────────────
function installDeps(): void {
    $lockFh = fopen(LOCK_FILE, 'c');
    if (!$lockFh) return;

    // Non-blocking: if another process is already installing, skip
    if (!flock($lockFh, LOCK_EX | LOCK_NB)) {
        fclose($lockFh);
        return;
    }

    // Double-check: maybe the other process just finished
    if (file_exists(APP_DIR . '/node_modules/mysql2/index.js')
        && file_exists(APP_DIR . '/node_modules/bcryptjs/package.json')) {
        flock($lockFh, LOCK_UN);
        fclose($lockFh);
        return;
    }

    $ts = date('Y-m-d H:i:s');
    file_put_contents(LOG_FILE, "[$ts] Installing npm deps...\n", FILE_APPEND);

    // Write .npmrc to override root-owned cache (/root/.npm) with a writable path
    file_put_contents(APP_DIR . '/.npmrc', 'cache=' . NPM_CACHE . "\n");

    // ALWAYS write the correct package.json before installing
    // (ensures no native modules even if FTP deploy didn't update it)
    writePackageJson();

    // Write stub migrations.js to prevent old SQLite code from crashing
    writeMigrationsStub();

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

// ── 5. Start Node.js ─────────────────────────────────────────────────────────
function startNode(): void {
    $ts = date('Y-m-d H:i:s');
    file_put_contents(LOG_FILE, "\n[$ts] === NODE START ===\n", FILE_APPEND);

    // Install deps if node_modules is missing OR mysql2/bcryptjs is missing
    if (!file_exists(APP_DIR . '/node_modules/express/index.js')
        || !file_exists(APP_DIR . '/node_modules/mysql2/index.js')
        || !file_exists(APP_DIR . '/node_modules/bcryptjs/package.json')) {
        installDeps();
    }

    // Run migrations (stub just exits 0; real migrations happen inside app.js)
    $env = 'HOME=' . HOME_DIR . ' npm_config_cache=' . NPM_CACHE;
    writeMigrationsStub();
    exec('cd ' . APP_DIR . ' && ' . $env . ' node src/db/migrations.js >> ' . LOG_FILE . ' 2>&1');

    // Launch
    file_put_contents(LOG_FILE, "[" . date('Y-m-d H:i:s') . "] Launching node src/app.js...\n", FILE_APPEND);
    $cmd = 'cd ' . APP_DIR
         . ' && HOME=' . HOME_DIR
         . ' nohup node src/app.js >> ' . LOG_FILE . ' 2>&1 & echo $!';
    $pid = trim((string) shell_exec($cmd));
    if ($pid) file_put_contents(PID_FILE, $pid);
    sleep(6);

    // #region agent log — post-launch diagnostics
    $ts2 = date('Y-m-d H:i:s');
    $pidAlive   = ($pid && file_exists("/proc/$pid")) ? 'YES' : 'NO';
    $port3000   = false;
    $sock = @fsockopen('127.0.0.1', 3000, $sockErrno, $sockErrstr, 3);
    if ($sock) { $port3000 = true; fclose($sock); }
    $anyNode = shell_exec('pgrep -f "node" 2>/dev/null') ?: '';
    file_put_contents(LOG_FILE,
        "[$ts2][POST-LAUNCH] pid=$pid pidAlive=$pidAlive port3000=" . ($port3000 ? 'OPEN' : 'CLOSED') . " anyNodePids=" . trim(str_replace("\n", ',', $anyNode)) . "\n",
        FILE_APPEND);
    // #endregion
}

// ── 6. Try to ensure Node.js is running ──────────────────────────────────────
$canExec = function_exists('shell_exec') && function_exists('exec')
           && !in_array('shell_exec', array_map('trim', explode(',', ini_get('disable_functions'))));

if ($canExec && !isNodeRunning()) {
    startNode();
}

// ── 7. Proxy request via cURL ─────────────────────────────────────────────────
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

// ── 8. Handle connection error ────────────────────────────────────────────────
if ($response === false || $errno || $httpCode === 0) {
    http_response_code(503);
    header('Content-Type: text/html; charset=UTF-8');
    // Show only last 200 lines of log to avoid huge page
    $logLines = file_exists(LOG_FILE) ? file(LOG_FILE) : [];
    $log = nl2br(htmlspecialchars(implode('', array_slice($logLines, -200))));
    $exec_status = $canExec ? 'exec/shell_exec <b>доступны</b>' : 'exec/shell_exec <b>ОТКЛЮЧЕНЫ</b>';
    // #region agent log — inline diagnostics for 503 page
    $PAR = '/home/i/infogkmeta/lenta-stalnaja';
    $PUB = '/home/i/infogkmeta/lenta-stalnaja/public_html';

    // Live node process check
    $diagPidRaw = file_exists(PID_FILE) ? trim(file_get_contents(PID_FILE)) : '';
    $diagPid    = (int) $diagPidRaw;
    $diagPidAlive = ($diagPid > 0 && file_exists("/proc/$diagPid")) ? "✅ alive (pid=$diagPid)" : "❌ dead (pid=$diagPidRaw)";
    $diagPgrep  = trim((string) shell_exec('pgrep -f "node" 2>/dev/null'));
    $diagPgrepFmt = $diagPgrep ? "✅ $diagPgrep" : '❌ none';

    // Live port check
    $diagSock = @fsockopen('127.0.0.1', 3000, $diagSockErr, $diagSockMsg, 2);
    $diagPort = $diagSock ? '✅ OPEN' : "❌ CLOSED ($diagSockErr: $diagSockMsg)";
    if ($diagSock) fclose($diagSock);

    // Last 10 log lines (most recent crash reason)
    $diagLastLines = file_exists(LOG_FILE) ? implode('', array_slice(file(LOG_FILE), -10)) : '(empty)';

    $diag_rows = [
        ['APP_DIR (current)',               APP_DIR],
        ['src/app.js @ APP_DIR',            file_exists(APP_DIR.'/src/app.js')          ? '✅ YES' : '❌ NO'],
        ['node_modules/express @ APP_DIR',  file_exists(APP_DIR.'/node_modules/express/index.js') ? '✅ YES' : '❌ NO'],
        ['node_modules/mysql2 @ APP_DIR',   file_exists(APP_DIR.'/node_modules/mysql2/index.js')  ? '✅ YES' : '❌ NO'],
        ['.env @ APP_DIR',                  file_exists(APP_DIR.'/.env')                ? '✅ YES' : '❌ NO'],
        ['─── LIVE STATE ───',              ''],
        ['Node PID (from file)',             $diagPidAlive],
        ['Node processes (pgrep)',           $diagPgrepFmt],
        ['Port 3000',                        $diagPort],
    ];
    $diag_html  = '<table border="1" cellpadding="4" style="border-collapse:collapse;font-size:13px;margin-bottom:10px">';
    foreach ($diag_rows as [$k, $v]) {
        $diag_html .= "<tr><td><b>" . htmlspecialchars($k) . "</b></td><td>" . htmlspecialchars($v) . "</td></tr>";
    }
    $diag_html .= '</table>';
    $diag_html .= '<h3>🔚 Последние 10 строк лога</h3>';
    $diag_html .= '<pre style="background:#fff3cd;padding:8px;font-size:12px">' . nl2br(htmlspecialchars($diagLastLines)) . '</pre>';
    // #endregion
    echo <<<HTML
<!DOCTYPE html><html><head><meta charset="UTF-8"><title>503</title></head><body>
<h2>503 — Node.js недоступен</h2>
<p>Статус: $exec_status</p>
<p>Обновите страницу через 10 секунд. Если не помогает — проверьте лог ниже.</p>
<h3>🔍 Диагностика путей</h3>
$diag_html
<h3>📋 Лог</h3>
<pre style="background:#f4f4f4;padding:10px;font-size:12px">$log</pre>
</body></html>
HTML;
    exit;
}

// ── 9. Send response to browser ───────────────────────────────────────────────
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

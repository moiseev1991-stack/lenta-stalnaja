<?php
// HTTP → HTTPS redirect (301) — не редиректить, если прокси передал X-Forwarded-Proto: https
$isHttps = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
$forwardedHttps = ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https';
if (!$isHttps && !$forwardedHttps) {
    $url = 'https://' . ($_SERVER['HTTP_HOST'] ?? '') . ($_SERVER['REQUEST_URI'] ?? '/');
    header('Location: ' . $url, true, 301);
    exit;
}

/**
 * PHP proxy → Node.js (port 3000)
 * Auto-starts Node.js if not running (requires exec/shell_exec on hosting)
 */

// Keep running even if browser disconnects (npm install can take 2-3 min)
ignore_user_abort(true);
set_time_limit(300);

define('NODE_URL',    'http://localhost');   // host is ignored when using Unix socket
define('NODE_SOCKET', '/home/i/infogkmeta/node.sock'); // Unix domain socket path
define('APP_DIR',   '/home/i/infogkmeta/lenta-stalnaja');
define('LOG_FILE',  '/home/i/infogkmeta/node_app.log');
define('PID_FILE',  '/home/i/infogkmeta/node_app.pid');
define('HOME_DIR',  '/home/i/infogkmeta');
define('LOCK_FILE', '/home/i/infogkmeta/npm_install.lock');
define('NPM_CACHE', HOME_DIR . '/.npm-cache');

// ── Fix image paths: update image_filename to full /img/products/ path ─────────
if (parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH) === '/__fix-images__') {
    $envFile = APP_DIR . '/.env';
    $envVars = [];
    if (file_exists($envFile)) {
        foreach (file($envFile) as $line) {
            $line = trim($line);
            if ($line && strpos($line, '=') !== false) {
                [$k, $v] = explode('=', $line, 2);
                $envVars[trim($k)] = trim($v);
            }
        }
    }
    $dbSocket = $envVars['MYSQL_SOCKET'] ?? '';
    $dbUser   = $envVars['MYSQL_USER']   ?? '';
    $dbPass   = $envVars['MYSQL_PASSWORD'] ?? '';
    $dbName   = $envVars['MYSQL_DATABASE'] ?? '';
    $mysqli = new mysqli(null, $dbUser, $dbPass, $dbName, 0, $dbSocket ?: null);
    if ($mysqli->connect_errno === 0) {
        // Update lenta-N.svg → /img/products/lenta-N.svg (if not already a full path)
        $res = $mysqli->query("UPDATE products SET image_filename = CONCAT('/img/products/', image_filename) WHERE image_filename IS NOT NULL AND image_filename != '' AND image_filename NOT LIKE '/%'");
        $rows = $mysqli->affected_rows;
        $mysqli->close();
        echo "OK: updated $rows product image paths to /img/products/";
    } else {
        echo "DB error: " . $mysqli->connect_error;
    }
    exit;
}

// ── Admin password reset endpoint ─────────────────────────────────────────────
if (parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH) === '/__reset-admin__') {
    $envFile = APP_DIR . '/.env';
    $envVars = [];
    if (file_exists($envFile)) {
        foreach (file($envFile) as $line) {
            $line = trim($line);
            if ($line && strpos($line, '=') !== false) {
                [$k, $v] = explode('=', $line, 2);
                $envVars[trim($k)] = trim($v);
            }
        }
    }
    $dbSocket = $envVars['MYSQL_SOCKET'] ?? '';
    $dbUser   = $envVars['MYSQL_USER']   ?? '';
    $dbPass   = $envVars['MYSQL_PASSWORD'] ?? '';
    $dbName   = $envVars['MYSQL_DATABASE'] ?? '';
    if ($dbUser && $dbName) {
        $newPass  = $_POST['pass'] ?? '';
        if ($newPass) {
            $hash = password_hash($newPass, PASSWORD_BCRYPT);
            $mysqli = new mysqli(null, $dbUser, $dbPass, $dbName, 0, $dbSocket ?: null);
            if ($mysqli->connect_errno === 0) {
                $stmt = $mysqli->prepare('UPDATE admin_users SET password_hash=? WHERE username=?');
                $adminUser = $_POST['user'] ?? 'admin';
                $stmt->bind_param('ss', $hash, $adminUser);
                $stmt->execute();
                $rows = $stmt->affected_rows;
                $stmt->close();
                $mysqli->close();
                echo "OK: updated $rows row(s). New password set.";
            } else {
                echo "DB error: " . $mysqli->connect_error;
            }
        } else {
            echo '<form method="post"><input name="pass" placeholder="New password" style="font-size:20px;padding:8px"> <input name="user" value="admin" placeholder="username" style="font-size:20px;padding:8px"> <button type="submit" style="font-size:20px;padding:8px">Set password</button></form>';
        }
    } else {
        echo 'No .env found';
    }
    exit;
}

// ── Setup endpoint: write .env with MySQL credentials ─────────────────────────
if (parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH) === '/__setup__') {
    $envFile = APP_DIR . '/.env';
    $saved   = false;
    $msg     = '';
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $host = trim($_POST['mysql_host'] ?? 'localhost');
        $port = trim($_POST['mysql_port'] ?? '3306');
        $user = trim($_POST['mysql_user'] ?? '');
        $pass = $_POST['mysql_password'] ?? '';
        $db   = trim($_POST['mysql_database'] ?? '');
        $siteUrl  = rtrim(trim($_POST['site_url']  ?? 'https://lenta-stalnaja.ru'), '/');
        $siteName = trim($_POST['site_name'] ?? 'Каталог металлопроката');
    // Auto-detect MySQL Unix socket path
        $mysqlSockCandidates = ['/var/run/mysqld/mysqld.sock','/tmp/mysql.sock','/var/lib/mysql/mysql.sock'];
        $mysqlSockPath = '';
        foreach ($mysqlSockCandidates as $sc) { if (file_exists($sc)) { $mysqlSockPath = $sc; break; } }
    if ($user && $db) {
            $mysqlLine = $mysqlSockPath
                ? "MYSQL_SOCKET=$mysqlSockPath\n"
                : "MYSQL_HOST=$host\nMYSQL_PORT=$port\n";
            $env = $mysqlLine
                 . "MYSQL_USER=$user\nMYSQL_PASSWORD=$pass\nMYSQL_DATABASE=$db\n"
                 . "SITE_URL=$siteUrl\nSITE_NAME=$siteName\n"
                 . "SOCKET_PATH=/home/i/infogkmeta/node.sock\nNODE_ENV=production\n";
            file_put_contents($envFile, $env);
            // Restart node
            exec('pkill -f "node.*app.js" 2>/dev/null');
            if (file_exists(NODE_SOCKET)) @unlink(NODE_SOCKET);
            sleep(1);
            startNode();
            $saved = true;
            $msg   = '✅ .env сохранён. Нода перезапущена. <a href="/">Открыть сайт</a>';
        } else {
            $msg = '❌ Заполните user и database.';
        }
    }
    $existing = file_exists($envFile) ? htmlspecialchars(file_get_contents($envFile)) : '';
    header('Content-Type: text/html; charset=UTF-8');
    echo <<<HTML
<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Setup</title>
<style>body{font-family:sans-serif;max-width:600px;margin:40px auto}input{width:100%;padding:6px;margin:4px 0}label{font-weight:bold}</style>
</head><body>
<h2>MySQL Setup — lenta-stalnaja</h2>
<p>Введите MySQL credentials из панели SpaceWeb (раздел "Базы данных").</p>
<p style="color:green">$msg</p>
<form method="POST">
  <label>MySQL Host:</label><input name="mysql_host" value="localhost"><br>
  <label>MySQL Port:</label><input name="mysql_port" value="3306"><br>
  <label>MySQL User:</label><input name="mysql_user" required><br>
  <label>MySQL Password:</label><input name="mysql_password" type="password"><br>
  <label>MySQL Database:</label><input name="mysql_database" required><br>
  <hr>
  <label>Site URL (без слэша):</label><input name="site_url" value="https://lenta-stalnaja.ru"><br>
  <label>Site Name:</label><input name="site_name" value="Каталог металлопроката"><br><br>
  <button type="submit" style="padding:8px 20px;background:#007bff;color:#fff;border:none;cursor:pointer">Сохранить и перезапустить</button>
</form>
<h3>Текущий .env:</h3><pre style="background:#f4f4f4;padding:10px">$existing</pre>
</body></html>
HTML;
    exit;
}

// #region agent log — debug endpoint (returns JSON state + node crash test)
if (parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH) === '/__debug__') {
    $dbgPidRaw   = file_exists(PID_FILE) ? trim(file_get_contents(PID_FILE)) : '';
    $dbgPid      = (int) $dbgPidRaw;
    $dbgPidAlive = ($dbgPid > 0 && file_exists("/proc/$dbgPid"));
    $dbgSocketExists = file_exists(NODE_SOCKET);
    $dbgSocketType   = $dbgSocketExists ? filetype(NODE_SOCKET) : 'missing';
    $dbgPort         = ($dbgSocketExists && $dbgSocketType === 'socket');
    $dbgSockErr      = 0; $dbgSockMsg = $dbgSocketType;
    $dbgSock3000 = @fsockopen('127.0.0.1', 3000, $e3, $m3, 2);
    $dbgPort3000 = (bool) $dbgSock3000;
    if ($dbgSock3000) fclose($dbgSock3000);
    $dbgPgrep    = trim((string) shell_exec('pgrep -f "node" 2>/dev/null'));
    // Filter out [DIAG] lines, get last 30 real log lines
    $dbgAllLines = file_exists(LOG_FILE) ? file(LOG_FILE) : [];
    $dbgRealLines = array_values(array_filter($dbgAllLines, function($l) { return strpos($l, '[DIAG]') === false; }));
    $dbgLogLines  = array_slice($dbgRealLines, -30);
    // Check MySQL socket paths
    $mysqlSockets = ['/var/run/mysqld/mysqld.sock', '/tmp/mysql.sock', '/var/lib/mysql/mysql.sock', '/tmp/mysqld.sock'];
    $dbgMysqlSock = '';
    foreach ($mysqlSockets as $s) { if (file_exists($s)) { $dbgMysqlSock = $s; break; } }
    // Check alternative launchers
    $dbgAtAvail     = trim((string) shell_exec('which at 2>/dev/null'));
    $dbgScreenAvail = trim((string) shell_exec('which screen 2>/dev/null'));
    $dbgTmuxAvail   = trim((string) shell_exec('which tmux 2>/dev/null'));
    $dbgAtqOut      = trim((string) shell_exec('atq 2>/dev/null'));
    // Check port 8765 on BOTH IPv4 and IPv6
    $dbgSockV6 = @fsockopen('[::1]', 8765, $dbgSockV6Err, $dbgSockV6Msg, 2);
    $dbgPortV6 = (bool)$dbgSockV6; if ($dbgSockV6) fclose($dbgSockV6);
    // Try connecting via hostname and server IP
    $dbgLocalhost = gethostbyname('localhost');
    $dbgServerIp  = gethostbyname(gethostname());
    $dbgSockHost  = @fsockopen($dbgLocalhost, 8765, $eH, $mH, 2);
    $dbgPortHost  = (bool)$dbgSockHost; if ($dbgSockHost) fclose($dbgSockHost);
    $dbgSockSrv   = @fsockopen($dbgServerIp, 8765, $eSrv, $mSrv, 2);
    $dbgPortSrv   = (bool)$dbgSockSrv; if ($dbgSockSrv) fclose($dbgSockSrv);
    // Check what's actually listening (netstat/ss)
    $dbgNetstat = trim((string) shell_exec('ss -tlnp 2>/dev/null || netstat -tlnp 2>/dev/null'));
    // Optional: force a node start via ?start=1
    $dbgStartLog = '';
    if (isset($_GET['start'])) {
        exec('pkill -f "node.*app.js" 2>/dev/null');
        if (file_exists(NODE_SOCKET)) @unlink(NODE_SOCKET);
        sleep(1);
        startNode();
        $dbgStartLog = 'startNode() triggered; socket=' . (file_exists(NODE_SOCKET) ? filetype(NODE_SOCKET) : 'missing');
    }
    // Optional: test `at` launcher via ?at=1
    if (isset($_GET['at']) && $dbgAtAvail) {
        $atCmd = 'cd ' . APP_DIR . ' && HOME=' . HOME_DIR . ' setsid nohup node src/app.js >> ' . LOG_FILE . ' 2>&1';
        $echoCmd = 'echo ' . escapeshellarg($atCmd) . ' | at now 2>&1';
        $dbgStartLog = 'at: ' . trim((string) shell_exec($echoCmd));
    }
    // Run quick node sanity check (not full app — just version)
    $dbgNodeTest = shell_exec('node --version 2>&1');
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
        'socket_exists' => $dbgSocketExists,
        'socket_type'   => $dbgSocketType,
        'socket_ready'  => $dbgPort,
        'port_3000'    => $dbgPort3000,
        'node_pids'    => $dbgPgrep,
        'mysql_socket' => $dbgMysqlSock,
        'at_avail'     => $dbgAtAvail,
        'screen_avail' => $dbgScreenAvail,
        'tmux_avail'   => $dbgTmuxAvail,
        'port_8765_v6'     => $dbgPortV6,
        'port_8765_v6_err' => $dbgSockV6Err . ': ' . $dbgSockV6Msg,
        'localhost_ip'     => $dbgLocalhost,
        'server_ip'        => $dbgServerIp,
        'port_8765_host'   => $dbgPortHost,
        'port_8765_host_err' => $eH . ': ' . $mH,
        'port_8765_srv'    => $dbgPortSrv,
        'port_8765_srv_err'  => $eSrv . ': ' . $mSrv,
        'netstat'          => $dbgNetstat,
        'start_result' => $dbgStartLog,
        'node_test'    => $dbgNodeTest,
        'last_log'     => $dbgLogLines,
    ], JSON_PRETTY_PRINT);
    exit;
}
// #endregion

// ── 1. Check if Node.js Unix socket is ready ─────────────────────────────────
// TCP loopback is blocked by per-process network namespace isolation on SpaceWeb.
// Unix domain socket uses the filesystem so it bypasses network isolation.
function isNodePortOpen(): bool {
    if (!file_exists(NODE_SOCKET) || filetype(NODE_SOCKET) !== 'socket') return false;
    $errno = 0; $errstr = '';
    $sock = @stream_socket_client('unix://' . NODE_SOCKET, $errno, $errstr, 1);
    if ($sock) {
        fclose($sock);
        return true;
    }
    // Stale socket file from dead Node process.
    @unlink(NODE_SOCKET);
    file_put_contents(LOG_FILE, "[" . date('Y-m-d H:i:s') . "] Removed stale socket: " . NODE_SOCKET . "\n", FILE_APPEND);
    return false;
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

// ── 3b. Ensure legacy Nunjucks filter alias exists in app.js ──────────────────
function ensureFormatMmAliasInAppJs(): void {
    $appJs = APP_DIR . '/src/app.js';
    if (!file_exists($appJs)) return;
    $src = file_get_contents($appJs);
    if ($src === false || strpos($src, "addFilter('formatThickness'") === false) return;
    if (strpos($src, "addFilter('formatMm'") !== false) return;

    $patched = preg_replace(
        "/(addFilter\\('formatThickness'[^\\n]*\\);)/",
        "$1\nnjkEnv.addFilter('formatMm', formatMmForDisplay);",
        $src,
        1
    );
    if ($patched && $patched !== $src) {
        file_put_contents($appJs, $patched);
        file_put_contents(LOG_FILE, "[" . date('Y-m-d H:i:s') . "] Patched app.js: injected formatMm alias\n", FILE_APPEND);
    }
}

// ── 3c. Pull latest code from git repo using explicit APP_DIR ─────────────────
function tryGitPullRepo(): void {
    if (!is_dir(APP_DIR . '/.git')) {
        file_put_contents(LOG_FILE, "[" . date('Y-m-d H:i:s') . "] Git repo not found in APP_DIR, skip pull\n", FILE_APPEND);
        return;
    }
    $cmd = 'git -C ' . escapeshellarg(APP_DIR) . ' pull origin main 2>&1';
    $out = trim((string) shell_exec($cmd));
    file_put_contents(LOG_FILE, "[" . date('Y-m-d H:i:s') . "] git pull (APP_DIR): " . ($out ?: 'ok') . "\n", FILE_APPEND);
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
    $deploySha = trim((string) shell_exec('git -C ' . escapeshellarg(APP_DIR) . ' rev-parse --short HEAD 2>/dev/null'));
    if (!$deploySha) $deploySha = 'unknown';
    $bootAt = gmdate('c');

    // Pull latest code from the repository folder (never from /home root).
    tryGitPullRepo();

    // Ensure compatibility alias before Node boot, even on stale FTP deploy.
    ensureFormatMmAliasInAppJs();

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

    // Remove stale Unix socket file if it exists
    if (file_exists(NODE_SOCKET)) @unlink(NODE_SOCKET);

    // Launch — setsid creates new session so hosting cgroup cleanup won't kill node
    file_put_contents(LOG_FILE, "[" . date('Y-m-d H:i:s') . "] Launching node src/app.js...\n", FILE_APPEND);
    // Try setsid first (creates new session, detaches from PHP cgroup); fall back to nohup only
    $hasSetsid = (trim((string) shell_exec('which setsid 2>/dev/null')) !== '');
    if ($hasSetsid) {
        $cmd = 'cd ' . APP_DIR
             . ' && HOME=' . HOME_DIR
             . ' SOCKET_PATH=' . NODE_SOCKET
             . ' DEPLOY_GIT_SHA=' . escapeshellarg($deploySha)
             . ' DEPLOY_BOOT_AT=' . escapeshellarg($bootAt)
             . ' setsid nohup node src/app.js >> ' . LOG_FILE . ' 2>&1 & echo $!';
    } else {
        $cmd = 'cd ' . APP_DIR
             . ' && HOME=' . HOME_DIR
             . ' SOCKET_PATH=' . NODE_SOCKET
             . ' DEPLOY_GIT_SHA=' . escapeshellarg($deploySha)
             . ' DEPLOY_BOOT_AT=' . escapeshellarg($bootAt)
             . ' nohup node src/app.js >> ' . LOG_FILE . ' 2>&1 & NPID=$!; disown $NPID 2>/dev/null; echo $NPID';
    }
    file_put_contents(LOG_FILE, "[" . date('Y-m-d H:i:s') . "] setsid=" . ($hasSetsid ? 'YES' : 'NO') . "\n", FILE_APPEND);
    file_put_contents(LOG_FILE, "[" . date('Y-m-d H:i:s') . "] deploy_sha=" . $deploySha . " deploy_boot_at=" . $bootAt . "\n", FILE_APPEND);
    $pid = trim((string) shell_exec($cmd));
    if ($pid) file_put_contents(PID_FILE, $pid);
    sleep(8);

    // #region agent log — post-launch diagnostics
    $ts2 = date('Y-m-d H:i:s');
    $pidAlive  = ($pid && file_exists("/proc/$pid")) ? 'YES' : 'NO';
    $sockReady = (file_exists(NODE_SOCKET) && filetype(NODE_SOCKET) === 'socket') ? 'READY' : 'MISSING';
    $anyNode   = shell_exec('pgrep -f "node" 2>/dev/null') ?: '';
    file_put_contents(LOG_FILE,
        "[$ts2][POST-LAUNCH] pid=$pid pidAlive=$pidAlive socket=$sockReady anyNodePids=" . trim(str_replace("\n", ',', $anyNode)) . "\n",
        FILE_APPEND);
    // #endregion
}

// ── 6. Try to ensure Node.js is running ──────────────────────────────────────
$canExec = function_exists('shell_exec') && function_exists('exec')
           && !in_array('shell_exec', array_map('trim', explode(',', ini_get('disable_functions'))));

if ($canExec && !isNodePortOpen()) {
    $startLock = HOME_DIR . '/node_start.lock';
    $startFh   = fopen($startLock, 'c');
    if ($startFh) {
        if (flock($startFh, LOCK_EX | LOCK_NB)) {
            // Got the lock: we are the only request starting node
            if (!isNodePortOpen()) {          // double-check under lock
                exec('pkill -f "node.*app.js" 2>/dev/null');
                sleep(1);
                startNode();
            }
            flock($startFh, LOCK_UN);
        } else {
            // Another request is already starting node — just wait for it
            fclose($startFh);
            sleep(10);
        }
        if (is_resource($startFh)) fclose($startFh);
    }
}

// ── 7. Proxy request via cURL (via Unix domain socket) ───────────────────────
$uri    = $_SERVER['REQUEST_URI'];
$method = $_SERVER['REQUEST_METHOD'];
$target = NODE_URL . $uri;  // host part is irrelevant; cURL uses the socket file

$ch = curl_init($target);
curl_setopt_array($ch, [
    CURLOPT_CUSTOMREQUEST    => $method,
    CURLOPT_RETURNTRANSFER   => true,
    CURLOPT_HEADER           => true,
    CURLOPT_FOLLOWLOCATION   => false,
    CURLOPT_TIMEOUT          => 30,
    CURLOPT_CONNECTTIMEOUT   => 5,
    CURLOPT_UNIX_SOCKET_PATH => NODE_SOCKET,  // bypass network namespace isolation
]);

// Forward request body (POST / PUT / PATCH)
$isMultipart = false;
if (in_array($method, ['POST', 'PUT', 'PATCH'])) {
    $ct = isset($_SERVER['CONTENT_TYPE']) ? $_SERVER['CONTENT_TYPE'] : '';
    if (stripos($ct, 'multipart/form-data') !== false) {
        // php://input is empty for multipart — rebuild from $_POST + $_FILES
        $isMultipart = true;
        $fields = [];
        foreach ($_POST as $k => $v) { $fields[$k] = $v; }
        foreach ($_FILES as $k => $f) {
            if ($f['error'] === UPLOAD_ERR_OK) {
                $fields[$k] = new \CURLFile($f['tmp_name'], $f['type'], $f['name']);
            }
        }
        curl_setopt($ch, CURLOPT_POSTFIELDS, $fields);
    } else {
        curl_setopt($ch, CURLOPT_POSTFIELDS, file_get_contents('php://input'));
    }
}

// Forward request headers (skip Content-Type for multipart — cURL sets it with boundary)
$reqHeaders = [];
if (function_exists('getallheaders')) {
    foreach (getallheaders() as $k => $v) {
        $l = strtolower($k);
        if (in_array($l, ['host', 'connection', 'content-length'])) continue;
        if ($isMultipart && $l === 'content-type') continue;
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

    // Live socket check
    $diagSockExists = file_exists(NODE_SOCKET);
    $diagSockType   = $diagSockExists ? filetype(NODE_SOCKET) : 'missing';
    $diagPort       = ($diagSockExists && $diagSockType === 'socket') ? '✅ READY' : "❌ MISSING (type=$diagSockType)";

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
        ['Unix socket (node.sock)',           $diagPort],
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

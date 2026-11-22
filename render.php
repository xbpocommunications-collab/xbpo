<?php
/**
 * XBPO Communications - Server-Side Dynamic Link & Contact Injector for Public HTML Pages (PHP Hosting)
 */

require_once __DIR__ . '/api/bootstrap.php';

xbpo_security_headers();

$allowedPages = [
    'index.html',
    'about.html',
    'services.html',
    'team.html',
    'careers.html',
    'contact.html',
    'process.html',
    'privacy.html',
    'role-fronter.html',
    'role-closer.html',
    'role-verifier.html',
    'service-appointments.html',
    'service-final-expense.html',
    'service-lead-generation.html',
    'service-operations.html',
    'service-quality.html',
    'service-us-outbound.html',
];
$rawPage = trim((string)($_GET['page'] ?? ''));
$rawPage = ltrim($rawPage, '/');
if ($rawPage === '' || $rawPage === '.html') {
    $rawPage = 'index.html';
} elseif (substr($rawPage, -5) !== '.html') {
    $rawPage .= '.html';
}
$requested = basename($rawPage);
if (!in_array($requested, $allowedPages, true)) {
    $requested = 'index.html';
}

$fullPath = __DIR__ . DIRECTORY_SEPARATOR . $requested;
if (!is_file($fullPath)) {
    http_response_code(404);
    echo 'Page not found.';
    exit;
}

$html = (string)file_get_contents($fullPath);

try {
    $pdo = xbpo_pdo();
    $stmt = $pdo->prepare('SELECT instagram_url, facebook_url, google_url, contact_email, contact_phone FROM site_settings WHERE setting_key = ? LIMIT 1');
    $stmt->execute(['public']);
    if ($s = $stmt->fetch()) {
        $esc = static function ($v) {
            return htmlspecialchars((string)$v, ENT_QUOTES, 'UTF-8');
        };
        $html = str_replace(
            [
                XBPO_DEFAULT_SETTINGS['instagramUrl'],
                XBPO_DEFAULT_SETTINGS['facebookUrl'],
                XBPO_DEFAULT_SETTINGS['googleUrl'],
                XBPO_DEFAULT_SETTINGS['contactEmail'],
                XBPO_DEFAULT_SETTINGS['contactPhone'],
            ],
            [
                $esc($s['instagram_url']),
                $esc($s['facebook_url']),
                $esc($s['google_url']),
                $esc($s['contact_email']),
                $esc($s['contact_phone']),
            ],
            $html
        );
    }
} catch (Throwable $e) {
    // Gracefully serve raw HTML if .env is not yet configured; script.js still hydrates when API is up.
}

header('Content-Type: text/html; charset=utf-8');
echo $html;

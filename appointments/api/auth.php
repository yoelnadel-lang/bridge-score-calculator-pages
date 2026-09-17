<?php
require_once __DIR__ . '/helpers.php';
session_start();

$action = $_GET['action'] ?? '';

if ($action === 'login' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $body = json_body();
    $username = trim($body['username'] ?? '');
    $password = $body['password'] ?? '';

    $row = db()->query('SELECT admin_username, admin_password_hash FROM settings WHERE id = 1')->fetch();
    if (!$row || empty($row['admin_password_hash'])) {
        json_error('לא בוצעה התקנה ראשונית — יש להריץ תחילה את api/setup.php', 500);
    }
    if ($username !== $row['admin_username'] || !password_verify($password, $row['admin_password_hash'])) {
        json_error('שם משתמש או סיסמה שגויים', 401);
    }
    $_SESSION['admin'] = true;
    json_response(['ok' => true]);
}

if ($action === 'logout') {
    $_SESSION = [];
    session_destroy();
    json_response(['ok' => true]);
}

if ($action === 'me') {
    json_response(['loggedIn' => !empty($_SESSION['admin'])]);
}

json_error('פעולה לא ידועה', 404);

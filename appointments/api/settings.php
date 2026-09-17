<?php
require_once __DIR__ . '/helpers.php';
session_start();

$action = $_GET['action'] ?? '';

// ציבורי — נדרש לדף ההזמנה כדי להציג שם עסק/שירותים/שעות
if ($action === 'public') {
    $settings = get_settings();
    json_response([
        'businessName' => $settings['business_name'],
        'whatsappNumber' => $settings['whatsapp_number'],
        'slotIntervalMinutes' => (int) $settings['slot_interval_minutes'],
        'workHours' => $settings['work_hours'],
        'services' => get_active_services(),
    ]);
}

ensure_admin();

if ($action === 'get') {
    $settings = get_settings();
    $settings['services'] = db()->query('SELECT * FROM services ORDER BY id')->fetchAll();
    json_response($settings);
}

if ($action === 'update' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $body = json_body();
    $stmt = db()->prepare(
        'UPDATE settings SET business_name = ?, whatsapp_number = ?, slot_interval_minutes = ?, work_hours = ? WHERE id = 1'
    );
    $stmt->execute([
        trim($body['businessName'] ?? 'העסק'),
        preg_replace('/\D/', '', $body['whatsappNumber'] ?? ''),
        max(5, (int) ($body['slotIntervalMinutes'] ?? 30)),
        json_encode($body['workHours'] ?? [], JSON_UNESCAPED_UNICODE),
    ]);
    json_response(['ok' => true]);
}

if ($action === 'save_service' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $body = json_body();
    $name = trim($body['name'] ?? '');
    $duration = (int) ($body['durationMinutes'] ?? 0);
    $price = (float) ($body['price'] ?? 0);
    $active = !empty($body['active']) ? 1 : 0;
    if ($name === '' || $duration <= 0) json_error('נא להזין שם ומשך תקין');

    if (!empty($body['id'])) {
        $stmt = db()->prepare('UPDATE services SET name=?, duration_minutes=?, price=?, active=? WHERE id=?');
        $stmt->execute([$name, $duration, $price, $active, (int) $body['id']]);
    } else {
        $stmt = db()->prepare('INSERT INTO services (name, duration_minutes, price, active) VALUES (?,?,?,?)');
        $stmt->execute([$name, $duration, $price, $active]);
    }
    json_response(['ok' => true]);
}

if ($action === 'delete_service' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $body = json_body();
    $stmt = db()->prepare('DELETE FROM services WHERE id = ?');
    $stmt->execute([(int) ($body['id'] ?? 0)]);
    json_response(['ok' => true]);
}

json_error('פעולה לא ידועה', 404);

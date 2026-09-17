<?php
require_once __DIR__ . '/helpers.php';
session_start();
$isAdmin = !empty($_SESSION['admin']);

$action = $_GET['action'] ?? '';

if ($action === 'available_slots') {
    $date = $_GET['date'] ?? '';
    $serviceId = (int) ($_GET['service_id'] ?? 0);
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) json_error('תאריך לא תקין');

    $stmt = db()->prepare('SELECT duration_minutes FROM services WHERE id = ? AND active = 1');
    $stmt->execute([$serviceId]);
    $svc = $stmt->fetch();
    if (!$svc) json_error('שירות לא נמצא', 404);

    json_response(['slots' => compute_available_slots($date, (int) $svc['duration_minutes'])]);
}

if ($action === 'create' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $body = json_body();
    $date = $body['date'] ?? '';
    $time = $body['time'] ?? '';
    $serviceId = (int) ($body['service_id'] ?? 0);
    $clientName = trim($body['client_name'] ?? '');
    $clientPhone = trim($body['client_phone'] ?? '');
    $note = trim($body['note'] ?? '');

    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) || !preg_match('/^\d{2}:\d{2}$/', $time)) {
        json_error('תאריך/שעה לא תקינים');
    }
    if ($clientName === '' || $clientPhone === '') json_error('נא להזין שם וטלפון');

    $stmt = db()->prepare('SELECT * FROM services WHERE id = ? AND active = 1');
    $stmt->execute([$serviceId]);
    $svc = $stmt->fetch();
    if (!$svc) json_error('שירות לא נמצא', 404);

    // אימות זמינות בצד השרת — לא סומכים על מה שהלקוח שלח בטופס,
    // כדי למנוע כפילות תור גם אם שתי בקשות נשלחו כמעט באותו רגע.
    $available = compute_available_slots($date, (int) $svc['duration_minutes']);
    if (!in_array($time, $available, true)) {
        json_error('השעה שנבחרה כבר אינה פנויה, נא לבחור שעה אחרת', 409);
    }

    // תור שנוצר מדף הניהול (משתמש מחובר) נכנס כ"מאושר" ישירות;
    // תור מדף ההזמנה הציבורי נכנס כ"ממתין" עד אישור ידני.
    global $isAdmin;
    $status = ($isAdmin && ($body['status'] ?? '') === 'confirmed') ? 'confirmed' : 'pending';

    $stmt = db()->prepare(
        'INSERT INTO appointments (service_id, service_name, duration_minutes, price, appt_date, appt_time, client_name, client_phone, note, status)
         VALUES (?,?,?,?,?,?,?,?,?,?)'
    );
    $stmt->execute([
        $svc['id'], $svc['name'], $svc['duration_minutes'], $svc['price'],
        $date, $time, $clientName, $clientPhone, $note, $status,
    ]);

    json_response(['ok' => true, 'id' => (int) db()->lastInsertId(), 'status' => $status]);
}

// --- הפעולות הבאות מיועדות לאזור הניהול בלבד ---
ensure_admin();

if ($action === 'list') {
    $filter = $_GET['filter'] ?? 'upcoming';
    $sql = 'SELECT * FROM appointments';
    $params = [];
    if ($filter === 'upcoming') {
        $sql .= " WHERE status != 'cancelled' AND appt_date >= ?";
        $params[] = date('Y-m-d');
    } elseif ($filter === 'cancelled') {
        $sql .= " WHERE status = 'cancelled'";
    }
    $sql .= ' ORDER BY appt_date, appt_time';
    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    json_response(['appointments' => $stmt->fetchAll()]);
}

if ($action === 'update_status' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $body = json_body();
    $id = (int) ($body['id'] ?? 0);
    $status = $body['status'] ?? '';
    if (!in_array($status, ['confirmed', 'cancelled', 'done'], true)) json_error('סטטוס לא תקין');
    $stmt = db()->prepare('UPDATE appointments SET status = ? WHERE id = ?');
    $stmt->execute([$status, $id]);
    json_response(['ok' => true]);
}

if ($action === 'delete' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $body = json_body();
    $stmt = db()->prepare('DELETE FROM appointments WHERE id = ?');
    $stmt->execute([(int) ($body['id'] ?? 0)]);
    json_response(['ok' => true]);
}

json_error('פעולה לא ידועה', 404);

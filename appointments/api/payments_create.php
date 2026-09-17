<?php
require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/CardcomGateway.php';
session_start();
ensure_admin();

$body = json_body();
$id = (int) ($body['appointment_id'] ?? 0);
$amount = isset($body['amount']) ? (float) $body['amount'] : null;

$stmt = db()->prepare('SELECT * FROM appointments WHERE id = ?');
$stmt->execute([$id]);
$appt = $stmt->fetch();
if (!$appt) json_error('תור לא נמצא', 404);

$amount = $amount ?? (float) $appt['price'];
if ($amount <= 0) json_error('נא להזין סכום גבייה תקין');

$cfg = app_config();
$base = rtrim($cfg['site_base_url'], '/');
$gateway = new CardcomGateway($cfg['cardcom']);

try {
    $result = $gateway->createPayment([
        'returnValue' => (string) $appt['id'],
        'amount' => $amount,
        'productName' => $appt['service_name'],
        'clientName' => $appt['client_name'],
        'successUrl' => $base . '/payment-done.html?status=success',
        'failUrl' => $base . '/payment-done.html?status=fail',
        'webhookUrl' => $base . '/api/payments_callback.php',
    ]);
} catch (Throwable $e) {
    json_error('שגיאה ביצירת עסקת סליקה: ' . $e->getMessage(), 502);
}

$stmt = db()->prepare(
    'UPDATE appointments SET payment_status = "pending", payment_amount = ?, payment_low_profile_id = ? WHERE id = ?'
);
$stmt->execute([$amount, $result['lowProfileId'], $id]);

json_response(['ok' => true, 'paymentUrl' => $result['url']]);

<?php
// יעד ה-Webhook שקארדקום קוראת אליו לאחר תשלום. אין לסמוך על תוכן הבקשה
// עצמה כאסמכתא לתשלום — לכן היא משמשת רק כטריגר, ומייד לאחר מכן אנחנו
// שולפים בעצמנו את התוצאה האמיתית והמאומתת ישירות מול קארדקום.

require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/CardcomGateway.php';

$body = json_body();
$lowProfileId = $body['LowProfileId'] ?? $body['lowProfileId'] ?? ($_GET['LowProfileId'] ?? null);
if (!$lowProfileId) {
    json_error('חסר LowProfileId', 400);
}

$stmt = db()->prepare('SELECT * FROM appointments WHERE payment_low_profile_id = ?');
$stmt->execute([$lowProfileId]);
$appt = $stmt->fetch();
if (!$appt) json_error('לא נמצא תור תואם לעסקה זו', 404);

$cfg = app_config();
$gateway = new CardcomGateway($cfg['cardcom']);

try {
    $result = $gateway->getPaymentResult($lowProfileId);
} catch (Throwable $e) {
    json_error('שגיאה באימות התשלום מול קארדקום: ' . $e->getMessage(), 502);
}

if ($result['success']) {
    $stmt = db()->prepare(
        'UPDATE appointments SET payment_status = "paid", payment_amount = ?, invoice_number = ?, invoice_url = ? WHERE id = ?'
    );
    $stmt->execute([$result['amount'] ?? $appt['payment_amount'], $result['invoiceNumber'], $result['invoiceUrl'], $appt['id']]);
} else {
    $stmt = db()->prepare('UPDATE appointments SET payment_status = "unpaid" WHERE id = ?');
    $stmt->execute([$appt['id']]);
}

json_response(['ok' => true]);

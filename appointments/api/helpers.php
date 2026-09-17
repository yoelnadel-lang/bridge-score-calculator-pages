<?php
require_once __DIR__ . '/db.php';

function json_body(): array
{
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function json_response($data, int $code = 200): void
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function json_error(string $message, int $code = 400): void
{
    json_response(['error' => $message], $code);
}

function ensure_admin(): void
{
    if (session_status() === PHP_SESSION_NONE) session_start();
    if (empty($_SESSION['admin'])) {
        json_error('נדרשת התחברות', 401);
    }
}

function get_settings(): array
{
    $row = db()->query('SELECT * FROM settings WHERE id = 1')->fetch();
    if (!$row) json_error('לא נמצאו הגדרות עסק — יש להריץ תחילה את api/setup.php', 500);
    $row['work_hours'] = json_decode($row['work_hours'], true);
    unset($row['admin_password_hash']);
    return $row;
}

function get_active_services(): array
{
    return db()->query('SELECT id, name, duration_minutes, price FROM services WHERE active = 1 ORDER BY id')->fetchAll();
}

function normalize_phone_il(string $phone): string
{
    $digits = preg_replace('/\D/', '', $phone);
    if (str_starts_with($digits, '0')) {
        $digits = '972' . substr($digits, 1);
    }
    return $digits;
}

// רשימת שעות פנויות בתאריך נתון עבור משך שירות נתון, מול התורים
// האמיתיים השמורים במסד הנתונים (למעט תורים שבוטלו).
function compute_available_slots(string $dateStr, int $durationMinutes): array
{
    $settings = get_settings();
    $dow = (string) (int) date('w', strtotime($dateStr));
    $hours = $settings['work_hours'][$dow] ?? null;
    if (!$hours || empty($hours['open'])) return [];

    $toMinutes = fn(string $t) => ((int) substr($t, 0, 2)) * 60 + ((int) substr($t, 3, 2));
    $startMin = $toMinutes($hours['start']);
    $endMin = $toMinutes($hours['end']);
    $interval = max(5, (int) $settings['slot_interval_minutes']);

    $stmt = db()->prepare(
        "SELECT appt_time, duration_minutes FROM appointments
         WHERE appt_date = ? AND status != 'cancelled'"
    );
    $stmt->execute([$dateStr]);
    $busy = array_map(function ($r) use ($toMinutes) {
        $start = $toMinutes(substr($r['appt_time'], 0, 5));
        return ['start' => $start, 'end' => $start + (int) $r['duration_minutes']];
    }, $stmt->fetchAll());

    $isToday = $dateStr === date('Y-m-d');
    $nowMin = ((int) date('H')) * 60 + (int) date('i');

    $slots = [];
    for ($t = $startMin; $t + $durationMinutes <= $endMin; $t += $interval) {
        if ($isToday && $t <= $nowMin) continue;
        $overlaps = false;
        foreach ($busy as $b) {
            if ($t < $b['end'] && ($t + $durationMinutes) > $b['start']) { $overlaps = true; break; }
        }
        if (!$overlaps) {
            $slots[] = sprintf('%02d:%02d', intdiv($t, 60), $t % 60);
        }
    }
    return $slots;
}

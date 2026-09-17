<?php
// דף התקנה חד-פעמי ליצירת שם המשתמש/סיסמה לאזור הניהול.
// לאחר ההתקנה הראשונית הדף נועל את עצמו אוטומטית ולא ניתן להריץ אותו שוב
// (כדי שאיש לא יוכל לאפס את הסיסמה דרכו אם הקישור נשאר בגלוי).

require_once __DIR__ . '/db.php';

$existing = db()->query('SELECT admin_password_hash FROM settings WHERE id = 1')->fetch();
$alreadySet = $existing && !empty($existing['admin_password_hash']);

$error = null;
$success = false;

if ($_SERVER['REQUEST_METHOD'] === 'POST' && !$alreadySet) {
    $username = trim($_POST['username'] ?? '');
    $password = $_POST['password'] ?? '';
    if ($username === '' || strlen($password) < 6) {
        $error = 'יש להזין שם משתמש וסיסמה של לפחות 6 תווים.';
    } else {
        $hash = password_hash($password, PASSWORD_DEFAULT);
        $stmt = db()->prepare('UPDATE settings SET admin_username = ?, admin_password_hash = ? WHERE id = 1');
        $stmt->execute([$username, $hash]);
        $success = true;
        $alreadySet = true;
    }
}
?>
<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="UTF-8">
<title>התקנה ראשונית</title>
<style>
  body { font-family: "Segoe UI", Arial, sans-serif; direction: rtl; background: #f6f8fa; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
  .box { background: #fff; border: 1px solid #d0d7de; border-radius: 12px; padding: 28px; max-width: 360px; width: 92%; }
  input { width: 100%; padding: 10px; margin-bottom: 12px; border: 1px solid #d0d7de; border-radius: 8px; box-sizing: border-box; }
  button { width: 100%; padding: 11px; border: none; border-radius: 8px; background: #0b5394; color: #fff; font-size: 1rem; cursor: pointer; }
  .error { color: #c1121f; }
  .success { color: #1a7f37; }
</style>
</head>
<body>
<div class="box">
<?php if ($success): ?>
  <p class="success">ההתקנה הושלמה בהצלחה. אפשר להתחבר עכשיו ב-<a href="../admin.html">אזור הניהול</a>.</p>
  <p>לביטחון, מומלץ למחוק או לשנות שם לקובץ setup.php כעת.</p>
<?php elseif ($alreadySet): ?>
  <p class="error">ההתקנה כבר בוצעה בעבר. אם שכחתם סיסמה, יש לעדכן ידנית בטבלת settings במסד הנתונים.</p>
<?php else: ?>
  <h2>הגדרת חשבון ניהול</h2>
  <p>יצירת שם משתמש וסיסמה חד-פעמית לאזור הניהול. פעולה זו אפשרית פעם אחת בלבד.</p>
  <?php if ($error): ?><p class="error"><?= htmlspecialchars($error) ?></p><?php endif; ?>
  <form method="post">
    <input name="username" placeholder="שם משתמש" required>
    <input name="password" type="password" placeholder="סיסמה (לפחות 6 תווים)" required>
    <button type="submit">יצירת חשבון</button>
  </form>
<?php endif; ?>
</div>
</body>
</html>

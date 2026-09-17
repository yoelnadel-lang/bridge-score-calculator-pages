<?php
/**
 * מתאם לחברת הסליקה קארדקום (Cardcom) — API v11, ממשק LowProfile (עמוד תשלום מתארח).
 *
 * חשוב לפני עלייה לאוויר: שמות השדות כאן מבוססים על תיעוד Cardcom הידוע,
 * אך לא אומתו מול התיעוד הרשמי המעודכן (לא הייתה גישה לאתר התיעוד בזמן
 * הכתיבה). יש לבדוק מול https://docs.cardcom.solutions ומול תמיכת קארדקום
 * שהשדות תואמים, ולבצע עסקת בדיקה במסוף הדגמה (טרמינל 1000) *לפני* שמפעילים
 * את זה מול לקוחות אמיתיים. כל הלוגיקה הספציפית לקארדקום מרוכזת בקובץ הזה
 * בלבד כדי שתיקון/שינוי ספק יהיה מקומי ולא יפגע בשאר המערכת.
 */
class CardcomGateway
{
    private string $terminalNumber;
    private string $apiName;
    private string $apiPassword;
    private string $baseUrl = 'https://secure.cardcom.solutions/api/v11';

    public function __construct(array $cfg)
    {
        $this->terminalNumber = (string) $cfg['terminal_number'];
        $this->apiName = (string) $cfg['api_name'];
        $this->apiPassword = (string) $cfg['api_password'];
    }

    /**
     * יוצר עמוד תשלום מתארח לתשלום בודד, כולל הפקת חשבונית/קבלה אוטומטית.
     * מחזיר: ['url' => כתובת עמוד התשלום, 'lowProfileId' => מזהה העסקה]
     */
    public function createPayment(array $params): array
    {
        $payload = [
            'TerminalNumber' => $this->terminalNumber,
            'ApiName' => $this->apiName,
            'Operation' => 'ChargeOnly',
            'ReturnValue' => (string) $params['returnValue'],
            'Amount' => (float) $params['amount'],
            'SuccessRedirectUrl' => $params['successUrl'],
            'FailedRedirectUrl' => $params['failUrl'],
            'WebHookUrl' => $params['webhookUrl'],
            'ProductName' => $params['productName'],
            'Language' => 'he',
            'ISOCoinId' => 1, // שקל חדש
            'Document' => [
                'DocumentTypeToCreate' => 'InvoiceReceipt',
                'Name' => $params['clientName'],
                'IsSendByEmail' => false,
                'Products' => [[
                    'Description' => $params['productName'],
                    'UnitCost' => (float) $params['amount'],
                    'Quantity' => 1,
                ]],
            ],
        ];

        $result = $this->post('/LowProfile/Create', $payload);
        if ((int) ($result['ResponseCode'] ?? -1) !== 0) {
            throw new RuntimeException('Cardcom create failed: ' . ($result['Description'] ?? 'unknown error'));
        }
        return [
            'url' => $result['Url'] ?? null,
            'lowProfileId' => $result['LowProfileId'] ?? null,
        ];
    }

    /**
     * שליפת תוצאת עסקה אמיתית ומאומתת מול קארדקום לפי מזהה LowProfileId.
     * אין לסמוך על תוכן ה-webhook עצמו — תמיד לאמת דרך הקריאה הזו.
     */
    public function getPaymentResult(string $lowProfileId): array
    {
        $payload = [
            'TerminalNumber' => $this->terminalNumber,
            'ApiName' => $this->apiName,
            'LowProfileId' => $lowProfileId,
        ];
        $result = $this->post('/LowProfile/GetLowProfileResult', $payload);
        $success = (int) ($result['ResponseCode'] ?? -1) === 0
            && (int) ($result['TranzactionInfo']['ResponseCode'] ?? $result['ResponseCode'] ?? -1) === 0;

        return [
            'success' => $success,
            'amount' => $result['TranzactionInfo']['Amount'] ?? $result['Amount'] ?? null,
            'invoiceNumber' => $result['DocumentInfo']['DocumentNumber'] ?? null,
            'invoiceUrl' => $result['DocumentInfo']['DocumentUrl'] ?? null,
            'raw' => $result,
        ];
    }

    private function post(string $path, array $payload): array
    {
        $ch = curl_init($this->baseUrl . $path);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
            CURLOPT_POSTFIELDS => json_encode($payload, JSON_UNESCAPED_UNICODE),
            CURLOPT_TIMEOUT => 20,
        ]);
        $response = curl_exec($ch);
        if ($response === false) {
            throw new RuntimeException('Cardcom request failed: ' . curl_error($ch));
        }
        curl_close($ch);
        $data = json_decode($response, true);
        return is_array($data) ? $data : [];
    }
}

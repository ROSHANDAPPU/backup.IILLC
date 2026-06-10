<?php
// submit-lead.php - Secure Server-Side Forwarder for HubSpot API
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Content-Type: application/json");

// Handle preflight OPTIONS request
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(["error" => "Method not allowed"]);
    exit;
}

// Retrieve raw POST input payload
$rawData = file_get_contents('php://input');
if (!$rawData) {
    http_response_code(400);
    echo json_encode(["error" => "Empty payload"]);
    exit;
}

// HubSpot Credentials (Kept secure on the server side)
$portalId = '51388633';
$formGuid = 'c5de09b0-5b5f-470d-83ac-b133359eec01';
$accessToken = 'pat-na1-92f05fa5-2818-4e52-a7b8-e9b4b43d9674';

$endpoint = "https://api.hsforms.com/submissions/v3/integration/secure/submit/" . $portalId . "/" . $formGuid;

// Initialize cURL session
$ch = curl_init($endpoint);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, $rawData);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Content-Type: application/json',
    'Authorization: Bearer ' . $accessToken
]);

$response = curl_exec($ch);
$statusCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlError = curl_error($ch);
curl_close($ch);

if ($curlError) {
    http_response_code(500);
    echo json_encode(["error" => "Proxy execution failure: " . $curlError]);
    exit;
}

// Mirror the HubSpot response status code back to client
http_response_code($statusCode);
echo $response;
?>

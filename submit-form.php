<?php
header('Content-Type: application/json');

// Get JSON input from the frontend fetch request
$requestBody = file_get_contents('php://input');
$data = json_decode($requestBody, true);

if (!$data) {
    http_response_code(400);
    echo json_encode(["status" => "error", "message" => "Invalid JSON payload"]);
    exit;
}

// HubSpot Credentials
$portalId = '51388633';
$formGuid = 'f47c4f3d-4891-4c48-a1a1-80a4240f5b51';
$accessToken = 'pat-na1-92f05fa5-2818-4e52-a7b8-e9b4b43d9674';

$endpoint = "https://api.hsforms.com/submissions/v3/integration/secure/submit/{$portalId}/{$formGuid}";

// Initialize cURL session
$ch = curl_init($endpoint);

// Set cURL options
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, $requestBody); // Pass the raw JSON directly to HubSpot
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Content-Type: application/json',
    'Authorization: Bearer ' . $accessToken
]);

// Execute cURL request
$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);

if (curl_errno($ch)) {
    http_response_code(500);
    echo json_encode(["status" => "error", "message" => "Curl error: " . curl_error($ch)]);
} else {
    http_response_code($httpCode);
    echo $response;
}

curl_close($ch);
?>

<?php
require_once("../db.php");
$data = json_decode(file_get_contents("php://input"), true);
$stmt = $conn->prepare("DELETE FROM produtos WHERE id = ?");
$stmt->execute([$data['id']]);
echo json_encode(["status" => "deletado"]);

<?php
require_once("../db.php");
$data = json_decode(file_get_contents("php://input"), true);
$stmt = $conn->prepare("UPDATE produtos SET nome = ?, preco = ? WHERE id = ?");
$stmt->execute([$data['nome'], $data['preco'], $data['id']]);
echo json_encode(["status" => "atualizado"]);

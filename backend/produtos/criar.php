<?php
require_once("../db.php");
$data = json_decode(file_get_contents("php://input"), true);
$stmt = $conn->prepare("INSERT INTO produtos (nome, preco) VALUES (?, ?)");
$stmt->execute([$data['nome'], $data['preco']]);
echo json_encode(["status" => "criado"]);

<?php
require_once("../db.php");
$stmt = $conn->query("SELECT * FROM produtos");
echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));

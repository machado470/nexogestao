<?php
$conn = new PDO("mysql:host=localhost;dbname=nexogestao", "root", "");
$conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
header("Content-Type: application/json");

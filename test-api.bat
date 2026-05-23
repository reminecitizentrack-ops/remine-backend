@echo off
chcp 65001 > nul
title Test API ReMine
echo ========================================
echo           🧪 TEST API ReMine
echo ========================================
echo.
echo 📍 Test de l'API sur http://localhost:5000
echo.

:: Attendre que le serveur soit démarré
timeout /t 3 /nobreak > nul

echo 1. Test de santé de l'API...
curl -s http://localhost:5000/api/health
echo.
echo.

echo 2. Test de connexion avec compte démo...
curl -s -X POST http://localhost:5000/api/auth/login ^
  -H "Content-Type: application/json" ^
  -d "{\"email\":\"demo@remine.sn\",\"password\":\"demo123\"}" ^
  | python -c "import json,sys; print(json.dumps(json.load(sys.stdin), indent=2))" 2>nul || ^
  curl -s -X POST http://localhost:5000/api/auth/login ^
  -H "Content-Type: application/json" ^
  -d "{\"email\":\"demo@remine.sn\",\"password\":\"demo123\"}"
echo.
echo.

echo 3. Test des statistiques...
curl -s http://localhost:5000/api/stats
echo.
echo.

echo ========================================
echo ✅ Tests terminés!
echo.
pause
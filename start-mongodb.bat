@echo off
chcp 65001 > nul
title Serveur ReMine Backend - Avec MongoDB
echo ========================================
echo    🚀 SERVEUR ReMine BACKEND - MONGODB
echo ========================================
echo.
echo 📍 Démmarrage du serveur API ReMine...
echo 📊 Port: 5000
echo 🌐 URL: http://localhost:5000
echo 🗄  Base de données: MongoDB
echo.
echo 💡 Commandes utiles:
echo    GET  /api/health          - Vérifier la santé
echo    POST /api/demo/setup      - Données de démo
echo    POST /api/auth/login      - Connexion
echo.
echo 🛑 Pour arrêter le serveur: Ctrl + C
echo ========================================
echo.

:: Vérifier si Node.js est installé
node --version > nul 2>&1
if errorlevel 1 (
    echo ❌ ERREUR: Node.js n'est pas installé!
    echo 💡 Téléchargez-le depuis: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

:: Vérifier si le fichier server.js existe
if not exist "server.js" (
    echo ❌ ERREUR: server.js n'existe pas!
    echo.
    pause
    exit /b 1
)

:: Vérifier si les dépendances sont installées
if not exist "node_modules" (
    echo 📦 Installation des dépendances...
    call npm install
    echo.
)

echo ✅ Démarrage du serveur avec MongoDB...
echo.

:: Démarrer le serveur
node server.js

:: Si le serveur s'arrête
echo.
echo ========================================
echo 🛑 Serveur ReMine arrêté
echo.
pause
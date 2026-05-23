@echo off
chcp 65001 > nul
title Serveur ReMine Backend - Version Simple
echo ========================================
echo    🚀 SERVEUR ReMine BACKEND - SIMPLE
echo ========================================
echo.
echo 📍 Démmarrage du serveur API ReMine...
echo 📊 Port: 5000
echo 🌐 URL: http://localhost:5000
echo.
echo 💡 Données de démo préchargées:
echo    👤 Email: demo@remine.sn
echo    🔒 Mot de passe: demo123
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

:: Vérifier si le fichier server-simple.js existe
if not exist "server-simple.js" (
    echo ❌ ERREUR: server-simple.js n'existe pas!
    echo 💡 Assurez-vous d'être dans le bon dossier.
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

echo ✅ Démarrage du serveur...
echo.

:: Démarrer le serveur
node server-simple.js

:: Si le serveur s'arrête
echo.
echo ========================================
echo 🛑 Serveur ReMine arrêté
echo.
pause
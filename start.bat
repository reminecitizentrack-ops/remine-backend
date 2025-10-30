@echo off
chcp 65001 > nul
title ReMine Backend Server
echo 🚀 Démarrage du serveur ReMine...
echo 📍 http://localhost:5000
echo 👤 demo@remine.sn / demo123
echo.
node server-simple.js
pause
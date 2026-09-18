@echo off
title Somaj App Backend Server
echo Starting Somaj Backend Server...
echo.
npm run dev 2>nul || node server.js
pause
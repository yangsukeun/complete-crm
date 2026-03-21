@echo off
cd /d "%~dp0"
REM PowerShell 실행 정책 때문에 npm.ps1이 막힐 때: npm 대신 npm.cmd 사용
call "%ProgramFiles%\nodejs\npm.cmd" run dev

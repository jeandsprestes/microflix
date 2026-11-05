@echo off
rem Abre o Microflix: liga o servidor local (sem janela) e abre o Microflix no Chrome.
start "" powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0servidor.ps1"

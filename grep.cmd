@echo off
setlocal EnableExtensions DisableDelayedExpansion
node "%~dp0scripts\win-grep.mjs" %*
exit /b %ERRORLEVEL%

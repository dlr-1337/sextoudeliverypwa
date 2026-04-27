@echo off
setlocal EnableExtensions DisableDelayedExpansion

set "NEGATE=0"
if "%~1"=="!" (
  set "NEGATE=1"
  shift /1
)

set "OP=%~1"
set "TARGET=%~2"
set "RESULT=1"

if "%OP%"=="-d" (
  if exist "%TARGET%\" set "RESULT=0"
) else if "%OP%"=="-f" (
  if exist "%TARGET%" if not exist "%TARGET%\" set "RESULT=0"
) else if "%OP%"=="-e" (
  if exist "%TARGET%" set "RESULT=0"
) else (
  exit /b 2
)

if "%NEGATE%"=="1" (
  if "%RESULT%"=="0" exit /b 1
  exit /b 0
)

exit /b %RESULT%

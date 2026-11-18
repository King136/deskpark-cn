@echo off
rem 飞牛移动适配客户端 - Hvigor 构建包装脚本 (Windows)

setlocal
set "PROJECT_HOME=%~dp0"

set "CLT_HOME="
if defined DEVECO_SDK_HOME set "CLT_HOME=%DEVECO_SDK_HOME%"
if not defined CLT_HOME if exist "%USERPROFILE%\command-line-tools\bin\hvigorw.bat" set "CLT_HOME=%USERPROFILE%\command-line-tools"
if not defined CLT_HOME if exist "C:\command-line-tools\bin\hvigorw.bat" set "CLT_HOME=C:\command-line-tools"
if not defined CLT_HOME if exist "%PROJECT_HOME%command-line-tools\bin\hvigorw.bat" set "CLT_HOME=%PROJECT_HOME%command-line-tools"
if not defined CLT_HOME if exist "%LOCALAPPDATA%\Huawei\Sdk\command-line-tools\latest\bin\hvigorw.bat" set "CLT_HOME=%LOCALAPPDATA%\Huawei\Sdk\command-line-tools\latest"

if not defined CLT_HOME (
    echo 错误: 未找到 Command Line Tools for HarmonyOS。
    echo 请设置 DEVECO_SDK_HOME 环境变量指向解压目录。
    exit /b 1
)

set "DEVECO_SDK_HOME=%CLT_HOME%"
cd /d "%PROJECT_HOME%"
call "%CLT_HOME%\bin\hvigorw.bat" %*

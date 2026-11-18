@echo off
rem 飞牛移动适配客户端 - Hvigor 构建入口 (项目根, Windows)

setlocal
set "PROJECT_HOME=%~dp0"
call "%PROJECT_HOME%hvigor\hvigorw.bat" %*

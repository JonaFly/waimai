@echo off
setlocal enabledelayedexpansion

:: 外卖账号管理系统 - GitHub推送脚本
:: 此脚本帮助将最新更改推送到GitHub并触发自动构建

:: 颜色设置
set GREEN=[92m
set YELLOW=[93m
set RED=[91m
set NC=[0m

:: 默认值
set COMMIT_MESSAGE=Update application with latest features
set TAG=

:: 解析命令行参数
:parse_args
if "%~1"=="" goto :end_parse_args
if "%~1"=="-m" (
    set COMMIT_MESSAGE=%~2
    shift
    shift
    goto :parse_args
)
if "%~1"=="--message" (
    set COMMIT_MESSAGE=%~2
    shift
    shift
    goto :parse_args
)
if "%~1"=="-t" (
    set TAG=%~2
    shift
    shift
    goto :parse_args
)
if "%~1"=="--tag" (
    set TAG=%~2
    shift
    shift
    goto :parse_args
)
if "%~1"=="-h" (
    goto :show_help
)
if "%~1"=="--help" (
    goto :show_help
)
echo %RED%未知选项: %~1%NC%
goto :show_help

:end_parse_args

:: 确认操作
echo %YELLOW%准备推送到GitHub%NC%
echo 提交信息: %GREEN%%COMMIT_MESSAGE%%NC%
if not "%TAG%"=="" (
    echo 版本标签: %GREEN%%TAG%%NC%
)

set /p CONFIRM=是否继续? (y/n): 
if /i not "%CONFIRM%"=="y" (
    echo %RED%操作已取消%NC%
    goto :eof
)

:: 执行Git操作
echo %YELLOW%添加所有更改...%NC%
git add .

echo %YELLOW%提交更改...%NC%
git commit -m "%COMMIT_MESSAGE%"

echo %YELLOW%推送到远程仓库...%NC%
git push origin

:: 如果指定了标签，则创建并推送标签
if not "%TAG%"=="" (
    echo %YELLOW%创建标签 %TAG%...%NC%
    git tag -a "%TAG%" -m "Release %TAG%"
    
    echo %YELLOW%推送标签...%NC%
    git push origin "%TAG%"
    
    echo %GREEN%标签 %TAG% 已创建并推送%NC%
    echo %YELLOW%GitHub Actions将自动构建并创建新的发布版本%NC%
) else (
    echo %GREEN%更改已推送到GitHub%NC%
    echo %YELLOW%如需触发发布构建，请使用 -t 参数添加版本标签%NC%
)

echo %GREEN%完成!%NC%
goto :eof

:show_help
echo %YELLOW%外卖账号管理系统 - GitHub推送脚本%NC%
echo 用法: %0 [选项]
echo.
echo 选项:
echo   -m, --message    提交信息 (默认: 'Update application with latest features')
echo   -t, --tag        创建新的版本标签 (例如: v1.1.0)
echo   -h, --help       显示此帮助信息
echo.
echo 示例:
echo   %0 -m "修复登录脚本" -t v1.1.0
goto :eof 
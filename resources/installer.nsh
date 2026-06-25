; TieX NSIS 自定义安装脚本
; 设置安装界面语言为简体中文
!include "MUI2.nsh"

; 安装界面设置
!define MUI_ICON "resources\icons\icon.ico"
!define MUI_UNICON "resources\icons\icon.ico"

; 安装完成后的提示
!define MUI_FINISHPAGE_RUN "$INSTDIR\TieX.exe"
!define MUI_FINISHPAGE_RUN_TEXT "启动 TieX"

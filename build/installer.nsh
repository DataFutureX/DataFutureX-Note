; 桌面 / 开始菜单快捷方式显式引用 Logo
!macro customInstall
  ; 优先安装根目录 icon.ico（extraFiles），其次 resources\icon.ico（extraResources）
  StrCpy $0 "$INSTDIR\icon.ico"
  IfFileExists "$0" logo_ok 0
    StrCpy $0 "$INSTDIR\resources\icon.ico"
    IfFileExists "$0" logo_ok 0
      StrCpy $0 "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
  logo_ok:

  ; 桌面：名称「数字未来笔记」+ Logo 图标
  CreateShortCut "$DESKTOP\数字未来笔记.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "" "$0" 0 SW_SHOWNORMAL "" "DataFutureX Note 数字未来笔记"

  ; 开始菜单
  CreateShortCut "$SMPROGRAMS\数字未来笔记.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "" "$0" 0 SW_SHOWNORMAL "" "DataFutureX Note 数字未来笔记"
  CreateShortCut "$SMPROGRAMS\DataFutureX Note.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "" "$0" 0 SW_SHOWNORMAL "" "DataFutureX Note"
  CreateDirectory "$SMPROGRAMS\DataFutureX"
  CreateShortCut "$SMPROGRAMS\DataFutureX\数字未来笔记.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "" "$0" 0 SW_SHOWNORMAL "" "DataFutureX Note 数字未来笔记"
  CreateShortCut "$SMPROGRAMS\DataFutureX\DataFutureX Note.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "" "$0" 0 SW_SHOWNORMAL "" "DataFutureX Note"
!macroend

!macro customUnInstall
  Delete "$DESKTOP\数字未来笔记.lnk"
  Delete "$SMPROGRAMS\数字未来笔记.lnk"
  Delete "$SMPROGRAMS\DataFutureX Note.lnk"
  Delete "$SMPROGRAMS\DataFutureX\数字未来笔记.lnk"
  Delete "$SMPROGRAMS\DataFutureX\DataFutureX Note.lnk"
  RMDir "$SMPROGRAMS\DataFutureX"
!macroend

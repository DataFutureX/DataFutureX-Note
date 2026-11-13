; 自定义 NSIS：安装后用 Logo 图标创建桌面 / 开始菜单快捷方式，便于搜索「数字未来笔记」与 DataFutureX Note
!macro customInstall
  StrCpy $0 "$INSTDIR\resources\icon.ico"
  IfFileExists "$0" +2 0
    StrCpy $0 "$INSTDIR\${APP_EXECUTABLE_FILENAME}"

  ; 桌面
  CreateShortCut "$DESKTOP\数字未来笔记.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "" "$0" 0 SW_SHOWNORMAL "" "DataFutureX Note 数字未来笔记"

  ; 开始菜单（根级，方便 Win 搜索直接命中）
  CreateShortCut "$SMPROGRAMS\数字未来笔记.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "" "$0" 0 SW_SHOWNORMAL "" "DataFutureX Note 数字未来笔记"
  CreateShortCut "$SMPROGRAMS\DataFutureX Note.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "" "$0" 0 SW_SHOWNORMAL "" "DataFutureX Note"

  ; 开始菜单文件夹（程序列表里也能找到）
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

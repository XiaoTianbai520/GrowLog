; NSIS CopyFileW cannot launch an EFS-encrypted uninstaller in its temp folder
; on some Windows configurations (ERROR_ENCRYPTION_FAILED / 6000).
; Reject that installation location; never change encryption on users' folders.
!macro NSIS_HOOK_PREINSTALL
  StrCpy $R8 "$INSTDIR"
  ${Do}
    System::Call 'kernel32::GetFileAttributesW(w "$R8") i .r0'
    ${If} $0 != -1
      IntOp $0 $0 & 0x4000
      ${If} $0 != 0
        MessageBox MB_ICONSTOP|MB_OK "所选程序目录启用了 EFS 文件加密，可能导致卸载器无法启动。请返回选择未加密的程序目录，例如用户 Programs 目录。枝序不会更改文件夹加密设置，笔记仍保存在独立的数据目录。" /SD IDOK
        Abort
      ${EndIf}
      ${Break}
    ${EndIf}
    ${GetParent} "$R8" $R9
    ${If} $R9 == $R8
      ${Break}
    ${EndIf}
    ${If} $R9 == ""
      ${Break}
    ${EndIf}
    StrCpy $R8 $R9
  ${Loop}
!macroend

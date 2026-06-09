; installer.nsh — ADIM D: kurulumda seçilen dili uygulamaya aktar.
; electron-builder NSIS bu makroyu kurulum sırasında çağırır. $LANGUAGE = seçilen dilin LCID.
; Türkçe (tr_TR) = 1055, İngilizce (en_US) = 1033. HKCU\Software\PathOfBerkay\lang = "tr" | "en".
; Uygulama İLK açılışta bu değeri okur (getInstallLang); sonra kullanıcı Ayarlar'dan değiştirebilir.

!macro customInstall
  ${If} $LANGUAGE == 1055
    WriteRegStr HKCU "Software\PathOfBerkay" "lang" "tr"
  ${Else}
    WriteRegStr HKCU "Software\PathOfBerkay" "lang" "en"
  ${EndIf}
!macroend

!macro customUnInstall
  DeleteRegValue HKCU "Software\PathOfBerkay" "lang"
  DeleteRegKey /ifempty HKCU "Software\PathOfBerkay"
!macroend

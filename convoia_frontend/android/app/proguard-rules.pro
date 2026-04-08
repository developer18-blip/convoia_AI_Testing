# ConvoiaAI ProGuard Rules
# Keep Capacitor and WebView classes intact

# Capacitor core
-keep class com.getcapacitor.** { *; }
-keep class * extends com.getcapacitor.Plugin { *; }
-dontwarn com.getcapacitor.**

# WebView JavaScript interface
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# AndroidX
-keep class androidx.** { *; }
-dontwarn androidx.**

# Keep line numbers for crash reporting
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# Keep serializable classes (needed for Capacitor plugin data)
-keepclassmembers class * implements java.io.Serializable {
    static final long serialVersionUID;
    private static final java.io.ObjectStreamField[] serialPersistentFields;
    !static !transient <fields>;
    private void writeObject(java.io.ObjectOutputStream);
    private void readObject(java.io.ObjectInputStream);
}

# Keep Preferences plugin (secure token storage)
-keep class com.capacitorjs.plugins.preferences.** { *; }

# Keep App plugin (deep links)
-keep class com.capacitorjs.plugins.app.** { *; }

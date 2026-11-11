# Android home-screen widget: wiring (after `npx cap add android`)

Not compiled or tested in this repository. Steps in Android Studio:

1. `android/app/build.gradle` dependencies: `implementation "androidx.glance:glance-appwidget:1.1.0"`, and enable Compose
   (`buildFeatures { compose true }` with the Kotlin Compose compiler plugin your Kotlin version needs).
2. Copy `RamadanWidget.kt` to `android/app/src/main/java/com/ramadanstrivers/app/widget/`.
3. `android/app/src/main/res/xml/ramadan_widget_info.xml`:
   ```xml
   <appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
       android:minWidth="180dp" android:minHeight="110dp" android:targetCellWidth="3" android:targetCellHeight="2"
       android:resizeMode="horizontal|vertical" android:updatePeriodMillis="1800000"
       android:initialLayout="@layout/glance_default_loading_layout" android:widgetCategory="home_screen" />
   ```
4. `AndroidManifest.xml`, inside `<application>`:
   ```xml
   <receiver android:name=".widget.RamadanWidgetReceiver" android:exported="true">
       <intent-filter><action android:name="android.appwidget.action.APPWIDGET_UPDATE" /></intent-filter>
       <meta-data android:name="android.appwidget.provider" android:resource="@xml/ramadan_widget_info" />
   </receiver>
   ```
5. `npm i @capacitor/preferences && npx cap sync`. The web app then writes the snapshot whenever progress changes.
   The widget redraws every 30 minutes; to redraw at once after a change, call `RamadanWidget().updateAll(context)`
   from a small Capacitor plugin (optional).

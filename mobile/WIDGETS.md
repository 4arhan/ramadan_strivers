# Widget data contract (phone, watch, home devices)

The web app is the single source of truth. Whenever progress, language or prayer settings change, `js/social.js`
(`pushWidget`) writes one JSON string through **Capacitor Preferences** (`@capacitor/preferences`):

- group `group.com.ramadanstrivers.app`, key `snapshot`
- Android: SharedPreferences file `group.com.ramadanstrivers.app`, key `snapshot`
- iOS: `UserDefaults(suiteName: "group.com.ramadanstrivers.app")`, key `group.com.ramadanstrivers.app.snapshot`
  (the plugin prefixes the key with the group). App and widget extension both need that App Group.

In a browser (no Capacitor) nothing is written; `RS.social.widgetSnapshot()` returns the same object for debugging.

```jsonc
{
  "v": 1, "at": 1773300000000,            // version, time written (epoch ms)
  "lang": "ar", "dir": "rtl",
  "mode": "ramadan",                      // ramadan | prep | year
  "day": 12, "pct": 80, "streak": 5, "pages": 140,
  "title": "Day 12",                      // already translated; outside Ramadan the mode name
  "hijri": "12 Ramadan 1448 AH",          // translated
  "pctText": "80%", "streakText": "5-day streak",
  "fajr": 1773290000000, "maghrib": 1773335000000,     // today, epoch ms (only with a saved location)
  "fajrText": "5:16 AM", "maghribText": "5:02 PM",
  "nextName": "Maghrib", "nextAt": 1773335000000, "nextText": "5:02 PM",
  "labels": { "iftar": "Iftar", "suhoor": "Suhoor ends", "next": "Next prayer", "open": "Ramadan Strivers" }
}
```

Every text is already in the user's language, so native code never translates: it lays values out. No names, no
checklist items, nothing from the journal or sisters' mode is in the snapshot.

| Surface | Source in this folder | Status |
|---|---|---|
| Android home-screen widget | `android-widget/RamadanWidget.kt` + `android-widget/SETUP.md` | written, not compiled here |
| iPhone Home Screen + Lock Screen widgets | `ios-widget/RamadanWidget.swift` | written, not compiled here |
| Apple Watch complications | same Swift file in a watchOS widget target; send the snapshot with WatchConnectivity (`updateApplicationContext`) and store it in the watch's App Group | written, not compiled here |
| Wear OS tile | `wear-os/RamadanTileService.kt` (phone sends the snapshot with the Wearable Data Layer) | written, not compiled here |
| Smart displays, tablets, TVs | the **Home display** in the app (Me → Home display, or `/?tab=display`): cast the tab to a Nest Hub or Chromecast, or open it in the browser of an Echo Show, Fire tablet or TV | built and tested in the web app |

Building the native targets needs Android Studio, Xcode, an Apple developer account and a Google Play account.
None of that can be done from this repository's CI: follow `README.md` in this folder.

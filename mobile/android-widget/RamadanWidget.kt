// Home-screen widget for Android (Jetpack Glance). Copy into android/app/src/main/java/com/ramadanstrivers/app/widget/
// after `npx cap add android`. NOT compiled or tested in this repository: build it in Android Studio.
//
// Data: the web app (js/social.js, pushWidget) writes one JSON string with Capacitor Preferences, group
// "group.com.ramadanstrivers.app", key "snapshot". On Android that is the SharedPreferences file of that name.
// Every text in it is already translated by the web app, so the widget only lays values out (see ../WIDGETS.md).
package com.ramadanstrivers.app.widget

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.action.actionStartActivity
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import com.ramadanstrivers.app.MainActivity
import org.json.JSONObject

const val PREFS = "group.com.ramadanstrivers.app"
const val KEY = "snapshot"

data class Snapshot(
    val title: String, val hijri: String, val pctText: String, val streakText: String, val mode: String,
    val iftarLabel: String, val suhoorLabel: String, val fajrText: String, val maghribText: String,
    val nextName: String, val nextText: String, val nextLabel: String
)

fun readSnapshot(context: Context): Snapshot? {
    val raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, null) ?: return null
    return try {
        val j = JSONObject(raw); val l = j.optJSONObject("labels") ?: JSONObject()
        Snapshot(
            j.optString("title"), j.optString("hijri"), j.optString("pctText"), j.optString("streakText"), j.optString("mode"),
            l.optString("iftar", "Iftar"), l.optString("suhoor", "Suhoor ends"), j.optString("fajrText"), j.optString("maghribText"),
            j.optString("nextName"), j.optString("nextText"), l.optString("next", "Next prayer")
        )
    } catch (e: Exception) { null }
}

class RamadanWidget : GlanceAppWidget() {
    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val s = readSnapshot(context)
        provideContent { Content(s) }
    }

    @Composable
    private fun Content(s: Snapshot?) {
        val ink = ColorProvider(Color(0xFFEEF8F2)); val soft = ColorProvider(Color(0xFFB6CEC3)); val mint = ColorProvider(Color(0xFF6EE7B7))
        Column(
            modifier = GlanceModifier.fillMaxSize().background(Color(0xFF0B2219)).cornerRadius(24.dp).padding(16.dp)
                .clickable(actionStartActivity<MainActivity>())
        ) {
            if (s == null) {
                Text("Ramadan Strivers", style = TextStyle(color = ink, fontSize = 16.sp, fontWeight = FontWeight.Bold))
                return@Column
            }
            Text(s.hijri, style = TextStyle(color = mint, fontSize = 12.sp, fontWeight = FontWeight.Medium), maxLines = 1)
            Row(modifier = GlanceModifier.fillMaxWidth()) {
                Text(s.title, style = TextStyle(color = ink, fontSize = 20.sp, fontWeight = FontWeight.Bold), maxLines = 1, modifier = GlanceModifier.defaultWeight())
                if (s.mode == "ramadan") Text(s.pctText, style = TextStyle(color = ink, fontSize = 20.sp, fontWeight = FontWeight.Bold))
            }
            Spacer(GlanceModifier.height(8.dp))
            if (s.maghribText.isNotEmpty()) Text("${s.iftarLabel}  ${s.maghribText}", style = TextStyle(color = ink, fontSize = 14.sp), maxLines = 1)
            if (s.fajrText.isNotEmpty()) Text("${s.suhoorLabel}  ${s.fajrText}", style = TextStyle(color = soft, fontSize = 13.sp), maxLines = 1)
            if (s.nextName.isNotEmpty()) Text("${s.nextLabel}: ${s.nextName} ${s.nextText}", style = TextStyle(color = soft, fontSize = 13.sp), maxLines = 1)
        }
    }
}

class RamadanWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = RamadanWidget()
}

// Wear OS tile (androidx.wear.tiles + protolayout). NOT compiled or tested in this repository.
// The watch has no access to the phone's SharedPreferences: the phone app must send the snapshot JSON with the Wearable
// Data Layer (DataClient.putDataItem to "/rs/snapshot", field "json") whenever it changes; SnapshotListener below stores
// it on the watch. See ../WIDGETS.md for the JSON. Module: a separate "wear" app module with the same applicationId.
package com.ramadanstrivers.app.wear

import android.content.Context
import androidx.wear.protolayout.ColorBuilders.argb
import androidx.wear.protolayout.LayoutElementBuilders
import androidx.wear.protolayout.ResourceBuilders
import androidx.wear.protolayout.TimelineBuilders
import androidx.wear.tiles.RequestBuilders
import androidx.wear.tiles.TileBuilders
import androidx.wear.tiles.TileService
import com.google.android.gms.wearable.DataEvent
import com.google.android.gms.wearable.DataEventBuffer
import com.google.android.gms.wearable.DataMapItem
import com.google.android.gms.wearable.WearableListenerService
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import org.json.JSONObject

private const val PREFS = "rs_widget"; private const val KEY = "snapshot"

class SnapshotListener : WearableListenerService() {
    override fun onDataChanged(events: DataEventBuffer) {
        for (e in events) if (e.type == DataEvent.TYPE_CHANGED && e.dataItem.uri.path == "/rs/snapshot") {
            val json = DataMapItem.fromDataItem(e.dataItem).dataMap.getString("json") ?: continue
            getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY, json).apply()
            TileService.getUpdater(this).requestUpdate(RamadanTileService::class.java)
        }
    }
}

class RamadanTileService : TileService() {
    private fun text(s: String, size: Float, color: Int) = LayoutElementBuilders.Text.Builder().setText(s)
        .setFontStyle(LayoutElementBuilders.FontStyle.Builder().setSize(androidx.wear.protolayout.DimensionBuilders.sp(size)).setColor(argb(color)).build()).setMaxLines(1).build()

    override fun onTileRequest(request: RequestBuilders.TileRequest): ListenableFuture<TileBuilders.Tile> {
        val raw = getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, null)
        val j = try { JSONObject(raw ?: "{}") } catch (e: Exception) { JSONObject() }
        val labels = j.optJSONObject("labels") ?: JSONObject()
        val col = LayoutElementBuilders.Column.Builder()
            .addContent(text(j.optString("title", "Ramadan Strivers"), 18f, 0xFFEEF8F2.toInt()))
        if (j.optString("mode") == "ramadan") col.addContent(text(j.optString("pctText"), 26f, 0xFF6EE7B7.toInt()))
        if (j.optString("maghribText").isNotEmpty()) col.addContent(text(labels.optString("iftar", "Iftar") + " " + j.optString("maghribText"), 14f, 0xFFB6CEC3.toInt()))
        if (j.optString("nextName").isNotEmpty()) col.addContent(text(j.optString("nextName") + " " + j.optString("nextText"), 14f, 0xFFB6CEC3.toInt()))
        val layout = LayoutElementBuilders.Layout.Builder().setRoot(col.build()).build()
        return Futures.immediateFuture(TileBuilders.Tile.Builder().setResourcesVersion("1").setFreshnessIntervalMillis(15 * 60 * 1000L)
            .setTileTimeline(TimelineBuilders.Timeline.fromLayoutElement(layout.root!!)).build())
    }

    override fun onTileResourcesRequest(request: RequestBuilders.ResourcesRequest): ListenableFuture<ResourceBuilders.Resources> =
        Futures.immediateFuture(ResourceBuilders.Resources.Builder().setVersion("1").build())
}

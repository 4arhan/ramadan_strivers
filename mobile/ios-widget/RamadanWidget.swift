// WidgetKit extension for iPhone (Home Screen small/medium, Lock Screen) and, added to a watchOS target, Apple Watch
// complications. NOT compiled or tested in this repository: add a Widget Extension target in Xcode and use this file.
//
// Data: the web app (js/social.js, pushWidget) writes one JSON string with Capacitor Preferences, group
// "group.com.ramadanstrivers.app", key "snapshot". On iOS the plugin stores it in UserDefaults(suiteName: group) under
// "<group>.snapshot". Both the app and the widget extension need the App Group capability with that identifier.
// Every text is already translated by the web app (see ../WIDGETS.md).
import SwiftUI
import WidgetKit

let group = "group.com.ramadanstrivers.app"

struct Snapshot: Decodable {
    struct Labels: Decodable { var iftar: String?; var suhoor: String?; var next: String? }
    var title: String?; var hijri: String?; var pctText: String?; var streakText: String?; var mode: String?
    var pct: Double?; var fajr: Double?; var maghrib: Double?; var fajrText: String?; var maghribText: String?
    var nextName: String?; var nextAt: Double?; var nextText: String?; var labels: Labels?
}

func loadSnapshot() -> Snapshot? {
    let d = UserDefaults(suiteName: group)
    guard let raw = d?.string(forKey: group + ".snapshot") ?? d?.string(forKey: "snapshot"), let data = raw.data(using: .utf8) else { return nil }
    return try? JSONDecoder().decode(Snapshot.self, from: data)
}

struct Entry: TimelineEntry { let date: Date; let snap: Snapshot? }

struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> Entry { Entry(date: Date(), snap: nil) }
    func getSnapshot(in context: Context, completion: @escaping (Entry) -> Void) { completion(Entry(date: Date(), snap: loadSnapshot())) }
    func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> Void) {
        let entry = Entry(date: Date(), snap: loadSnapshot())
        completion(Timeline(entries: [entry], policy: .after(Date().addingTimeInterval(15 * 60))))
    }
}

struct RamadanWidgetView: View {
    @Environment(\.widgetFamily) var family
    let entry: Entry
    var body: some View {
        let s = entry.snap
        switch family {
        case .accessoryInline:
            Text(inline(s))
        case .accessoryCircular:
            Gauge(value: (s?.pct ?? 0) / 100) { Text(s?.pctText ?? "") }.gaugeStyle(.accessoryCircularCapacity)
        case .accessoryRectangular:
            VStack(alignment: .leading) {
                Text(s?.title ?? "Ramadan Strivers").font(.headline)
                if let m = s?.maghribText, !m.isEmpty { Text("\(s?.labels?.iftar ?? "Iftar") \(m)") }
                if let n = s?.nextName, !n.isEmpty { Text("\(n) \(s?.nextText ?? "")") }
            }
        default:
            VStack(alignment: .leading, spacing: 4) {
                Text(s?.hijri ?? "").font(.caption).foregroundColor(Color(red: 0.43, green: 0.91, blue: 0.72))
                HStack {
                    Text(s?.title ?? "Ramadan Strivers").font(.headline)
                    Spacer()
                    if s?.mode == "ramadan" { Text(s?.pctText ?? "").font(.headline) }
                }
                Spacer(minLength: 2)
                if let m = s?.maghribText, !m.isEmpty { Text("\(s?.labels?.iftar ?? "Iftar")  \(m)").font(.subheadline) }
                if let f = s?.fajrText, !f.isEmpty { Text("\(s?.labels?.suhoor ?? "Suhoor ends")  \(f)").font(.footnote).opacity(0.8) }
                if let at = s?.nextAt, let n = s?.nextName, Date(timeIntervalSince1970: at / 1000) > Date() {
                    HStack(spacing: 4) { Text(n).font(.footnote); Text(Date(timeIntervalSince1970: at / 1000), style: .timer).font(.footnote).monospacedDigit() }.opacity(0.8)
                }
            }
            .foregroundColor(Color(red: 0.93, green: 0.97, blue: 0.95))
        }
    }
    func inline(_ s: Snapshot?) -> String {
        if let m = s?.maghribText, !m.isEmpty { return "\(s?.labels?.iftar ?? "Iftar") \(m)" }
        return s?.title ?? "Ramadan Strivers"
    }
}

@main
struct RamadanWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "RamadanWidget", provider: Provider()) { entry in
            if #available(iOS 17.0, watchOS 10.0, *) {
                RamadanWidgetView(entry: entry).containerBackground(Color(red: 0.04, green: 0.13, blue: 0.10), for: .widget)
            } else {
                RamadanWidgetView(entry: entry).padding().background(Color(red: 0.04, green: 0.13, blue: 0.10))
            }
        }
        .configurationDisplayName("Ramadan Strivers")
        .description("Today's progress, iftar and the next prayer.")
        #if os(watchOS)
        .supportedFamilies([.accessoryInline, .accessoryCircular, .accessoryRectangular])
        #else
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryInline, .accessoryCircular, .accessoryRectangular])
        #endif
    }
}

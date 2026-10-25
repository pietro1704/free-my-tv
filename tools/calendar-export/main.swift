import Cocoa
import EventKit
import CryptoKit
import Darwin
@MainActor final class CalendarExporter {
    let selection: CalendarSelection
    let outputPath: String
    let store = EKEventStore()
    init(selection: CalendarSelection, outputPath: String) {self.selection = selection; self.outputPath = outputPath}
    func write(_ value: [String: Any]) {
        do {
            let data = try JSONSerialization.data(withJSONObject: value, options: [.prettyPrinted, .sortedKeys])
            try data.write(to: URL(fileURLWithPath: outputPath), options: .atomic)
            try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: outputPath)
        } catch {
            FileHandle.standardError.write(Data("Calendar export output unavailable\n".utf8)); exit(1)
        }
        NSApplication.shared.terminate(nil)
    }
    func export(_ granted: Bool) {
        guard granted else { write(["source": "macos_eventkit", "available": false, "error": "calendar_permission", "events": []]); return }
        var calendars: [EKCalendar] = []
        for choice in selection.calendars {
            guard let calendar = store.calendar(withIdentifier: choice.id), CalendarPolicy.accepts(calendar.calendarIdentifier, source: calendar.source.sourceIdentifier, selection: selection) else {
                write(["source": "macos_eventkit", "available": false, "error": "calendar_identity", "events": []]); return
            }
            calendars.append(calendar)
        }
        let now = Date(); let window = CalendarPolicy.window(now)
        let predicate = store.predicateForEvents(withStart: window.0, end: window.1, calendars: calendars)
        let events = store.events(matching: predicate).filter { CalendarPolicy.overlaps(start: $0.startDate, end: $0.endDate, window: window, cancelled: $0.status == .canceled) }.sorted { $0.startDate < $1.startDate }
        let iso = ISO8601DateFormatter()
        let day = DateFormatter(); day.timeZone = TimeZone(identifier: selection.timeZone); day.dateFormat = "yyyy-MM-dd"
        var dayCalendar = Calendar(identifier: .gregorian); dayCalendar.timeZone = day.timeZone
        let time = DateFormatter(); time.timeZone = day.timeZone; time.dateFormat = "HH:mm"
        var seen = Set<String>(), rows: [[String: Any]] = []
        for event in events.prefix(500) {
            guard let choice = selection.calendars.first(where: { $0.id == event.calendar.calendarIdentifier }) else { continue }
            let title = event.title ?? "", start = iso.string(from: event.startDate), end = iso.string(from: event.endDate)
            let identity = "\(title.lowercased())|\(start)|\(end)|\(event.isAllDay)"
            guard !title.isEmpty, seen.insert(identity).inserted else { continue }
            let digest = SHA256.hash(data: Data(identity.utf8)).map { String(format: "%02x", $0) }.joined()
            rows.append(["id": String(digest.prefix(24)), "title": String(title.prefix(300)), "start": start, "end": end, "allDay": event.isAllDay,
                         "kind": choice.kind, "day": day.string(from: max(event.startDate, window.0)), "time": event.isAllDay ? "" : time.string(from: event.startDate)])
        }
        write(["source": "macos_eventkit", "available": true, "timeZone": selection.timeZone, "generatedAt": iso.string(from: now),
               "today": day.string(from: window.0), "tomorrow": day.string(from: dayCalendar.date(byAdding: .day, value: 1, to: window.0)!),
               "kinds": selection.calendars.map(\.kind), "events": rows])
    }
}
umask(0o077)
let args = CommandLine.arguments
func argument(_ flag: String) -> String? {guard let i = args.firstIndex(of: flag), i + 1 < args.count else {return nil}; return args[i + 1]}
guard let selectionPath = argument("--selection"), let outputPath = argument("--output"), selectionPath.hasPrefix("/"), outputPath.hasPrefix("/") else {exit(2)}
let selection: CalendarSelection
do {selection = try JSONDecoder().decode(CalendarSelection.self, from: Data(contentsOf: URL(fileURLWithPath: selectionPath)))} catch {exit(2)}
guard CalendarPolicy.valid(selection) else {exit(2)}
let app = NSApplication.shared; app.setActivationPolicy(.accessory)
let exporter = CalendarExporter(selection: selection, outputPath: outputPath)
if #available(macOS 14.0, *) {
    exporter.store.requestFullAccessToEvents {granted, _ in DispatchQueue.main.async {exporter.export(granted)}}
} else {
    exporter.store.requestAccess(to: .event) {granted, _ in DispatchQueue.main.async {exporter.export(granted)}}
}
app.run()

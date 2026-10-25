import Foundation
@main struct CalendarPolicyTests {
    static func main() {
        let primary = CalendarChoice(id: "primary", sourceId: "own-google", kind: "primary")
        let good = CalendarSelection(timeZone: "America/Sao_Paulo", calendars: [primary, CalendarChoice(id: "f1", sourceId: "own-google", kind: "f1")])
        precondition(CalendarPolicy.valid(good)); precondition(CalendarPolicy.accepts("primary", source: "own-google", selection: good))
        precondition(!CalendarPolicy.accepts("primary", source: "other-google", selection: good)); precondition(!CalendarPolicy.accepts("missing", source: "own-google", selection: good))
        precondition(!CalendarPolicy.valid(CalendarSelection(timeZone: "UTC", calendars: [primary])))
        precondition(!CalendarPolicy.valid(CalendarSelection(timeZone: good.timeZone, calendars: [primary, primary])))
        precondition(!CalendarPolicy.valid(CalendarSelection(timeZone: good.timeZone, calendars: [])))
        let iso = ISO8601DateFormatter(), now = iso.date(from: "2026-10-25T02:30:00Z")!, window = CalendarPolicy.window(now)
        precondition(iso.string(from: window.0) == "2026-10-24T03:00:00Z"); precondition(iso.string(from: window.1) == "2026-10-26T03:00:00Z")
        precondition(CalendarPolicy.overlaps(start: window.0.addingTimeInterval(-10), end: window.0.addingTimeInterval(10), window: window))
        precondition(!CalendarPolicy.overlaps(start: window.1, end: window.1.addingTimeInterval(10), window: window))
        precondition(!CalendarPolicy.overlaps(start: window.0.addingTimeInterval(-10), end: window.0, window: window))
        precondition(!CalendarPolicy.overlaps(start: window.0, end: window.1, window: window, cancelled: true))
        print("PASS: selection, account identity, São Paulo midnight, cross-day and excluded boundary events")
    }
}

import Foundation
struct CalendarSelection: Codable, Sendable { let timeZone: String; let calendars: [CalendarChoice] }
struct CalendarChoice: Codable, Sendable { let id: String; let sourceId: String; let kind: String }
enum CalendarPolicy {
    static func valid(_ selection: CalendarSelection) -> Bool {
        let kinds = Set(["primary", "holiday", "moon", "f1"])
        return selection.timeZone == "America/Sao_Paulo" && !selection.calendars.isEmpty && selection.calendars.count <= 8 &&
            selection.calendars.filter({ $0.kind == "primary" }).count == 1 &&
            Set(selection.calendars.map(\.id)).count == selection.calendars.count &&
            selection.calendars.allSatisfy { !$0.id.isEmpty && !$0.sourceId.isEmpty && kinds.contains($0.kind) }
    }
    static func accepts(_ id: String, source: String, selection: CalendarSelection) -> Bool {
        valid(selection) && selection.calendars.contains { $0.id == id && $0.sourceId == source }
    }
    static func window(_ now: Date) -> (Date, Date) {
        var calendar = Calendar(identifier: .gregorian); calendar.timeZone = TimeZone(identifier: "America/Sao_Paulo")!
        let start = calendar.startOfDay(for: now)
        return (start, calendar.date(byAdding: .day, value: 2, to: start)!)
    }
    static func overlaps(start: Date, end: Date, window: (Date, Date), cancelled: Bool = false) -> Bool { !cancelled && end > window.0 && start < window.1 && end >= start }
}

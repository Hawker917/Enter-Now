import Foundation
import UserNotifications

final class NotificationManager {
    static let shared = NotificationManager()
    private let center = UNUserNotificationCenter.current()
    private let prefix = "enter-now-cue-"
    private let maxScheduledCues = 60

    private init() {}

    func requestAuthorization() {
        center.requestAuthorization(options: [.alert, .sound, .badge]) { _, _ in }
    }

    func startSession(minMinutes: Double, maxMinutes: Double) {
        center.removeAllPendingNotificationRequests()
        center.setBadgeCount(0)

        var offset = TimeInterval.random(in: minMinutes * 60...maxMinutes * 60)
        var index = 0

        while index < maxScheduledCues {
            let content = UNMutableNotificationContent()
            content.title = "Enter Now"
            content.body = "Return to the present."
            content.sound = .default
            content.badge = NSNumber(value: index + 1)

            let trigger = UNTimeIntervalNotificationTrigger(timeInterval: max(1, offset), repeats: false)
            let request = UNNotificationRequest(
                identifier: prefix + String(index),
                content: content,
                trigger: trigger
            )

            center.add(request)
            index += 1
            offset += TimeInterval.random(in: minMinutes * 60...maxMinutes * 60)
        }
    }

    func endSession() {
        center.removeAllPendingNotificationRequests()
        center.setBadgeCount(0)
    }
}

import Foundation
import SwiftUI

@MainActor
final class CueEngine: ObservableObject {
    @Published private(set) var isRunning = false
    @Published private(set) var cueCount = 0
    @Published private(set) var status = "Ready"
    @Published private(set) var elapsedText = "00:00:00"

    private var startedAt: Date?
    private var elapsedBeforeStart: TimeInterval = 0
    private var clockTimer: Timer?

    func startSession() {
        guard !isRunning else { return }
        isRunning = true
        cueCount = 0
        elapsedBeforeStart = 0
        startedAt = Date()
        status = "Session running"
        startClock()
        NotificationManager.shared.startSession(minMinutes: 5, maxMinutes: 15)
    }

    func endSession() {
        isRunning = false
        clockTimer?.invalidate()
        clockTimer = nil
        status = "Session ended"
        updateClock()
        NotificationManager.shared.endSession()
    }

    private func startClock() {
        clockTimer?.invalidate()
        clockTimer = Timer.scheduledTimer(withTimeInterval: 0.25, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.updateClock() }
        }
        updateClock()
    }

    private func updateClock() {
        guard isRunning, let startedAt else { return }
        let seconds = max(0, Int(elapsedBeforeStart + Date().timeIntervalSince(startedAt)))
        elapsedText = String(format: "%02d:%02d:%02d", seconds / 3600, (seconds % 3600) / 60, seconds % 60)
    }
}

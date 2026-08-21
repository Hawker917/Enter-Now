import AVFoundation
import Foundation

@MainActor
final class BackgroundCueEngine: NSObject, ObservableObject {
    @Published private(set) var isRunning = false
    @Published private(set) var cueCount = 0
    @Published private(set) var elapsedText = "00:00:00"
    @Published private(set) var statusText = "Ready"

    private var startedAt: Date?
    private var elapsedBeforeStart: TimeInterval = 0
    private var timer: Timer?
    private var cueTask: Task<Void, Never>?
    private var audioPlayer: AVAudioPlayer?

    private let minInterval: TimeInterval = 5 * 60
    private let maxInterval: TimeInterval = 15 * 60

    func startSession() {
        guard !isRunning else { return }

        configureAudioSession()
        prepareBeepBoop()

        isRunning = true
        cueCount = 0
        elapsedBeforeStart = 0
        startedAt = Date()
        statusText = "Session running"

        timer?.invalidate()
        timer = Timer.scheduledTimer(withTimeInterval: 0.25, repeats: true) { [weak self] _ in
            guard let self else { return }
            Task { @MainActor in self.updateElapsed() }
        }

        scheduleNextCue()
    }

    func endSession() {
        isRunning = false
        cueTask?.cancel()
        cueTask = nil
        timer?.invalidate()
        timer = nil
        statusText = "Session ended"
        updateElapsed()

        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    private func updateElapsed() {
        guard isRunning, let startedAt else { return }
        elapsedText = formatElapsed(elapsedBeforeStart + Date().timeIntervalSince(startedAt))
    }

    private func scheduleNextCue() {
        cueTask?.cancel()

        let delay = Double.random(in: minInterval...maxInterval)
        cueTask = Task { [weak self] in
            do {
                try await Task.sleep(for: .seconds(delay))
            } catch {
                return
            }

            guard !Task.isCancelled else { return }
            await MainActor.run {
                guard let self, self.isRunning else { return }
                self.fireCue()
                self.scheduleNextCue()
            }
        }
    }

    private func fireCue() {
        cueCount += 1
        playBeepBoop()
        statusText = "Present"
    }

    private func configureAudioSession() {
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.playback, mode: .default, options: [.allowBluetooth, .allowBluetoothA2DP])
            try session.setActive(true)
        } catch {
            statusText = "Audio unavailable"
        }
    }

    private func prepareBeepBoop() {
        guard let url = Bundle.main.url(forResource: "beep-boop", withExtension: "wav") else { return }
        audioPlayer = try? AVAudioPlayer(contentsOf: url)
        audioPlayer?.prepareToPlay()
    }

    private func playBeepBoop() {
        audioPlayer?.currentTime = 0
        audioPlayer?.play()
    }

    private func formatElapsed(_ seconds: TimeInterval) -> String {
        let total = max(0, Int(seconds))
        return String(format: "%02d:%02d:%02d", total / 3600, (total % 3600) / 60, total % 60)
    }
}

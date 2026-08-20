import SwiftUI
import UserNotifications

@main
struct EnterNowApp: App {
    @StateObject private var engine = CueEngine()

    init() {
        NotificationManager.shared.requestAuthorization()
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(engine)
        }
    }
}

struct ContentView: View {
    @EnvironmentObject private var engine: CueEngine

    var body: some View {
        ZStack {
            Color(.systemBackground).ignoresSafeArea()
            VStack(spacing: 18) {
                Text("Enter Now")
                    .font(.system(size: 38, weight: .bold, design: .rounded))
                Text(engine.status)
                    .font(.caption.weight(.semibold))
                    .textCase(.uppercase)
                    .foregroundStyle(.secondary)
                Text(engine.elapsedText)
                    .font(.system(size: 42, weight: .regular, design: .monospaced))
                    .monospacedDigit()
                Text("ENTER NOW CUES")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Text("\(engine.cueCount)")
                    .font(.system(size: 56, weight: .bold, design: .rounded))
                Text("Your phone can be locked while the reminders continue.")
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal)
                Button(engine.isRunning ? "End Session" : "Start Session") {
                    engine.isRunning ? engine.endSession() : engine.startSession()
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
            }
            .padding(28)
        }
    }
}

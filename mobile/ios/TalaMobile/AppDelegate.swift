import UIKit

@main
class AppDelegate: UIResponder, UIApplicationDelegate, RNAppAuthAuthorizationFlowManager {
  weak var authorizationFlowManagerDelegate: RNAppAuthAuthorizationFlowManagerDelegate?

  func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
    authorizationFlowManagerDelegate?.resumeExternalUserAgentFlow(with: url) ?? false
  }
  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    true
  }
}

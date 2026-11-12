// Classify the device, not the window width: a narrow desktop window is still
// a computer, and an iPad using a desktop user agent is still a mobile device.
export function teamDeviceKind() {
  return navigator.userAgentData?.mobile === true ||
    /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
    ? "mobile"
    : "desktop";
}

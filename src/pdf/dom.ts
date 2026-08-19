type ObsidianWindowHost = Window & {
  activeDocument?: Document;
  activeWindow?: Window;
};

export function getActiveDocument(): Document {
  const host = window as ObsidianWindowHost;
  return host.activeDocument ?? host.activeWindow?.document ?? document;
}

export function getActiveWindow(): Window {
  const host = window as ObsidianWindowHost;
  return host.activeWindow ?? getActiveDocument().defaultView ?? window;
}

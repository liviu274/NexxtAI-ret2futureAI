import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LivenessCapture, cameraError } from "@/components/dosar/LivenessCapture";

const setSecure = (value: boolean) => Object.defineProperty(window, "isSecureContext", { value, configurable: true });
const setCamera = (getUserMedia?: () => Promise<MediaStream>) =>
  Object.defineProperty(navigator, "mediaDevices", { value: getUserMedia ? { getUserMedia } : undefined, configurable: true });
afterEach(() => { vi.restoreAllMocks(); setCamera(undefined); });

describe("Face check camera", () => {
  it("explains that the camera needs https or localhost", async () => {
    setSecure(false); setCamera(() => Promise.reject(new Error("never called")));
    render(<LivenessCapture onCaptured={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Pornește camera/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/https/);
    expect(screen.getByRole("button", { name: /Încarcă o fotografie/ })).toBeInTheDocument();
  });

  it.each([["NotAllowedError", /permis accesul/], ["NotFoundError", /nicio cameră/], ["NotReadableError", /altă aplicație/]])("says why the camera did not start: %s", (name, text) => {
    expect(cameraError(new DOMException("x", name))).toMatch(text);
  });

  it("keeps the camera on and lets the client take the photo when the face model cannot load", async () => {
    setSecure(true);
    const stop = vi.fn();
    const stream = { getTracks: () => [{ stop }] } as unknown as MediaStream;
    setCamera(() => Promise.resolve(stream));
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    render(<LivenessCapture onCaptured={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Pornește camera/ }));
    // The CDN model cannot load in the test runner, exactly like a blocked CDN or a machine without WebGL.
    expect(await screen.findByRole("button", { name: /Fă fotografia/ }, { timeout: 25_000 })).toBeInTheDocument();
    const video = document.querySelector("video") as HTMLVideoElement;
    expect(video.srcObject).toBe(stream);
    expect(video.className).not.toContain("hidden");
    await waitFor(() => expect(stop).not.toHaveBeenCalled());
  }, 30_000);
});

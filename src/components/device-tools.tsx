"use client";
import { useEffect, useRef, useState } from "react";
import { Camera, Download } from "lucide-react";
import { Button } from "./ui/button";
import { toast } from "sonner";

interface InstallEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}
export function InstallApp() {
  const [prompt, setPrompt] = useState<InstallEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  useEffect(() => {
    setInstalled(matchMedia("(display-mode: standalone)").matches);
    const offer = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallEvent);
    };
    const done = () => {
      setInstalled(true);
      setPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", offer);
    window.addEventListener("appinstalled", done);
    return () => {
      window.removeEventListener("beforeinstallprompt", offer);
      window.removeEventListener("appinstalled", done);
    };
  }, []);
  if (installed) return null;
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={async () => {
        if (prompt) {
          await prompt.prompt();
          await prompt.userChoice;
          setPrompt(null);
        } else
          toast.info("Install SP Plast OS", {
            description:
              "On iPhone, use Safari → Share → Add to Home Screen. On Android or desktop, choose Install app from the browser menu. Open online once before working offline.",
          });
      }}
    >
      <Download size={16} /> Install app
    </Button>
  );
}

type Detector = {
  detect(video: HTMLVideoElement): Promise<{ rawValue: string }[]>;
};
export function QRScanner({ onCode }: { onCode: (code: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [active, setActive] = useState(false);
  const [error, setError] = useState("");
  const onResult = useRef(onCode);
  useEffect(() => {
    onResult.current = onCode;
  }, [onCode]);
  useEffect(() => {
    if (!active) return;
    let stopped = false;
    let stream: MediaStream | undefined;
    let timer: ReturnType<typeof setTimeout>;
    const start = async () => {
      try {
        const Constructor = (
          window as unknown as {
            BarcodeDetector?: new (config: { formats: string[] }) => Detector;
          }
        ).BarcodeDetector;
        if (!Constructor)
          throw new Error(
            "Camera QR reading is not supported here. Enter the printed lot or bag code in search.",
          );
        const detector = new Constructor({ formats: ["qr_code"] });
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (stopped) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        if (!video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        const scan = async () => {
          if (stopped || !video.current) return;
          try {
            const codes = await detector.detect(video.current);
            if (codes[0]) {
              onResult.current(codes[0].rawValue);
              setActive(false);
              return;
            }
          } catch {
            /* A frame may not be ready yet. */
          }
          timer = setTimeout(() => void scan(), 350);
        };
        void scan();
      } catch (e) {
        setError((e as Error).message);
        setActive(false);
      }
    };
    void start();
    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [active]);
  return (
    <div className="stack">
      <Button
        variant="outline"
        onClick={() => {
          setError("");
          setActive(!active);
        }}
      >
        <Camera size={16} />
        {active ? "Stop camera" : "Scan QR label"}
      </Button>
      {active && (
        <video
          ref={video}
          muted
          playsInline
          aria-label="QR scanner camera"
          style={{ width: "100%", maxHeight: 300, borderRadius: 12 }}
        />
      )}
      {error && (
        <p role="status" className="small">
          {error}
        </p>
      )}
    </div>
  );
}

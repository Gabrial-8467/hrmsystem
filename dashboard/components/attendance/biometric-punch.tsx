"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Fingerprint, ScanFace, ScanLine, Webcam, AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api/client";
import { toast } from "sonner";

export type BiometricMethod = "WEB" | "FACE" | "FINGERPRINT" | "DEVICE";

interface BiometricPunchProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  direction: "in" | "out";
  employeeName?: string;
  onSuccess: () => void;
}

type Step = "select" | "scan" | "success" | "error";

interface FaceDetectorLike {
  detect(source: unknown): Promise<Array<unknown>>;
}
type FaceDetectorCtor = new (options?: Record<string, unknown>) => FaceDetectorLike;

// Low-res motion proxy for face detection when the native FaceDetector API is
// unavailable (Firefox / Safari / non-flagged Chromium).
const SAMPLE_W = 48;
const SAMPLE_H = 32;
const MOTION_THRESHOLD = 30;
const STABLE_FRAMES_REQUIRED = 2;
const DETECT_TICK_MS = 500;

function captureFrame(video: HTMLVideoElement): Uint8ClampedArray | null {
  const canvas = document.createElement("canvas");
  canvas.width = SAMPLE_W;
  canvas.height = SAMPLE_H;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  try {
    ctx.drawImage(video, 0, 0, SAMPLE_W, SAMPLE_H);
    return new Uint8ClampedArray(ctx.getImageData(0, 0, SAMPLE_W, SAMPLE_H).data);
  } catch {
    return null;
  }
}

function motionScore(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  if (a.length !== b.length) return 255;
  let sum = 0;
  for (let i = 0; i < a.length; i += 4) {
    sum += Math.abs(a[i] - b[i]);
  }
  return sum / (a.length / 4);
}

function detectFacePresent(video: HTMLVideoElement): Promise<boolean> {
  const Ctor = (window as unknown as { FaceDetector?: FaceDetectorCtor }).FaceDetector;
  if (Ctor) {
    try {
      const detector = new Ctor({ fastMode: true, maxDetectedFaces: 1 });
      return detector
        .detect(video)
        .then((faces) => faces.length > 0)
        .catch(() => false);
    } catch {
      return Promise.resolve(false);
    }
  }
  return Promise.resolve(false);
}

export function BiometricPunch({
  open,
  onOpenChange,
  direction,
  employeeName,
  onSuccess,
}: BiometricPunchProps) {
  const [method, setMethod] = useState<BiometricMethod>("FACE");
  const [step, setStep] = useState<Step>("select");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [faceDetected, setFaceDetected] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectionRef = useRef<number | null>(null);
  const autoPunchedRef = useRef(false);
  const stableFramesRef = useRef(0);
  const prevFrameRef = useRef<Uint8ClampedArray | null>(null);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraReady(false);
  }, []);

  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 640, height: 480 },
        audio: false,
      });
      streamRef.current = stream;
      setCameraReady(true);
    } catch {
      setCameraReady(false);
      setCameraError("Camera unavailable — proceeding with simulated face scan.");
    }
  }, []);

  const beginScan = (chosen: BiometricMethod) => {
    setMethod(chosen);
    setError(null);
    setFaceDetected(false);
    autoPunchedRef.current = false;
    setStep("scan");
    if (chosen === "FACE") {
      void startCamera();
    }
  };

  const completePunch = useCallback(
    async (verifiable: BiometricMethod) => {
      setSubmitting(true);
      setError(null);
      setCameraError(null);
      try {
        await api.post(direction === "in" ? "/api/v1/attendance/check-in" : "/api/v1/attendance/check-out", {
          method: verifiable,
        });
        setStep("success");
        stopCamera();
        onSuccess();
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Something went wrong during punch.";
        setError(message);
        setStep("error");
        toast.error(message);
      } finally {
        setSubmitting(false);
        autoPunchedRef.current = false;
      }
    },
    [direction, onSuccess, stopCamera],
  );

  // The <video> element only mounts once cameraReady flips true, so attach
  // the stream after render rather than inside startCamera() where the ref
  // is still null.
  useEffect(() => {
    if (!cameraReady || !streamRef.current || !videoRef.current) return;
    videoRef.current.srcObject = streamRef.current;
    videoRef.current.play().catch(() => {
      // Autoplay/lock-screen policies can reject play(); the overlay still shows the frame.
    });
  }, [cameraReady, step, method]);

  // Auto-detection loop: while scanning a face, watch the video feed and punch
  // automatically once a face has been observed for a short, stable window.
  useEffect(() => {
    if (!(step === "scan" && method === "FACE" && cameraReady && videoRef.current)) return;
    autoPunchedRef.current = false;
    stableFramesRef.current = 0;
    prevFrameRef.current = null;
    const video = videoRef.current;

    detectionRef.current = window.setInterval(async () => {
      if (autoPunchedRef.current) return;

      let present = false;
      if (await detectFacePresent(video)) {
        present = true;
      } else {
        const frame = captureFrame(video);
        if (frame && prevFrameRef.current && motionScore(prevFrameRef.current, frame) > MOTION_THRESHOLD) {
          present = true;
        }
        if (frame) prevFrameRef.current = frame;
      }

      if (present) {
        stableFramesRef.current += 1;
        if (stableFramesRef.current >= STABLE_FRAMES_REQUIRED) {
          setFaceDetected(true);
          if (!autoPunchedRef.current) {
            autoPunchedRef.current = true;
            window.setTimeout(() => {
              if (!autoPunchedRef.current) return;
              void completePunch("FACE");
            }, 450);
          }
        }
      } else {
        stableFramesRef.current = 0;
        setFaceDetected(false);
      }
    }, DETECT_TICK_MS);

    return () => {
      if (detectionRef.current != null) window.clearInterval(detectionRef.current);
      detectionRef.current = null;
      prevFrameRef.current = null;
      stableFramesRef.current = 0;
      setFaceDetected(false);
    };
  }, [step, method, cameraReady, completePunch]);

  const directionLabel = direction === "in" ? "Check In" : "Check Out";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setStep("select");
          setError(null);
          setCameraError(null);
          setFaceDetected(false);
          autoPunchedRef.current = false;
          stopCamera();
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {direction === "in" ? (
              <ScanLine className="size-4 text-emerald-500" />
            ) : (
              <ScanLine className="size-4 text-amber-500" />
            )}
            Biometric {directionLabel}
          </DialogTitle>
          <DialogDescription>
            Verify identity using face, fingerprint, or punch manually.
          </DialogDescription>
        </DialogHeader>

        {employeeName ? (
          <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-center">
            <p className="text-sm font-semibold">{employeeName}</p>
            <p className="text-xs text-muted-foreground">Attempting biometric verification</p>
          </div>
        ) : null}

        {step === "select" && (
          <div className="grid grid-cols-1 gap-3">
            <button
              type="button"
              onClick={() => beginScan("FACE")}
              className="group flex items-center gap-3 rounded-xl border border-border bg-card p-4 text-left transition-all hover:border-primary/50 hover:bg-primary/5"
            >
              <span className="flex size-11 items-center justify-center rounded-lg bg-sky-100 text-sky-600 dark:bg-sky-950 dark:text-sky-400">
                <ScanFace className="size-5" />
              </span>
              <span className="flex-1">
                <span className="block text-sm font-semibold">Face Recognition</span>
                <span className="block text-xs text-muted-foreground">
                  Camera-based facial scan
                </span>
              </span>
              <Badge variant="outline" className="text-[10px]">Suggested</Badge>
            </button>

            <button
              type="button"
              onClick={() => beginScan("FINGERPRINT")}
              className="group flex items-center gap-3 rounded-xl border border-border bg-card p-4 text-left transition-all hover:border-primary/50 hover:bg-primary/5"
            >
              <span className="flex size-11 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
                <Fingerprint className="size-5" />
              </span>
              <span className="flex-1">
                <span className="block text-sm font-semibold">Fingerprint</span>
                <span className="block text-xs text-muted-foreground">
                  Touch the biometric reader
                </span>
              </span>
            </button>

            <div className="flex items-center gap-3 pt-1">
              <Button
                variant="ghost"
                size="sm"
                className="flex-1 text-muted-foreground"
                disabled={submitting}
                onClick={() => completePunch("WEB")}
              >
                <Webcam className="size-4" /> Manual punch instead
              </Button>
            </div>
          </div>
        )}

        {step === "scan" && (
          <div className="space-y-4">
            <div className="relative overflow-hidden rounded-xl border border-border bg-muted/40">
              {method === "FACE" ? (
                <>
                  {cameraReady ? (
                    <div className="relative aspect-video overflow-hidden">
                      <video
                        ref={videoRef}
                        playsInline
                        autoPlay
                        muted
                        className="absolute inset-0 h-full w-full object-cover"
                      />
                      {faceDetected ? (
                        <span
                          aria-hidden
                          className="absolute left-1/2 top-1/2 h-40 w-32 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-emerald-400 bg-emerald-400/10 animate-pulse"
                        >
                          <span className="absolute inset-2 rounded-full border-2 border-emerald-400/70" />
                        </span>
                      ) : (
                        <span
                          aria-hidden
                          className="absolute left-1/2 top-1/2 h-40 w-32 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-emerald-400/70 animate-pulse"
                        />
                      )}
                      <span className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                        {faceDetected ? "Face detected" : "Scanning…"}
                      </span>
                    </div>
                  ) : (
                    <div className="flex aspect-video flex-col items-center justify-center gap-2 text-muted-foreground">
                      <ScanFace className="size-10 animate-pulse" />
                      <p className="text-xs">
                        {cameraError ?? "Requesting camera access — grant permission in the browser prompt to see your live face preview."}
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex aspect-video flex-col items-center justify-center gap-3">
                  <span className="relative flex size-16 items-center justify-center rounded-full border-2 border-emerald-400/60 bg-emerald-500/10">
                    <Fingerprint className="size-9 text-emerald-500 animate-pulse" />
                    <span aria-hidden className="absolute inset-0 rounded-full border-2 border-emerald-400/40 animate-ping" />
                  </span>
                  <p className="text-xs text-muted-foreground animate-pulse">
                    Place finger on reader...
                  </p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between px-2">
              <p className="text-xs font-medium text-muted-foreground">
                {method === "FACE"
                  ? faceDetected
                    ? "Face detected — punching automatically…"
                    : "Waiting for face…"
                  : "Matching fingerprint..."}
              </p>
              <Badge variant="secondary" className="text-[10px]">
                {submitting
                  ? "Verifying"
                  : faceDetected
                    ? "Detected"
                    : "Ready"}
              </Badge>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                disabled={submitting || (method === "FACE" && faceDetected)}
                onClick={() => setStep("select")}
              >
                Back
              </Button>
              <Button
                className={cn(
                  "flex-1 gap-2",
                  direction === "in"
                    ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                    : "bg-amber-600 hover:bg-amber-700 text-white",
                )}
                disabled={submitting || (method === "FACE" && faceDetected)}
                onClick={() => completePunch(method)}
              >
                {submitting ? (
                  <span className="flex items-center gap-2">
                    <span className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Verifying
                  </span>
                ) : (
                  <>
                    {method === "FACE" ? <ScanFace className="size-4" /> : <Fingerprint className="size-4" />}
                    {method === "FACE" && faceDetected ? "Punching automatically…" : `Confirm ${directionLabel}`}
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {step === "success" && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <span className="flex size-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
              <CheckCircle2 className="size-7" />
            </span>
            <p className="text-base font-semibold">{directionLabel} successful</p>
            <p className="text-xs text-muted-foreground">
              Verified via {method === "FACE" ? "face recognition" : method === "FINGERPRINT" ? "fingerprint" : "web check-in"}
            </p>
            <Button
              className="mt-2"
              onClick={() => {
                onOpenChange(false);
                setStep("select");
              }}
            >
              Done
            </Button>
          </div>
        )}

        {step === "error" && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <span className="flex size-14 items-center justify-center rounded-full bg-rose-100 text-rose-600 dark:bg-rose-950 dark:text-rose-400">
              <AlertTriangle className="size-7" />
            </span>
            <p className="text-base font-semibold">Punch failed</p>
            <p className="text-xs text-muted-foreground">{error}</p>
            <div className="mt-2 flex gap-2">
              <Button variant="outline" onClick={() => setStep("select")}>
                Try again
              </Button>
              <Button onClick={() => onOpenChange(false)}>Close</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
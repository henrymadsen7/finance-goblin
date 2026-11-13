import { useEffect, useRef, useState } from "react";
import { request } from "./types";
export default function useVoiceDraft(
  scope: string,
  open: boolean,
  setMessage: React.Dispatch<React.SetStateAction<string>>,
  setError: (error: string) => void,
) {
  const [starting, setStarting] = useState(false);
  const generation = useRef(0);
  const [recording, setRecording] = useState(false),
    [transcribing, setTranscribing] = useState(false),
    [seconds, setSeconds] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null),
    stream = useRef<MediaStream | null>(null),
    discard = useRef(false),
    timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const stop = () => {
    if (recorder.current?.state === "recording") recorder.current.stop();
    stream.current?.getTracks().forEach((t) => t.stop());
    if (timer.current) clearInterval(timer.current);
    setRecording(false);
  };
  const cancel = () => {
    generation.current++;
    discard.current = true;
    stop();
  };
  useEffect(() => {
    if (!open) cancel();
    return () => {
      generation.current++;
      discard.current = true;
      recorder.current?.state === "recording" && recorder.current.stop();
      stream.current?.getTracks().forEach((t) => t.stop());
      if (timer.current) clearInterval(timer.current);
    };
  }, [open, scope]);
  const start = async () => {
    const turn = ++generation.current;
    setStarting(true);
    try {
      setError("");
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder)
        throw Error(
          "Microphone recording is unavailable in this browser. Open the desktop app.",
        );
      const audio = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      if (turn !== generation.current) {
        audio.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = audio;
      const mime = [
        "audio/webm;codecs=opus",
        "audio/ogg;codecs=opus",
        "audio/mp4",
      ].find((m) => MediaRecorder.isTypeSupported(m));
      if (!mime) throw Error("No supported recording format.");
      const rec = new MediaRecorder(audio, { mimeType: mime });
      recorder.current = rec;
      discard.current = false;
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      rec.onstop = async () => {
        audio.getTracks().forEach((t) => t.stop());
        if (timer.current) clearInterval(timer.current);
        setRecording(false);
        if (discard.current) return;
        setTranscribing(true);
        try {
          const blob = new Blob(chunks, { type: mime });
          if (blob.size > 3000000)
            throw Error("Recording is too large. Try a shorter message.");
          const base64 = await new Promise<string>((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(String(r.result).split(",")[1]);
            r.onerror = reject;
            r.readAsDataURL(blob);
          });
          const r = await request<{ text: string }>(
            `/api/assistant/${scope}/transcribe`,
            { base64, mime: mime.split(";")[0] },
          );
          if (!discard.current) {
            if (!r.text.trim())
              throw Error(
                "No speech detected. Try again closer to the microphone.",
              );
            setMessage((previous) =>
              [previous.trim(), r.text].filter(Boolean).join(" "),
            );
          }
        } catch (e) {
          if (!discard.current)
            setError(e instanceof Error ? e.message : String(e));
        } finally {
          setTranscribing(false);
        }
      };
      rec.onerror = () => {
        cancel();
        setError("Recording interrupted. Try again.");
      };
      rec.start();
      setRecording(true);
      setSeconds(0);
      const began = Date.now();
      timer.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - began) / 1000);
        setSeconds(elapsed);
        if (elapsed >= 60) stop();
      }, 250);
    } catch (e) {
      stream.current?.getTracks().forEach((t) => t.stop());
      if (turn === generation.current)
        setError(e instanceof Error ? e.message : String(e));
    } finally {
      setStarting(false);
    }
  };
  return {
    recording,
    starting,
    transcribing,
    seconds,
    start,
    stop,
    cancel,
    active: starting || recording || transcribing,
  };
}

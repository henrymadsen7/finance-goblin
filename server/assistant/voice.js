import { spawn } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
export function transcribeVoice(base64, location) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      join(location, "venv/bin/python"),
      [join(dirname(fileURLToPath(import.meta.url)), "transcribe.py")],
      {
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, HF_HUB_OFFLINE: "1" },
      },
    );
    let output = "",
      settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      error ? reject(error) : resolve(value);
    };
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      finish(Error("Transcription timed out. Try a shorter recording."));
    }, 90000);
    child.stdout.on("data", (d) => {
      output += d;
      if (output.length > 100000) {
        child.kill();
        finish(Error("Transcription exceeded the limit."));
      }
    });
    child.stderr.resume();
    child.on("error", () =>
      finish(Error("Local speech runtime is unavailable.")),
    );
    child.on("close", (code) => {
      try {
        const data = JSON.parse(output);
        if (code || data.error)
          throw Error(data.error || "Transcription failed.");
        finish(null, data);
      } catch (e) {
        finish(e);
      }
    });
    child.stdin.on("error", () => {});
    child.stdin.end(JSON.stringify({ base64 }));
  });
}
